"use strict";

/**
 * Guards the self-hosted webfonts.
 *
 * Cairo and Tajawal used to come from fonts.googleapis.com — a render-blocking,
 * cross-origin stylesheet on every page. They now live in /assets/fonts, with
 * the @font-face rules at the top of assets/css/styles.css (public site) and
 * admin/admin.css (admin panel).
 *
 * Three things can silently break that, and each one is a real regression a
 * normal test run would not notice:
 *
 *   1. A font file is renamed, moved or never committed. The @font-face still
 *      parses, the page still renders — in a fallback font. On an Arabic-first
 *      site that is a visible, sitewide regression, not a cosmetic one.
 *   2. Someone re-adds a Google Fonts <link> (copy-paste from an old template,
 *      a new admin page, an AI edit restoring the "familiar" head block). The
 *      CDN request comes back and the CSP now blocks it, so the fonts fail.
 *   3. The arabic unicode-range subset is dropped while the latin one survives.
 *      Everything looks fine in a Latin smoke test and every Arabic glyph on
 *      the site falls back. This is the single worst outcome, so it gets its
 *      own assertion rather than being implied by the file-exists check.
 */

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");

/** Stylesheets that are allowed to declare @font-face, and must self-host. */
const FONT_STYLESHEETS = [path.join("assets", "css", "styles.css"), path.join("admin", "admin.css")];

/**
 * Everything the server actually sends to a browser. Deliberately excludes
 * tools/: build-qsystem-preview-html.js emits a standalone file opened from
 * disk, never served by this app, so it is outside both the CSP and this rule.
 */
const SERVED_SOURCES = [
  ...walkFiles(path.join(ROOT_DIR, "views"), new Set([".ejs"])),
  ...walkFiles(path.join(ROOT_DIR, "admin"), new Set([".html", ".css", ".js"])),
  ...walkFiles(path.join(ROOT_DIR, "assets", "css"), new Set([".css"])),
  ...walkFiles(path.join(ROOT_DIR, "assets", "js"), new Set([".js"])),
];

const GOOGLE_FONT_ORIGINS = ["fonts.googleapis.com", "fonts.gstatic.com"];

/** Codepoint that must be covered by an arabic subset: ARABIC LETTER ALEF. */
const ARABIC_SAMPLE_CODEPOINT = 0x0627;

function walkFiles(dir, exts, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(full, exts, out);
    else if (exts.has(path.extname(e.name))) out.push(full);
  }
  return out;
}

function rel(p) {
  return path.relative(ROOT_DIR, p).replace(/\\/g, "/");
}

/** Parse the @font-face rules out of a stylesheet. */
function parseFontFaces(css) {
  const faces = [];
  const re = /@font-face\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const body = m[1];
    const family = /font-family:\s*['"]?([^;'"]+)['"]?\s*;/.exec(body);
    const weight = /font-weight:\s*([^;]+);/.exec(body);
    const display = /font-display:\s*([^;]+);/.exec(body);
    const range = /unicode-range:\s*([^;]+);/.exec(body);
    const urls = [...body.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((u) => u[1].trim());
    faces.push({
      family: family ? family[1].trim() : null,
      weight: weight ? weight[1].trim() : null,
      display: display ? display[1].trim() : null,
      unicodeRange: range ? range[1].trim() : null,
      urls,
    });
  }
  return faces;
}

/** True if a CSS unicode-range list covers `cp`. */
function rangeCovers(unicodeRange, cp) {
  if (!unicodeRange) return false;
  for (const part of unicodeRange.split(",")) {
    const token = part.trim().replace(/^U\+/i, "");
    if (!token) continue;
    const [lo, hi] = token.split("-");
    const start = parseInt(lo, 16);
    const end = hi === undefined ? start : parseInt(hi, 16);
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    if (cp >= start && cp <= end) return true;
  }
  return false;
}

