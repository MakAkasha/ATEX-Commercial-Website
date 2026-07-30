"use strict";

/**
 * Asset URL helper — the single place that decides what a <link>/<script> in a
 * view points at.
 *
 * THE POINT OF THIS FILE: the app must work correctly whether or not a build
 * has been run. The deploy for this project may well be `git pull` plus a PM2
 * restart, with no build step anywhere. So:
 *
 *   - if assets/build/.vite/manifest.json exists AND every file it names is
 *     present on disk, the helper emits the hashed, content-addressed URLs
 *     (/assets/build/styles-Dia6dA7I.css), which are served immutable for a
 *     year because the filename changes whenever the bytes do;
 *   - otherwise it emits exactly today's URLs
 *     (/assets/css/styles.css?v=<assetVer>), behaving as if this PR had never
 *     landed.
 *
 * That makes the change safe to merge and deploy before any build tooling
 * exists on the server, and makes a rollback one `git revert` with no deploy
 * choreography.
 *
 * The mode is decided ONCE, at boot, and logged. It is not re-checked per
 * request: a half-built directory appearing mid-flight would otherwise make
 * some pages hashed and some not.
 */

const fs = require("node:fs");
const path = require("node:path");

/** Public URL prefix for built output. Must match the express.static mount. */
const BUILD_BASE = "/assets/build/";

/** Where `vite build` writes, relative to the repo root. */
const BUILD_DIR = path.join("assets", "build");

/** Vite's default manifest location inside outDir. */
const MANIFEST_REL = path.join(".vite", "manifest.json");

/**
 * Manifest keys, which are the entry source paths from vite.config.js,
 * POSIX-relative to the repo root. Also the fallback URLs, minus the leading
 * slash and the ?v= query.
 */
const ENTRIES = Object.freeze({
  styles: "assets/css/styles.css",
  main: "assets/js/main.js",
  consent: "assets/js/consent.js",
});

/** Structured log line, matching the shape used elsewhere in the server. */
function logLine(level, fields) {
  return JSON.stringify({ ts: new Date().toISOString(), level, type: "assets", ...fields });
}

/**
 * Read and validate the Vite manifest.
 *
 * Validation matters as much as reading: a manifest that survived a partial
 * deploy, or that names a file someone deleted, would have the helper emit a
 * URL that 404s — and a 404 on the stylesheet is an unstyled site. Any
 * inconsistency demotes the whole helper to fallback mode rather than
 * producing a mix.
 *
 * @returns {{ ok: true, map: Record<string,string> } | { ok: false, reason: string }}
 */
function loadManifest(rootDir) {
  const manifestPath = path.join(rootDir, BUILD_DIR, MANIFEST_REL);

  let raw;
  try {
    raw = fs.readFileSync(manifestPath, "utf8");
  } catch {
    return { ok: false, reason: "no-manifest" };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "manifest-unparseable" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "manifest-not-an-object" };
  }

  const map = {};
  for (const [name, srcKey] of Object.entries(ENTRIES)) {
    const record = parsed[srcKey];
    const file = record && typeof record.file === "string" ? record.file : "";
    if (!file) return { ok: false, reason: `manifest-missing-entry:${srcKey}` };

    // Refuse anything that would escape the build directory. The manifest is a
    // build artefact, not user input, but this helper turns its contents into
    // URLs and it costs nothing to keep that mapping total.
    const onDisk = path.resolve(rootDir, BUILD_DIR, file);
    const buildRoot = path.resolve(rootDir, BUILD_DIR);
    if (!onDisk.startsWith(buildRoot + path.sep)) {
      return { ok: false, reason: `manifest-entry-escapes-build-dir:${srcKey}` };
    }
    try {
      if (!fs.statSync(onDisk).isFile()) return { ok: false, reason: `built-file-missing:${file}` };
    } catch {
      return { ok: false, reason: `built-file-missing:${file}` };
    }

    map[name] = BUILD_BASE + file.split(path.sep).join("/");
  }

  return { ok: true, map };
}

/**
 * Build the asset helper.
 *
 * @param {object}   options
 * @param {string}   options.rootDir   Repo root (the directory holding assets/).
 * @param {string}   options.assetVer  Cache-buster used by the fallback URLs.
 * @param {object}   [options.logger]  Defaults to console; injected by tests.
 * @returns {{ asset: (name: string) => string, mode: "built"|"source", urls: Record<string,string> }}
 */
function createAssetHelper({ rootDir, assetVer, logger = console }) {
  const result = loadManifest(rootDir);

  const fallbackUrls = Object.fromEntries(
    Object.entries(ENTRIES).map(([name, srcKey]) => [name, `/${srcKey}?v=${assetVer}`])
  );

  const built = result.ok;
  const urls = built ? result.map : fallbackUrls;
  const mode = built ? "built" : "source";

  // One line at boot, so which mode is live is answerable from the PM2 log
  // rather than by reading HTML. A manifest that exists but does not check out
  // is a warning — that is a broken deploy degrading to a working site, and it
  // should be visible.
  if (built) {
    logger.log(logLine("info", { mode, base: BUILD_BASE, entries: Object.keys(urls).length }));
  } else if (result.reason === "no-manifest") {
    logger.log(
      logLine("info", {
        mode,
        reason: result.reason,
        detail: "no vite build present; serving unhashed /assets paths with ?v= cache-busting",
      })
    );
  } else {
    logger.warn(
      logLine("warn", {
        mode,
        reason: result.reason,
        detail: "vite manifest present but unusable; falling back to unhashed /assets paths",
      })
    );
  }

  /**
   * @param {"styles"|"main"|"consent"} name
   * @returns {string} a URL this server serves
   */
  function asset(name) {
    const url = urls[name];
    if (!url) {
      // An unknown name is a template typo. Throwing at render time is louder
      // and more findable than emitting "undefined" into a <script src>.
      throw new Error(`Unknown asset "${name}". Known assets: ${Object.keys(ENTRIES).join(", ")}.`);
    }
    return url;
  }

  return { asset, mode, urls };
}

module.exports = {
  createAssetHelper,
  BUILD_BASE,
  BUILD_DIR,
  MANIFEST_REL,
  ENTRIES,
};
