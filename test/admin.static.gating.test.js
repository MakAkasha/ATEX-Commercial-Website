"use strict";

/**
 * Gating of the /admin static mount.
 *
 * server/app.js mounts express.static() for the admin panel behind
 * requireAdminPage, with an exact-match allowlist (ADMIN_LOGIN_ASSETS) letting
 * only the two files the logged-out login page needs through the gate.
 *
 * The regression this file locks down: admin/admin.js used to be on that
 * allowlist (because it carried the login form handler), so any anonymous
 * visitor could GET /admin/admin.js and read a full map of the admin API —
 * every path, payload shape and field name. The handler now lives in
 * admin/admin-login.js and the bundle requires a session.
 *
 * The allowlist is a string comparison against `req.path`, so the traversal /
 * encoding suite below is the load-bearing part of this file: it proves the
 * comparison cannot be walked around to reach the bundle.
 */

const assert = require("node:assert/strict");
const http = require("node:http");
const { describe, it, before, after } = require("node:test");

const { startServer, REPO_ROOT_HAS_DOT_SEGMENT, SENDFILE_SKIP_REASON } = require("./helpers/server");

// /admin-login answers with res.sendFile(), which 404s from a checkout path
// containing a dot-segment. See REPO_ROOT_HAS_DOT_SEGMENT in helpers/server.js.
const skipSendFile = REPO_ROOT_HAS_DOT_SEGMENT ? SENDFILE_SKIP_REASON : false;

const ADMIN_USERNAME = "test-admin";
const ADMIN_PASSWORD = "test-admin-password-9f2c";

// A string that exists in admin/admin.js and in no other admin asset. Used to
// prove a response really is the bundle (or really is not).
const BUNDLE_MARKER = "--- Admin shell routing (new sidebar UX) ---";

/**
 * Raw HTTP GET that sends `rawPath` byte-for-byte.
 *
 * fetch() runs its input through the WHATWG URL parser, which collapses `..`
 * and `.` segments before anything leaves the process — useless for probing a
 * server-side path check. node:http writes the request line verbatim.
 */
function rawGet(origin, rawPath, { cookie } = {}) {
  const url = new URL(origin);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: url.hostname,
        port: url.port,
        method: "GET",
        path: rawPath,
        headers: cookie ? { cookie } : {},
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            location: res.headers.location || "",
            body: Buffer.concat(chunks).toString("utf8"),
          })
        );
      }
    );
    req.on("error", reject);
    req.end();
  });
}

/**
 * Every spelling of "give me the admin bundle" worth trying against an
 * exact-match allowlist: dot-segments, doubled slashes, trailing slashes, and
 * percent-encodings of characters in the allowlisted literals.
 *
 * None may return the bundle. A 302/404 is fine; a 200 whose body contains
 * BUNDLE_MARKER is not.
 */
const TRAVERSAL_PROBES = [
  "/admin/admin.js",
  "/admin/./admin.js",
  "/admin//admin.js",
  "/admin/admin.css/../admin.js",
  "/admin/admin.css/./../admin.js",
  "/admin/admin-login.js/../admin.js",
  "/admin/../admin/admin.js",
  "/admin/admin.js/",
  "/admin/admin.js/.",
  "/admin/%2e/admin.js",
  "/admin/admin.css/%2e%2e/admin.js",
  "/admin/admin.css/..%2fadmin.js",
  "/admin/%61dmin.js",
  "/admin/admin%2Ejs",
  "/admin/ADMIN.JS",
  "/admin/admin.js%00.css",
  "/admin/admin.js?x=/admin.css",
  "/admin/admin.js#/admin.css",
  "/admin/.//admin.js",
  "/admin/subdir/../admin.js",
  "/admin/%2E%2E/admin/admin.js",
  "/admin/admin.css/..;/admin.js",
  "/admin/admin.css%2F..%2Fadmin.js",
  "/admin/%252e%252e/admin.js",
  "/ADMIN/admin.js",
  "/admin/admin.js;.css",
  "/admin/admin.css/../../admin/admin.js",
  "/admin/\\admin.js",
];

