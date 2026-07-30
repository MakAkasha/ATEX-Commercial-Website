"use strict";

/**
 * Guards against deleting an asset that something still points at.
 *
 * Nothing else in the suite catches this: templates reference /assets/... as
 * plain strings, so a removed file is a 404 in the browser and a green test
 * run here. The seed-integrity test covers the catalog manifest only.
 *
 * Two passes:
 *
 *   1. STATIC  — scan templates, stylesheets, server code and JSON data for
 *                literal /assets/... paths and assert each resolves on disk.
 *   2. RESOLVED — require the data modules that *build* asset paths at runtime
 *                (template literals, extension swaps, /cards/ derivation) and
 *                assert the values they actually produce resolve on disk.
 *
 * The static pass cannot decide every path it sees: template literals with
 * ${...}, EJS interpolation and bare directory prefixes are undecidable from
 * source text. Those are skipped and counted, and the count is asserted to be
 * small so this file stays honest about its own coverage rather than quietly
 * checking nothing.
 */

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const ASSETS_DIR = path.join(ROOT_DIR, "assets");

/** Directories whose text contents are scanned for literal asset paths. */
const SCAN_DIRS = ["views", "admin", "server", "data", "tools"];
const SCAN_FILES = [path.join("assets", "css", "styles.css"), path.join("assets", "js", "main.js")];
const SCAN_EXTS = new Set([".ejs", ".html", ".css", ".js", ".json"]);

