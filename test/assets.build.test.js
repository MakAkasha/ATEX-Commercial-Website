"use strict";

/**
 * Guards the Vite asset pipeline and, above all, the fact that the site works
 * WITHOUT it.
 *
 * The deploy for this project may be nothing more than `git pull` plus a PM2
 * restart. So the contract server/utils/assets.js has to keep is:
 *
 *   no manifest  -> emit exactly the URLs this app emitted before Vite existed
 *   good manifest-> emit the content-hashed URLs, which exist on disk
 *   bad manifest -> emit the pre-Vite URLs and say so loudly
 *
 * The last block runs a real `vite build` into a throwaway directory and
 * asserts the two things that would break production silently:
 *
 *   1. the root-absolute url() paths in the stylesheet — the nine self-hosted
 *      woff2 files — come out of the build byte-for-byte unchanged. Vite
 *      rewrites those under several plausible configurations (a non-"/" base,
 *      or publicDir left off), and the symptom is not an error: every Arabic
 *      glyph on the site quietly falls back to a system font.
 *   2. neither built script contains an `import` or `export` statement.
 *      consent.js is loaded as a CLASSIC `defer` script; an import statement
 *      in it is a SyntaxError and the page-view beacon stops firing. Rolldown
 *      emits exactly that unless the entries are marked ESM (see
 *      vite.config.js), so this is a live regression, not a hypothetical.
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");
const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { startServer } = require("./helpers/server");
const { createAssetHelper, BUILD_BASE, BUILD_DIR, MANIFEST_REL, ENTRIES } = require("../server/utils/assets");

const REPO_ROOT = path.resolve(__dirname, "..");

/** Collects the structured log lines the helper writes, instead of printing. */
function makeCollectingLogger() {
  const lines = { info: [], warn: [] };
  return {
    lines,
    log: (l) => lines.info.push(l),
    warn: (l) => lines.warn.push(l),
  };
}