/** Resolve a root-relative CSS url() to a path on disk. */
function resolveFontUrl(url) {
  assert.ok(
    url.startsWith("/assets/fonts/"),
    `@font-face src must be a self-hosted /assets/fonts/... path, got: ${url}`
  );
  return path.join(ROOT_DIR, url.replace(/^\//, "").split("/").join(path.sep));
}

/** Every @font-face across every stylesheet, tagged with its source file. */
const ALL_FACES = FONT_STYLESHEETS.flatMap((relPath) => {
  const css = fs.readFileSync(path.join(ROOT_DIR, relPath), "utf8");
  return parseFontFaces(css).map((f) => ({ ...f, source: relPath }));
});

describe("self-hosted webfonts", () => {
  it("declares @font-face rules in both stylesheets", () => {
    for (const relPath of FONT_STYLESHEETS) {
      const count = ALL_FACES.filter((f) => f.source === relPath).length;
      assert.ok(count > 0, `${relPath} declares no @font-face — fonts are not self-hosted there`);
    }
  });

  it("every @font-face src resolves to a file on disk", () => {
    assert.ok(ALL_FACES.length > 0, "no @font-face rules found at all");
    for (const face of ALL_FACES) {
      assert.ok(
        face.urls.length > 0,
        `@font-face for ${face.family} ${face.weight} in ${face.source} has no src url()`
      );
      for (const url of face.urls) {
        const onDisk = resolveFontUrl(url);
        assert.ok(
          fs.existsSync(onDisk),
          `${face.source}: @font-face ${face.family} ${face.weight} points at ${url}, which does not exist on disk`
        );
        assert.ok(fs.statSync(onDisk).size > 0, `${face.source}: ${url} exists but is empty`);
      }
    }
  });

  it("every font file is a real WOFF2, not an error page or a placeholder", () => {
    const seen = new Set();
    for (const face of ALL_FACES) {
      for (const url of face.urls) {
        if (seen.has(url)) continue;
        seen.add(url);
        const buf = fs.readFileSync(resolveFontUrl(url));
        assert.equal(
          buf.subarray(0, 4).toString("latin1"),
          "wOF2",
          `${url} is not a WOFF2 file (bad magic bytes)`
        );
        assert.equal(
          buf.readUInt32BE(8),
          buf.length,
          `${url} is truncated: WOFF2 header declares a different length than the file has`
        );
      }
    }
  });

  it("every declared family keeps an arabic subset — the Arabic-first failure mode", () => {
    const families = new Set(ALL_FACES.map((f) => f.family));
    assert.ok(families.size >= 2, `expected at least Cairo and Tajawal, got: ${[...families]}`);

    for (const family of families) {
      const arabicFaces = ALL_FACES.filter(
        (f) => f.family === family && rangeCovers(f.unicodeRange, ARABIC_SAMPLE_CODEPOINT)
      );
      assert.ok(
        arabicFaces.length > 0,
        `${family} has no @font-face whose unicode-range covers U+0627 — Arabic text would render in a fallback font`
      );
      for (const face of arabicFaces) {
        for (const url of face.urls) {
          assert.ok(
            fs.existsSync(resolveFontUrl(url)),
            `${family} arabic subset points at a missing file: ${url}`
          );
        }
      }
    }
  });

  it("every @font-face uses font-display: swap", () => {
    for (const face of ALL_FACES) {
      assert.equal(
        face.display,
        "swap",
        `${face.source}: @font-face ${face.family} ${face.weight} must use font-display: swap`
      );
    }
  });

  it("every preloaded font file exists and is declared by an @font-face", () => {
    const declared = new Set(ALL_FACES.flatMap((f) => f.urls));
    const preloadRe = /<link[^>]*rel=["']preload["'][^>]*>/gi;
    let found = 0;

    for (const file of SERVED_SOURCES) {
      if (![".ejs", ".html"].includes(path.extname(file))) continue;
      const html = fs.readFileSync(file, "utf8");
      for (const [tag] of html.matchAll(preloadRe)) {
        if (!/as=["']font["']/i.test(tag)) continue;
        found++;
        const href = /href=["']([^"']+)["']/i.exec(tag);
        assert.ok(href, `${rel(file)}: font preload with no href: ${tag}`);
        const url = href[1];

        assert.ok(
          fs.existsSync(resolveFontUrl(url)),
          `${rel(file)}: preloads ${url}, which does not exist on disk`
        );
        assert.ok(
          declared.has(url),
          `${rel(file)}: preloads ${url}, which no @font-face rule references — the browser would download it and never use it`
        );
        assert.match(
          tag,
          /crossorigin/i,
          `${rel(file)}: font preload must be crossorigin or the browser fetches the file twice: ${tag}`
        );
        assert.match(
          tag,
          /type=["']font\/woff2["']/i,
          `${rel(file)}: font preload should declare type="font/woff2": ${tag}`
        );
      }
    }

    assert.ok(found > 0, "no font preload found in any served template");
  });

  it("preloads at most one font file per page", () => {
    for (const file of SERVED_SOURCES) {
      if (![".ejs", ".html"].includes(path.extname(file))) continue;
      const html = fs.readFileSync(file, "utf8");
      const fontPreloads = [...html.matchAll(/<link[^>]*rel=["']preload["'][^>]*>/gi)].filter(([tag]) =>
        /as=["']font["']/i.test(tag)
      );
      assert.ok(
        fontPreloads.length <= 1,
        `${rel(file)} preloads ${fontPreloads.length} fonts — each one competes with the others for early bandwidth`
      );
    }
  });

  it("nothing the server serves references a Google Fonts origin", () => {
    const offenders = [];
    for (const file of SERVED_SOURCES) {
      const text = fs.readFileSync(file, "utf8");
      for (const origin of GOOGLE_FONT_ORIGINS) {
        if (text.includes(origin)) offenders.push(`${rel(file)} -> ${origin}`);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `Google Fonts came back. These files must load fonts from /assets/fonts instead:\n${offenders.join("\n")}`
    );
  });

  it("the CSP no longer allows the Google Fonts origins", () => {
    const { getConfig } = require("../server/config");
    const csp = getConfig().cspDirectives;
    for (const directive of ["fontSrc", "styleSrc", "defaultSrc", "connectSrc"]) {
      for (const origin of GOOGLE_FONT_ORIGINS) {
        assert.ok(
          !(csp[directive] || []).some((src) => String(src).includes(origin)),
          `CSP ${directive} still allows ${origin}, but nothing loads from it any more`
        );
      }
    }
  });
});
