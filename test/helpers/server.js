"use strict";

/**
 * Test harness: boots `server/app.js` as a child process against a throwaway
 * SQLite database, then talks to it over HTTP.
 *
 * Why a child process and not `require("../server/app")`?
 * `server/app.js` calls `app.listen()` unconditionally at module load, so it
 * cannot be imported without binding a port. Spawning it keeps this test suite
 * free of any production-code change: the boot path under test is byte-for-byte
 * the one that runs in production.
 *
 * SAFETY RULES enforced here (do not relax):
 *  - Every server gets a brand-new DB file inside the OS temp dir, named
 *    `atex-test-*.sqlite`. `assertDisposableDbPath()` refuses anything else, so
 *    the real `server/data.sqlite` can never be opened or deleted by a test.
 *  - `CONTACT_EMAIL_FORWARD_ENABLED=false` by default, so no test can reach
 *    formsubmit.co (or any other external host).
 *
 * Usage (one server per test FILE, never per test):
 *
 *   const { startServer } = require("./helpers/server");
 *   let srv;
 *   before(async () => { srv = await startServer(); });
 *   after(async () => { await srv.stop(); });
 */

const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const APP_ENTRY = path.join(REPO_ROOT, "server", "app.js");

// 36 chars — comfortably above the 16-char production floor in server/config.js.
const TEST_SESSION_SECRET = "atex-test-session-secret-0123456789ab";

const READY_TIMEOUT_MS = 30_000;
const READY_POLL_MS = 100;
const STOP_TIMEOUT_MS = 5_000;

const TEMP_DB_PREFIX = "atex-test-";
const TEMP_DB_SUFFIX = ".sqlite";

/**
 * Resolve the node_modules that the child process should use.
 * Locally this comes in via NODE_PATH (deps live in the main checkout, not in
 * the worktree). In CI, `npm ci` puts them in ./node_modules.
 */
function resolveNodePath() {
  const fromEnv = String(process.env.NODE_PATH || "").trim();
  if (fromEnv) return fromEnv;
  return path.join(REPO_ROOT, "node_modules");
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Hard guard: only ever create/delete files that are unambiguously throwaway.
 * Throws instead of touching anything inside the repository.
 */
function assertDisposableDbPath(dbPath) {
  const resolved = path.resolve(dbPath);
  const base = path.basename(resolved);
  const tmpRoot = path.resolve(os.tmpdir());

  if (!base.startsWith(TEMP_DB_PREFIX) || !base.endsWith(TEMP_DB_SUFFIX)) {
    throw new Error(`Refusing to use non-throwaway DB file name: ${resolved}`);
  }
  if (!resolved.toLowerCase().startsWith(tmpRoot.toLowerCase() + path.sep)) {
    throw new Error(`Refusing to use a DB outside the OS temp dir: ${resolved}`);
  }
  if (resolved.toLowerCase().startsWith(path.resolve(REPO_ROOT).toLowerCase() + path.sep)) {
    throw new Error(`Refusing to use a DB inside the repository: ${resolved}`);
  }
  return resolved;
}

/** A fresh, unique, throwaway DB path in the OS temp dir. */
function makeTempDbPath(label = "srv") {
  const unique = `${TEMP_DB_PREFIX}${label}-${process.pid}-${crypto.randomBytes(6).toString("hex")}${TEMP_DB_SUFFIX}`;
  return assertDisposableDbPath(path.join(os.tmpdir(), unique));
}

/** Remove a throwaway DB and its WAL sidecars. Never throws. */
function removeTempDb(dbPath) {
  const resolved = assertDisposableDbPath(dbPath);
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      fs.rmSync(resolved + suffix, { force: true });
    } catch {
      // Best effort — a locked file on Windows must not fail the suite.
    }
  }
}

/**
 * True when any ancestor directory of the checkout starts with a dot.
 *
 * Express's `res.sendFile()` delegates to `send`, whose default
 * `dotfiles: "ignore"` returns 404 for ANY path containing a dot-segment — and
 * with an absolute path that check covers the whole path, not just the part
 * below the web root. So a checkout living under e.g. `.claude/worktrees/...`
 * makes every `res.sendFile()` route 404, including /admin-login and /admin.
 *
 * That is a property of where the code is checked out, not of the code. Tests
 * that assert on a sendFile-backed route use this to skip with an explicit
 * reason rather than report a false failure. Verified: booting the same server
 * from a dot-free path returns 200 for /admin-login and 302 for /admin.
 */
const REPO_ROOT_HAS_DOT_SEGMENT = REPO_ROOT.split(path.sep).some(
  (segment) => segment.startsWith(".") && segment.length > 1
);

const SENDFILE_SKIP_REASON =
  `checkout path contains a dot-segment (${REPO_ROOT}) — express res.sendFile() 404s ` +
  `on any such path because send's dotfiles:"ignore" default inspects the whole ` +
  `absolute path. Environment artifact, not an app defect; runs normally in CI.`;

function parseSetCookie(res) {
  if (typeof res.headers.getSetCookie === "function") return res.headers.getSetCookie();
  const raw = res.headers.get("set-cookie");
  return raw ? [raw] : [];
}