/** A path we cannot resolve from source text alone. */
const DYNAMIC_MARKERS = ["${", "<%", "'+", '"+', "' +", '" +'];

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      walk(full, out);
    } else if (SCAN_EXTS.has(path.extname(entry.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

function collectScanTargets() {
  const files = [];
  for (const dir of SCAN_DIRS) walk(path.join(ROOT_DIR, dir), files);
  for (const rel of SCAN_FILES) {
    const full = path.join(ROOT_DIR, rel);
    if (fs.existsSync(full)) files.push(full);
  }
  return files;
}

/** Comment lines carry illustrative paths ("e.g. /assets/foo/name.webp") that were never real files. */
function isCommentLine(line) {
  const t = line.trim();
  return t.startsWith("*") || t.startsWith("//") || t.startsWith("/*") || t.startsWith("<%#");
}

/**
 * Maps a web path onto its file, refusing anything that escapes assets/.
 * @returns {string|null} absolute path, or null if the path is unsafe
 */
function webPathToDisk(webPath) {
  const clean = webPath.split("#")[0].split("?")[0];
  let rel;
  try {
    rel = decodeURIComponent(clean.slice("/assets/".length));
  } catch {
    return null;
  }
  const abs = path.resolve(ASSETS_DIR, rel);
  if (!abs.startsWith(ASSETS_DIR + path.sep)) return null;
  return abs;
}

function resolvesOnDisk(webPath) {
  const abs = webPathToDisk(webPath);
  if (!abs) return false;
  try {
    return fs.statSync(abs).isFile();
  } catch {
    return false;
  }
}

/**
 * server/data/solutions.js stores .jpg paths and preferPngAsset() swaps in the
 * .webp sibling at load time when one exists. Either file satisfying the path
 * is therefore correct.
 */
function resolvesAllowingWebpSwap(webPath) {
  if (resolvesOnDisk(webPath)) return true;
  if (!webPath.startsWith("/assets/solutions/")) return false;
  const parsed = path.posix.parse(webPath);
  return resolvesOnDisk(`${parsed.dir}/${parsed.name}.webp`);
}

/** Extracts literal /assets/... candidates from one file. */
function extractFromFile(file) {
  const text = fs.readFileSync(file, "utf8");
  const found = [];
  const skipped = [];

  text.split(/\r?\n/).forEach((line, i) => {
    const isComment = isCommentLine(line);
    const matches = line.match(/\/assets\/[^"'`)\s>,\]]*/g) || [];
    for (const raw of matches) {
      const cleaned = raw.replace(/[.,;)]+$/, "");
      const where = `${path.relative(ROOT_DIR, file)}:${i + 1}`;
      const lastSegment = cleaned.slice(cleaned.lastIndexOf("/") + 1);

      const dynamic =
        DYNAMIC_MARKERS.some((m) => cleaned.includes(m)) ||
        cleaned.endsWith("/") ||
        !lastSegment.includes(".");

      if (dynamic || isComment) {
        skipped.push({ webPath: cleaned, where, reason: isComment ? "comment" : "dynamic" });
      } else {
        found.push({ webPath: cleaned, where });
      }
    }
  });

  return { found, skipped };
}

function scanRepository() {
  const found = [];
  const skipped = [];
  for (const file of collectScanTargets()) {
    const r = extractFromFile(file);
    found.push(...r.found);
    skipped.push(...r.skipped);
  }
  return { found, skipped };
}

describe("asset references resolve on disk", () => {
  const { found, skipped } = scanRepository();

  it("finds a meaningful number of literal /assets/ references", () => {
    assert.ok(
      found.length >= 50,
      `expected the scan to find a substantial set of asset paths, got ${found.length} — ` +
        "the extractor is probably broken and this file is asserting nothing"
    );
  });

  it("every statically-derivable /assets/ path resolves to a file", () => {
    const missing = found.filter((f) => !resolvesAllowingWebpSwap(f.webPath));
    assert.deepEqual(
      missing.map((m) => `${m.webPath}  (referenced at ${m.where})`),
      [],
      "these asset paths are referenced but do not exist on disk"
    );
  });

  it("reports how many paths it could not statically decide", () => {
    const byReason = skipped.reduce((acc, s) => {
      acc[s.reason] = (acc[s.reason] || 0) + 1;
      return acc;
    }, {});
    console.log(
      `      [coverage] checked ${found.length} literal asset paths; ` +
        `skipped ${skipped.length} as undecidable ` +
        `(${JSON.stringify(byReason)})`
    );
    // A sudden jump means paths silently moved out of static reach.
    assert.ok(
      skipped.length <= 40,
      `too many undecidable asset paths (${skipped.length}); the static pass is losing coverage`
    );
  });
});

describe("runtime-built asset paths resolve on disk", () => {
  it("every solutions image resolves (preferPngAsset swap applied)", () => {
    const { solutions } = require("../server/data/solutions");
    const missing = [];
    for (const s of solutions) {
      const paths = [s.primaryImage, ...(s.supportImages || [])].filter(Boolean);
      for (const p of paths) {
        if (!resolvesOnDisk(p)) missing.push(`${s.slug}: ${p}`);
      }
    }
    assert.deepEqual(missing, [], "solutions images missing on disk");
  });

  it("every derived /cards/ thumbnail resolves", () => {
    const { solutions } = require("../server/data/solutions");
    const { industries } = require("../server/data/industries");
    const missing = [];
    const check = (label, full) => {
      if (!full || !full.startsWith("/assets/solutions/")) return;
      const card = full.replace("/assets/solutions/", "/assets/solutions/cards/");
      if (!resolvesOnDisk(card)) missing.push(`${label}: ${card}`);
    };
    for (const s of solutions) check(s.slug, s.primaryImage);
    for (const i of industries) check(i.slug, i.image);
    assert.deepEqual(missing, [], "derived /cards/ thumbnails missing on disk");
  });

  it("every industries image resolves", () => {
    const { industries } = require("../server/data/industries");
    const missing = industries
      .filter((i) => i.image && !resolvesOnDisk(i.image))
      .map((i) => `${i.slug}: ${i.image}`);
    assert.deepEqual(missing, [], "industries images missing on disk");
  });

  it("every products-page category banner resolves", () => {
    const { CATEGORIES } = require("../server/data/productsPage");
    assert.ok(CATEGORIES.length > 0, "expected at least one banner category");
    const missing = CATEGORIES.filter((c) => !resolvesOnDisk(c.banner)).map((c) => `${c.key}: ${c.banner}`);
    assert.deepEqual(missing, [], "category banners missing on disk");
  });
});