/** A fresh throwaway directory in the OS temp dir. Never inside the repo. */
function makeTempDir(label) {
  const dir = path.join(
    os.tmpdir(),
    `atex-assets-${label}-${process.pid}-${crypto.randomBytes(5).toString("hex")}`
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Lay out a fake built tree: the named files plus a manifest pointing at them. */
function writeFakeBuild(rootDir, files) {
  const buildDir = path.join(rootDir, BUILD_DIR);
  fs.mkdirSync(path.join(buildDir, path.dirname(MANIFEST_REL)), { recursive: true });

  const manifest = {};
  for (const [name, srcKey] of Object.entries(ENTRIES)) {
    manifest[srcKey] = { file: files[name], src: srcKey, isEntry: true };
  }
  fs.writeFileSync(path.join(buildDir, MANIFEST_REL), JSON.stringify(manifest, null, 2));
  return { buildDir, manifest };
}

/** Extract the inside of every url(...) in a stylesheet, quotes stripped. */
function cssUrls(css) {
  const out = [];
  const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
  let m;
  while ((m = re.exec(css))) out.push(m[2].trim());
  return out;
}

// ---------------------------------------------------------------------------
// 1. No build present — the state this repository ships in.
// ---------------------------------------------------------------------------

describe("asset helper — no build present (fallback mode)", () => {
  let dir;
  before(() => {
    dir = makeTempDir("nobuild");
  });
  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("emits exactly the pre-Vite URLs", () => {
    const logger = makeCollectingLogger();
    const { asset, mode } = createAssetHelper({ rootDir: dir, assetVer: "1712345678", logger });

    assert.equal(mode, "source");
    assert.equal(asset("styles"), "/assets/css/styles.css?v=1712345678");
    assert.equal(asset("consent"), "/assets/js/consent.js?v=1712345678");
    assert.equal(asset("main"), "/assets/js/main.js?v=1712345678");
  });

  it("logs one structured info line naming the mode, and no warning", () => {
    const logger = makeCollectingLogger();
    createAssetHelper({ rootDir: dir, assetVer: "1", logger });

    assert.equal(logger.lines.warn.length, 0, "a missing build is normal, not a warning");
    assert.equal(logger.lines.info.length, 1, "exactly one boot line");
    const parsed = JSON.parse(logger.lines.info[0]);
    assert.equal(parsed.type, "assets");
    assert.equal(parsed.level, "info");
    assert.equal(parsed.mode, "source");
    assert.equal(parsed.reason, "no-manifest");
  });

  it("never emits a /assets/build/ URL when there is nothing to serve there", () => {
    const { asset } = createAssetHelper({
      rootDir: dir,
      assetVer: "1",
      logger: makeCollectingLogger(),
    });
    for (const name of Object.keys(ENTRIES)) {
      assert.ok(
        !asset(name).startsWith(BUILD_BASE),
        `${name} pointed into the build directory with no build present`
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 2. A good build — hashed URLs that resolve on disk.
// ---------------------------------------------------------------------------

describe("asset helper — manifest present (built mode)", () => {
  let dir;
  const files = {
    styles: "styles-AAAAAAAA.css",
    main: "main-BBBBBBBB.js",
    consent: "consent-CCCCCCCC.js",
  };

  before(() => {
    dir = makeTempDir("built");
    const { buildDir } = writeFakeBuild(dir, files);
    for (const f of Object.values(files)) fs.writeFileSync(path.join(buildDir, f), "/* built */");
  });
  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("emits the hashed, content-addressed URLs", () => {
    const { asset, mode } = createAssetHelper({
      rootDir: dir,
      assetVer: "1",
      logger: makeCollectingLogger(),
    });

    assert.equal(mode, "built");
    assert.equal(asset("styles"), "/assets/build/styles-AAAAAAAA.css");
    assert.equal(asset("main"), "/assets/build/main-BBBBBBBB.js");
    assert.equal(asset("consent"), "/assets/build/consent-CCCCCCCC.js");
  });

  it("carries no ?v= query — the hash is the cache key", () => {
    const { asset } = createAssetHelper({
      rootDir: dir,
      assetVer: "1",
      logger: makeCollectingLogger(),
    });
    for (const name of Object.keys(ENTRIES)) {
      assert.ok(!asset(name).includes("?v="), `${name} still carries a ?v= query`);
    }
  });

  it("every emitted URL maps to a file that exists — no 404s", () => {
    const { asset } = createAssetHelper({
      rootDir: dir,
      assetVer: "1",
      logger: makeCollectingLogger(),
    });
    for (const name of Object.keys(ENTRIES)) {
      const url = asset(name);
      const onDisk = path.join(dir, BUILD_DIR, url.slice(BUILD_BASE.length));
      assert.ok(fs.existsSync(onDisk), `${url} does not exist on disk at ${onDisk}`);
    }
  });

  it("logs one structured info line saying built", () => {
    const logger = makeCollectingLogger();
    createAssetHelper({ rootDir: dir, assetVer: "1", logger });
    assert.equal(logger.lines.warn.length, 0);
    const parsed = JSON.parse(logger.lines.info[0]);
    assert.equal(parsed.mode, "built");
    assert.equal(parsed.entries, Object.keys(ENTRIES).length);
  });

  it("throws on an unknown asset name rather than emitting undefined", () => {
    const { asset } = createAssetHelper({
      rootDir: dir,
      assetVer: "1",
      logger: makeCollectingLogger(),
    });
    assert.throws(() => asset("nope"), /Unknown asset "nope"/);
  });
});

// ---------------------------------------------------------------------------
// 3. Broken builds degrade to the working site, loudly.
// ---------------------------------------------------------------------------

describe("asset helper — a manifest that cannot be trusted", () => {
  function withTempDir(fn) {
    const dir = makeTempDir("broken");
    try {
      return fn(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  it("falls back when the manifest names a file that is not there", () => {
    withTempDir((dir) => {
      writeFakeBuild(dir, {
        styles: "styles-AAAAAAAA.css",
        main: "main-BBBBBBBB.js",
        consent: "consent-CCCCCCCC.js",
      });
      // Deliberately write none of the three files.
      const logger = makeCollectingLogger();
      const { asset, mode } = createAssetHelper({ rootDir: dir, assetVer: "42", logger });

      assert.equal(mode, "source");
      assert.equal(asset("styles"), "/assets/css/styles.css?v=42");
      assert.equal(logger.lines.warn.length, 1, "a half-deployed build must warn");
      const parsed = JSON.parse(logger.lines.warn[0]);
      assert.equal(parsed.level, "warn");
      assert.match(parsed.reason, /^built-file-missing:/);
    });
  });

  it("falls back on unparseable JSON", () => {
    withTempDir((dir) => {
      const buildDir = path.join(dir, BUILD_DIR);
      fs.mkdirSync(path.join(buildDir, path.dirname(MANIFEST_REL)), { recursive: true });
      fs.writeFileSync(path.join(buildDir, MANIFEST_REL), "{ not json");

      const logger = makeCollectingLogger();
      const { asset, mode } = createAssetHelper({ rootDir: dir, assetVer: "7", logger });
      assert.equal(mode, "source");
      assert.equal(asset("main"), "/assets/js/main.js?v=7");
      assert.equal(JSON.parse(logger.lines.warn[0]).reason, "manifest-unparseable");
    });
  });

  it("falls back when an entry is missing from an otherwise valid manifest", () => {
    withTempDir((dir) => {
      const buildDir = path.join(dir, BUILD_DIR);
      fs.mkdirSync(path.join(buildDir, path.dirname(MANIFEST_REL)), { recursive: true });
      fs.writeFileSync(
        path.join(buildDir, MANIFEST_REL),
        JSON.stringify({ "assets/css/styles.css": { file: "styles-A.css" } })
      );
      fs.writeFileSync(path.join(buildDir, "styles-A.css"), "/* built */");

      const logger = makeCollectingLogger();
      const { mode } = createAssetHelper({ rootDir: dir, assetVer: "9", logger });
      assert.equal(mode, "source", "a partial manifest must not produce a mixed page");
      assert.match(JSON.parse(logger.lines.warn[0]).reason, /^manifest-missing-entry:/);
    });
  });

  it("refuses a manifest entry that escapes the build directory", () => {
    withTempDir((dir) => {
      const buildDir = path.join(dir, BUILD_DIR);
      fs.mkdirSync(path.join(buildDir, path.dirname(MANIFEST_REL)), { recursive: true });
      const manifest = {};
      for (const srcKey of Object.values(ENTRIES)) {
        manifest[srcKey] = { file: "../../../etc/passwd" };
      }
      fs.writeFileSync(path.join(buildDir, MANIFEST_REL), JSON.stringify(manifest));

      const logger = makeCollectingLogger();
      const { mode } = createAssetHelper({ rootDir: dir, assetVer: "1", logger });
      assert.equal(mode, "source");
      assert.match(JSON.parse(logger.lines.warn[0]).reason, /escapes-build-dir/);
    });
  });
});

// ---------------------------------------------------------------------------
// 4. The real server, in whichever mode this checkout is currently in.
//
// Deliberately mode-agnostic: assets/build/ is gitignored, so the suite has to
// pass both on a clean checkout (no build) and on a developer's machine right
// after `npm run build`. Each assertion picks its expected shape from the mode
// the helper reports for this repo, so BOTH branches are exercised in CI over
// time rather than one being asserted and the other assumed.
// ---------------------------------------------------------------------------

describe("rendered pages on the real server", () => {
  let srv;
  let html;
  let mode;

  before(async () => {
    // assetVer is irrelevant to the mode decision; only the manifest matters.
    mode = createAssetHelper({
      rootDir: REPO_ROOT,
      assetVer: "0",
      logger: makeCollectingLogger(),
    }).mode;
    srv = await startServer({ label: "assets" });
    html = await (await srv.get("/")).text();
  });
  after(async () => {
    await srv.stop();
  });

  it("links the stylesheet at the URL shape this mode calls for", () => {
    if (mode === "source") {
      assert.match(html, /<link rel="stylesheet" href="\/assets\/css\/styles\.css\?v=\d+" \/>/);
    } else {
      assert.match(html, /<link rel="stylesheet" href="\/assets\/build\/styles-[A-Za-z0-9_-]+\.css" \/>/);
    }
  });

  it("keeps consent.js a classic defer script and main.js a module, in that order", () => {
    // Anchor on same-origin srcs only: the GSAP tags above these are also
    // `defer` and would otherwise match first.
    const consentRe = /<script src="(\/[^"]+)" defer><\/script>/;
    const mainRe = /<script type="module" src="(\/[^"]+)"><\/script>/;

    const consentAt = html.search(consentRe);
    const mainAt = html.search(mainRe);
    assert.ok(consentAt > -1, "consent.js tag missing or changed shape");
    assert.ok(mainAt > -1, "main.js tag missing or changed shape");
    assert.ok(consentAt < mainAt, "consent.js must still come before main.js");

    const consentSrc = consentRe.exec(html)[1];
    const mainSrc = mainRe.exec(html)[1];
    if (mode === "source") {
      assert.equal(consentSrc.split("?")[0], "/assets/js/consent.js");
      assert.equal(mainSrc.split("?")[0], "/assets/js/main.js");
    } else {
      assert.match(consentSrc, /^\/assets\/build\/consent-[A-Za-z0-9_-]+\.js$/);
      assert.match(mainSrc, /^\/assets\/build\/main-[A-Za-z0-9_-]+\.js$/);
    }
  });

  it("every asset URL the page emits returns 200", async () => {
    const urls = [...html.matchAll(/(?:href|src)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
    assert.ok(urls.length >= 5, `expected several /assets URLs in the page, got ${urls.length}`);

    const bad = [];
    for (const url of [...new Set(urls)]) {
      const res = await srv.get(url);
      if (res.status !== 200) bad.push(`${url} -> ${res.status}`);
    }
    assert.deepEqual(bad, [], "asset URLs emitted by the page that do not resolve");
  });

  it("never exposes the Vite manifest over HTTP", async () => {
    // serve-static's dotfiles:"ignore" default covers .vite/ in both mounts.
    const res = await srv.get("/assets/build/.vite/manifest.json");
    assert.notEqual(res.status, 200);
  });

  it("serves built files immutable for a year when there are any", async () => {
    if (mode === "source") return;
    const cssUrl = /<link rel="stylesheet" href="([^"]+)" \/>/.exec(html)[1];
    const res = await srv.get(cssUrl);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("cache-control") || "", /max-age=31536000/);
    assert.match(res.headers.get("cache-control") || "", /immutable/);
  });
});

// ---------------------------------------------------------------------------
// 5. A real build. The font-url proof.
// ---------------------------------------------------------------------------

/**
 * Locate Vite's CLI entry.
 *
 * `require.resolve("vite/bin/vite.js")` does NOT work: Vite's package.json
 * "exports" map does not expose ./bin, so Node refuses the subpath. Resolving
 * ./package.json is allowed, and its "bin" field points the rest of the way.
 * Returns null when Vite is not installed (devDependency-free checkout), in
 * which case this whole block skips rather than fails.
 */
function resolveViteBin() {
  try {
    const pkgPath = require.resolve("vite/package.json");
    const rel = require(pkgPath).bin?.vite;
    if (!rel) return null;
    const bin = path.join(path.dirname(pkgPath), rel);
    return fs.existsSync(bin) ? bin : null;
  } catch {
    return null;
  }
}

const VITE_BIN = resolveViteBin();

describe("vite build output", { skip: VITE_BIN ? false : "vite is not installed" }, () => {
  let outDir;
  let built = null;

  before(() => {
    outDir = makeTempDir("vitebuild");
    const run = spawnSync(
      process.execPath,
      [VITE_BIN, "build", "--outDir", outDir, "--emptyOutDir", "--logLevel", "warn"],
      { cwd: REPO_ROOT, encoding: "utf8", windowsHide: true }
    );
    assert.equal(
      run.status,
      0,
      `vite build failed\n--- stdout ---\n${run.stdout}\n--- stderr ---\n${run.stderr}`
    );

    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, MANIFEST_REL), "utf8"));
    built = {
      manifest,
      css: fs.readFileSync(path.join(outDir, manifest[ENTRIES.styles].file), "utf8"),
      main: fs.readFileSync(path.join(outDir, manifest[ENTRIES.main].file), "utf8"),
      consent: fs.readFileSync(path.join(outDir, manifest[ENTRIES.consent].file), "utf8"),
    };
  });
  after(() => {
    fs.rmSync(outDir, { recursive: true, force: true });
  });

  it("emits one entry per source file, each present on disk", () => {
    for (const srcKey of Object.values(ENTRIES)) {
      const record = built.manifest[srcKey];
      assert.ok(record && record.file, `manifest has no entry for ${srcKey}`);
      assert.ok(
        fs.existsSync(path.join(outDir, record.file)),
        `${record.file} named in the manifest but missing on disk`
      );
      assert.match(record.file, /-[A-Za-z0-9_-]{8,}\.(css|js)$/, "filename is not content-hashed");
    }
  });

  it("PROOF: every url() in the stylesheet survives the build unrewritten", () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, "assets", "css", "styles.css"), "utf8");
    const before = cssUrls(source);
    const after = cssUrls(built.css);

    assert.ok(
      before.length >= 10,
      `expected the source CSS to reference several files, got ${before.length}`
    );
    assert.deepEqual(
      after,
      before,
      "the build rewrote url() paths — self-hosted fonts and/or images would 404 or be duplicated"
    );
  });

  it("PROOF: the nine self-hosted woff2 files are still addressed at /assets/fonts/...", () => {
    // 15 @font-face rules, but only nine distinct files: Cairo is a variable
    // font, so one file per subset backs the 400/700/800 faces.
    const fontUrls = [...new Set(cssUrls(built.css).filter((u) => u.endsWith(".woff2")))];
    assert.equal(fontUrls.length, 9, "expected nine distinct self-hosted woff2 files");

    const missing = fontUrls.filter((u) => {
      assert.ok(u.startsWith("/assets/fonts/"), `font url() was rewritten: ${u}`);
      return !fs.existsSync(path.join(REPO_ROOT, u.replace(/^\//, "")));
    });
    assert.deepEqual(missing, [], "font url() points at a file that does not exist");
  });

  it("inlines nothing as a data: URI, so no CSP directive has to move", () => {
    assert.ok(!built.css.includes("data:"), "built CSS contains a data: URI");
    assert.ok(!built.main.includes("data:"), "built main.js contains a data: URI");
    assert.ok(!built.consent.includes("data:"), "built consent.js contains a data: URI");
  });

  it("emits no shared chunk: both scripts are self-contained", () => {
    const chunks = fs.readdirSync(outDir).filter((f) => f.endsWith(".js"));
    assert.equal(
      chunks.length,
      2,
      `expected exactly main + consent, got: ${chunks.join(", ")} — a shared runtime chunk breaks the classic consent.js tag`
    );
  });

  it("PROOF: built consent.js is valid as a CLASSIC script (no import/export)", () => {
    assert.ok(!/\bimport\s*[{("']/.test(built.consent), "built consent.js contains an import");
    assert.ok(!/\bexport\s*[{*]/.test(built.consent), "built consent.js contains an export");
    // The strongest available check: parse it the way a browser would parse a
    // classic script. `new Function` uses the same grammar and rejects import.
    assert.doesNotThrow(
      () => new Function(built.consent),
      "built consent.js does not parse as a classic script"
    );
  });

  it("built main.js parses as a classic script too (a superset of module-safe)", () => {
    assert.ok(!/\bimport\s*[{("']/.test(built.main), "built main.js contains an import");
    assert.doesNotThrow(() => new Function(built.main));
  });

  it("the helper turns that build into URLs under the /assets/build mount", () => {
    // Point the helper at a root whose build directory is this real output.
    const fakeRoot = makeTempDir("helper-over-real-build");
    try {
      const dest = path.join(fakeRoot, BUILD_DIR);
      fs.cpSync(outDir, dest, { recursive: true });

      const { asset, mode } = createAssetHelper({
        rootDir: fakeRoot,
        assetVer: "1",
        logger: makeCollectingLogger(),
      });
      assert.equal(mode, "built");
      for (const name of Object.keys(ENTRIES)) {
        const url = asset(name);
        assert.ok(url.startsWith(BUILD_BASE), `${name} -> ${url}`);
        assert.ok(
          fs.existsSync(path.join(dest, url.slice(BUILD_BASE.length))),
          `${url} does not resolve on disk`
        );
      }
    } finally {
      fs.rmSync(fakeRoot, { recursive: true, force: true });
    }
  });
});