describe("/admin static mount gating", () => {
  let srv;
  let sessionCookie = "";

  before(async () => {
    srv = await startServer({
      label: "adminstatic",
      env: {
        DEFAULT_ADMIN_ENABLED: "true",
        DEFAULT_ADMIN_USERNAME: ADMIN_USERNAME,
        DEFAULT_ADMIN_PASSWORD: ADMIN_PASSWORD,
      },
    });
  });

  after(async () => {
    await srv.stop();
  });

  // ---- unauthenticated ----------------------------------------------------

  it("GET /admin/admin.js unauthenticated redirects (302) to /admin-login", async () => {
    const res = await srv.get("/admin/admin.js", { redirect: "manual" });
    assert.equal(res.status, 302, "the admin bundle must not be served anonymously");
    assert.equal(String(res.headers.get("location") || ""), "/admin-login");
    assert.ok(!(await res.text()).includes(BUNDLE_MARKER));
  });

  it("GET /admin/admin.html unauthenticated redirects (302) to /admin-login", async () => {
    const res = await srv.get("/admin/admin.html", { redirect: "manual" });
    assert.equal(res.status, 302);
    assert.equal(String(res.headers.get("location") || ""), "/admin-login");
  });

  it("GET /admin/admin-login.js unauthenticated returns 200 (must stay reachable)", async () => {
    const res = await srv.get("/admin/admin-login.js", { redirect: "manual" });
    assert.equal(res.status, 200, "the login page cannot work without its script");

    const body = await res.text();
    assert.ok(body.includes("/api/auth/login"), "expected the login POST in admin-login.js");
    assert.ok(body.includes("#loginForm"), "expected the login form binding in admin-login.js");
  });

  it("GET /admin/admin.css unauthenticated returns 200 (deliberately allowlisted)", async () => {
    const res = await srv.get("/admin/admin.css", { redirect: "manual" });
    assert.equal(res.status, 200, "the login page cannot style itself without it");
  });

  it("admin-login.js does not carry the admin API surface", async () => {
    const res = await srv.get("/admin/admin-login.js");
    const body = await res.text();

    for (const endpoint of [
      "/api/settings",
      "/api/custom-pages",
      "/api/uploads",
      "/api/posts",
      "/api/products",
      "/api/content",
      "/api/track",
    ]) {
      assert.ok(
        !body.includes(endpoint),
        `admin-login.js leaks admin endpoint ${endpoint} — keep it to /api/auth/login only`
      );
    }
    assert.ok(!body.includes(BUNDLE_MARKER), "admin-login.js must not be the whole bundle");
  });

  it("GET /admin-login returns 200 and references admin-login.js, not admin.js", { skip: skipSendFile }, async () => {
    const res = await srv.get("/admin-login");
    assert.equal(res.status, 200);

    const html = await res.text();
    assert.ok(html.includes("/admin/admin-login.js"), "login page must load the split-out script");
    assert.ok(
      !/src="\/admin\/admin\.js"/.test(html),
      "login page must not pull in the gated admin bundle"
    );
  });

  // ---- traversal / encoding suite ----------------------------------------

  for (const probe of TRAVERSAL_PROBES) {
    it(`probe ${probe} does not return the admin bundle`, async () => {
      const res = await rawGet(srv.origin, probe);
      assert.ok(
        !res.body.includes(BUNDLE_MARKER),
        `probe ${probe} returned the admin bundle (status ${res.status})`
      );
      assert.notEqual(
        res.status,
        200,
        `probe ${probe} returned 200 from the gated mount (body starts: ${res.body.slice(0, 80)})`
      );
    });
  }

  // ---- login flow, end to end through the new file -------------------------

  it("POST /api/auth/login with valid credentials sets a session cookie", async () => {
    const res = await srv.post(
      "/api/auth/login",
      { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
      // Same-origin Origin header on every state-changing /api call. The guard in
      // server/app.js currently lets a missing Origin through, but
      // fix/csrf-origin-validation makes that a 403 — see the KNOWN GAP block in
      // test/api.csrf.test.js. Sending it now means this file survives that PR.
      { jar: true, headers: { origin: srv.origin } }
    );
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, true);
    assert.ok(srv.jar.has("atex.sid"), `expected an atex.sid cookie, jar = ${[...srv.jar.keys()]}`);

    sessionCookie = `atex.sid=${srv.jar.get("atex.sid")}`;
  });

  it("GET /admin/admin.js WITH a session returns 200 and the real bundle", async () => {
    assert.ok(sessionCookie, "login subtest must run first");

    const res = await rawGet(srv.origin, "/admin/admin.js", { cookie: sessionCookie });
    assert.equal(res.status, 200);
    assert.ok(res.body.includes(BUNDLE_MARKER), "expected the real admin bundle body");
    assert.ok(res.body.includes("/api/settings"), "expected admin API paths in the bundle");
  });

  it("the traversal probes still fail closed for a logged-out client afterwards", async () => {
    for (const probe of TRAVERSAL_PROBES) {
      const res = await rawGet(srv.origin, probe);
      assert.ok(!res.body.includes(BUNDLE_MARKER), `probe ${probe} leaked the bundle`);
    }
  });
});