/**
 * Boot server/app.js on a free port against a fresh temp DB.
 *
 * @param {object}  [opts]
 * @param {object}  [opts.env]   Extra/overriding env vars for the child.
 * @param {string}  [opts.label] Short label used in the temp DB file name.
 * @returns {Promise<object>} harness with { port, origin, get, post, jar helpers, stop }
 */
async function startServer(opts = {}) {
  const { env: extraEnv = {}, label = "srv" } = opts;

  const port = await freePort();
  const dbPath = makeTempDbPath(label);

  const env = {
    ...process.env,
    DB_PATH: dbPath,
    SESSION_SECRET: TEST_SESSION_SECRET,
    PORT: String(port),
    HOST: "127.0.0.1",
    NODE_ENV: "development",
    ENABLE_REQUEST_LOGS: "false",
    ANALYTICS_ENABLED: "false",
    NODE_PATH: resolveNodePath(),
    // Never let a test reach the outside world.
    CONTACT_EMAIL_FORWARD_ENABLED: "false",
    // The global limiter defaults to 300/min, which a full route sweep can brush
    // against. Raise it so throughput never masks a real failure. Per-route
    // limiters (contact, login) keep their real defaults unless a test overrides.
    GLOBAL_RATE_LIMIT_LIMIT: "100000",
    DEFAULT_ADMIN_ENABLED: "false",
    ...extraEnv,
  };

  const child = spawn(process.execPath, [APP_ENTRY], {
    cwd: REPO_ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (c) => stdout.push(c.toString()));
  child.stderr.on("data", (c) => stderr.push(c.toString()));

  let exited = null;
  const exitPromise = new Promise((resolve) => {
    child.on("exit", (code, signal) => {
      exited = { code, signal };
      resolve(exited);
    });
  });

  const logs = () =>
    [
      `--- child stdout ---`,
      stdout.join("") || "(empty)",
      `--- child stderr ---`,
      stderr.join("") || "(empty)",
    ].join("\n");

  const origin = `http://127.0.0.1:${port}`;

  // Wait for readiness. Fail loudly with the captured output — a silent timeout
  // on a boot crash is the single most confusing failure mode for this harness.
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let ready = false;
  while (Date.now() < deadline) {
    if (exited) {
      removeTempDb(dbPath);
      throw new Error(
        `Server exited before becoming ready (code=${exited.code} signal=${exited.signal}).\n${logs()}`
      );
    }
    try {
      const res = await fetch(`${origin}/healthz`);
      if (res.status === 200) {
        ready = true;
        break;
      }
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, READY_POLL_MS));
  }

  if (!ready) {
    child.kill();
    await exitPromise;
    removeTempDb(dbPath);
    throw new Error(
      `Server did not answer GET /healthz with 200 within ${READY_TIMEOUT_MS}ms on ${origin}.\n${logs()}`
    );
  }

  // ---- cookie jar -------------------------------------------------------
  // Minimal name=value jar. Enough for the admin session cookie; deliberately
  // ignores Domain/Path/Expires because every request here is same-origin.
  const jar = new Map();

  function jarHeader() {
    if (!jar.size) return null;
    return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  function absorbCookies(res) {
    for (const raw of parseSetCookie(res)) {
      const pair = raw.split(";")[0];
      const i = pair.indexOf("=");
      if (i <= 0) continue;
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1).trim();
      if (!name) continue;
      if (!value) jar.delete(name);
      else jar.set(name, value);
    }
  }

  async function request(method, urlPath, { headers = {}, body, redirect = "manual", useJar = false } = {}) {
    const finalHeaders = { ...headers };
    if (useJar) {
      const cookie = jarHeader();
      if (cookie) finalHeaders.cookie = cookie;
    }
    const res = await fetch(`${origin}${urlPath}`, { method, headers: finalHeaders, body, redirect });
    if (useJar) absorbCookies(res);
    return res;
  }

  return {
    port,
    origin,
    dbPath,
    child,
    logs,
    jar,

    /** GET. `{ headers, redirect: "manual"|"follow", jar: true }` */
    get(urlPath, options = {}) {
      return request("GET", urlPath, { ...options, useJar: !!options.jar });
    },

    /**
     * POST. `body` is JSON-encoded unless `{ json: false }`, in which case it is
     * sent verbatim and you supply your own content-type.
     */
    post(urlPath, body, options = {}) {
      const { json = true, headers = {}, redirect = "manual", jar: useJar = false } = options;
      const finalHeaders = { ...headers };
      let payload = body;
      if (json) {
        finalHeaders["content-type"] = finalHeaders["content-type"] || "application/json";
        payload = body === undefined ? undefined : JSON.stringify(body);
      }
      return request("POST", urlPath, { headers: finalHeaders, body: payload, redirect, useJar });
    },

    clearJar() {
      jar.clear();
    },

    /** Kill the child and delete its throwaway DB (+ WAL sidecars). */
    async stop() {
      if (!exited) {
        child.kill();
        await Promise.race([exitPromise, new Promise((r) => setTimeout(r, STOP_TIMEOUT_MS))]);
      }
      removeTempDb(dbPath);
    },
  };
}

module.exports = {
  startServer,
  makeTempDbPath,
  removeTempDb,
  assertDisposableDbPath,
  REPO_ROOT,
  REPO_ROOT_HAS_DOT_SEGMENT,
  SENDFILE_SKIP_REASON,
  TEST_SESSION_SECRET,
};
