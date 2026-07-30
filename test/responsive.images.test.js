"use strict";

/**
 * Responsive images: the helper's contract, and the markup it actually emits.
 *
 * The failure this file exists to prevent is a srcset candidate that 404s.
 * That is worse than shipping no srcset at all — the browser picks a candidate
 * from the list before requesting it, and a 404 on the chosen candidate is a
 * broken image, not a silent fall back to `src`. Since the derivative set is
 * not uniform (assets/ is generated in bulk and committed; uploads/ is
 * gitignored, per-environment, and may hold files that predate the pipeline),
 * "the srcset matches what is on disk" cannot be assumed and has to be checked.
 *
 * Two layers:
 *
 *   UNIT      — server/utils/responsiveImage.js against a temp fixture tree,
 *               including the degradation path and the path-traversal refusals.
 *   RENDERED  — every public page is fetched from a real server and every
 *               <img>/<source> in the response is checked: candidates resolve,
 *               dimensions are declared or the slot is provably pinned by CSS,
 *               and no image marked as the LCP is also marked lazy.
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { startServer } = require("./helpers/server");
const {
  IMAGE_SIZES,
  buildCandidates,
  createResponsiveImage,
  resolveDiskPath,
} = require("../server/utils/responsiveImage");
const { getSolutions, getIndustries } = require("../server/data/contentRegistry");

const REPO_ROOT = path.resolve(__dirname, "..");

/* ------------------------------------------------------------------ *
 * UNIT
 * ------------------------------------------------------------------ */

describe("responsiveImage: path resolution refuses anything it should not stat", () => {
  const roots = [{ prefix: "/assets/", dir: path.join(REPO_ROOT, "assets") }];

  const refused = [
    ["a relative path", "assets/x.webp"],
    ["a protocol-relative URL", "//evil.example/x.webp"],
    ["an absolute URL", "https://evil.example/x.webp"],
    ["a data: payload", "data:image/png;base64,iVBORw0KGgo="],
    ["a path outside every root", "/vendor/tinymce/tinymce.min.js"],
    ["a traversal out of the root", "/assets/../server/app.js"],
    ["an encoded traversal", "/assets/%2e%2e/server/app.js"],
    ["a NUL byte", "/assets/x\0.webp"],
  ];

  for (const [label, input] of refused) {
    it(`refuses ${label}`, () => {
      assert.equal(resolveDiskPath(input, roots), null, `${input} should not resolve to a disk path`);
    });
  }

  it("resolves a real asset path to its file", () => {
    const abs = resolveDiskPath("/assets/solutions/smart-building.webp", roots);
    assert.ok(abs, "expected a resolved path");
    assert.ok(fs.statSync(abs).isFile());
  });

  it("ignores a query string when resolving", () => {
    const abs = resolveDiskPath("/assets/solutions/smart-building.webp?v=123", roots);
    assert.ok(abs && fs.statSync(abs).isFile());
  });
});

describe("responsiveImage: candidates come only from files that exist", () => {
  let dir;
  let roots;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "atex-respimg-"));
    fs.mkdirSync(path.join(dir, "pics"), { recursive: true });
    roots = [{ prefix: "/pics/", dir: path.join(dir, "pics") }];

    // A source with a deliberately RAGGED derivative set: 320 in both formats,
    // 480 in WebP only, 768 in neither. This is the realistic shape — an image
    // narrower than 768px never gets a 768px step, and a partially-failed
    // encode leaves one format behind.
    for (const name of ["hero.jpg", "hero-320.webp", "hero-320.avif", "hero-480.webp"]) {
      fs.writeFileSync(path.join(dir, "pics", name), "x");
    }
    // A source with nothing generated for it at all.
    fs.writeFileSync(path.join(dir, "pics", "lonely.jpg"), "x");
  });

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("lists AVIF before WebP so the browser takes the smaller format first", () => {
    const { sources } = buildCandidates("/pics/hero.jpg", roots);
    assert.deepEqual(
      sources.map((s) => s.type),
      ["image/avif", "image/webp"]
    );
  });

  it("emits only the widths that were actually generated, per format", () => {
    const { sources } = buildCandidates("/pics/hero.jpg", roots);
    const byType = Object.fromEntries(sources.map((s) => [s.type, s.srcset]));
    assert.equal(byType["image/avif"], "/pics/hero-320.avif 320w");
    assert.equal(byType["image/webp"], "/pics/hero-320.webp 320w, /pics/hero-480.webp 480w");
  });

  it("never names a file that is not on disk", () => {
    const { sources } = buildCandidates("/pics/hero.jpg", roots);
    for (const source of sources) {
      for (const candidate of source.srcset.split(", ")) {
        const url = candidate.split(" ")[0];
        const abs = path.join(dir, decodeURIComponent(url.slice(1)));
        assert.ok(fs.existsSync(abs), `${url} is in a srcset but does not exist`);
      }
    }
  });

  it("returns no sources for an image with no derivatives", () => {
    assert.deepEqual(buildCandidates("/pics/lonely.jpg", roots).sources, []);
  });

  it("returns no sources for a path it cannot resolve", () => {
    assert.deepEqual(buildCandidates("/nope/hero.jpg", roots).sources, []);
    assert.deepEqual(buildCandidates("data:image/png;base64,AAAA", roots).sources, []);
  });

  it("degrades to a plain <img> — not a <picture> — when nothing was generated", () => {
    const { picture } = createResponsiveImage({ roots });
    const html = picture("/pics/lonely.jpg", { alt: "x", sizes: "50vw" });
    assert.ok(!html.includes("<picture"), "expected no <picture> wrapper");
    assert.ok(!html.includes("srcset"), "expected no srcset");
    assert.ok(!html.includes("sizes"), "sizes without a srcset is dead weight");
    assert.match(html, /^<img /);
    assert.ok(html.includes('src="/pics/lonely.jpg"'));
  });

  it("wraps in <picture> with one <source> per available format when it can", () => {
    const { picture } = createResponsiveImage({ roots });
    const html = picture("/pics/hero.jpg", { alt: "x", sizes: "50vw" });
    assert.match(html, /^<picture>/);
    assert.equal((html.match(/<source /g) || []).length, 2);
    assert.ok(html.includes('type="image/avif"'));
    assert.ok(html.includes('sizes="50vw"'));
    assert.ok(html.includes('src="/pics/hero.jpg"'), "the original stays as the <img> fallback");
  });

  it("returns an empty string for a falsy src rather than emitting a broken <img>", () => {
    const { picture } = createResponsiveImage({ roots });
    assert.equal(picture(""), "");
    assert.equal(picture(null), "");
    assert.equal(picture(undefined), "");
  });

  it("defaults to lazy + async decoding, and honours an explicit eager/high override", () => {
    const { picture } = createResponsiveImage({ roots });
    assert.ok(picture("/pics/hero.jpg", {}).includes('loading="lazy"'));
    assert.ok(picture("/pics/hero.jpg", {}).includes('decoding="async"'));

    const lcp = picture("/pics/hero.jpg", { loading: "eager", fetchpriority: "high" });
    assert.ok(lcp.includes('loading="eager"'));
    assert.ok(lcp.includes('fetchpriority="high"'));
    assert.ok(!lcp.includes('loading="lazy"'));
  });

  it("escapes attribute values instead of letting them close the tag", () => {
    const { picture } = createResponsiveImage({ roots });
    const html = picture("/pics/hero.jpg", { alt: '"><script>alert(1)</script>' });
    assert.ok(!html.includes("<script>"), `alt escaped out of its attribute: ${html}`);
    assert.ok(html.includes("&quot;&gt;&lt;script&gt;"));
  });

  it("caches an existence check and re-checks once the TTL lapses", () => {
    const { picture } = createResponsiveImage({ roots, ttlMs: 50 });

    assert.ok(!picture("/pics/late.jpg", {}).includes("<picture"), "no derivatives yet");
    fs.writeFileSync(path.join(dir, "pics", "late.jpg"), "x");
    fs.writeFileSync(path.join(dir, "pics", "late-320.webp"), "x");
    assert.ok(!picture("/pics/late.jpg", {}).includes("<picture"), "still serving the cached miss");

    const waitUntil = Date.now() + 80;
    while (Date.now() < waitUntil) {
      /* busy-wait: the cache is time-based and this test must not be async */
    }
    assert.ok(picture("/pics/late.jpg", {}).includes("<picture"), "expected the TTL to expire the cache");
  });
});

describe("responsiveImage: preload hint agrees with the markup", () => {
  const roots = [{ prefix: "/assets/", dir: path.join(REPO_ROOT, "assets") }];

  it("preloads the same responsive set the <picture> will choose from", () => {
    const { preload, candidates } = createResponsiveImage({ roots });
    const src = "/assets/solutions/smart-building.webp";
    const hint = preload(src, IMAGE_SIZES.blogPostCover);
    const best = candidates(src).sources[0];

    assert.equal(hint.type, best.type);
    assert.equal(hint.imagesrcset, best.srcset);
    assert.equal(hint.imagesizes, IMAGE_SIZES.blogPostCover);
  });

  it("falls back to a plain href when the image has no derivatives", () => {
    const { preload } = createResponsiveImage({ roots });
    const hint = preload("/assets/ATEX-logo.svg");
    assert.equal(hint.href, "/assets/ATEX-logo.svg");
    assert.equal(hint.imagesrcset, null);
  });
});

/* ------------------------------------------------------------------ *
 * RENDERED
 * ------------------------------------------------------------------ */

/** Every <img ...> tag in a document, as a map of attribute name -> value. */
function parseImgs(html) {
  return [...html.matchAll(/<img\b([^>]*)>/g)].map((m) => parseAttrs(m[1], m[0]));
}

/** Every <source ...> tag in a document. */
function parseSources(html) {
  return [...html.matchAll(/<source\b([^>]*)>/g)].map((m) => parseAttrs(m[1], m[0]));
}

function parseAttrs(raw, tag) {
  const attrs = { _tag: tag };
  for (const m of raw.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) attrs[m[1].toLowerCase()] = m[2];
  return attrs;
}

/**
 * Maps a public URL back onto its file, for the two mounts server/app.js
 * serves from disk. Mirrors the helper's own mapping deliberately rather than
 * calling it: a bug in the helper's resolution should make this test fail, not
 * agree with itself.
 */
function urlToDisk(url) {
  const clean = url.split("?")[0];
  if (clean.startsWith("/assets/")) return path.join(REPO_ROOT, "assets", decodeURIComponent(clean.slice(8)));
  if (clean.startsWith("/uploads/"))
    return path.join(REPO_ROOT, "uploads", decodeURIComponent(clean.slice(9)));
  return null;
}

/**
 * Images whose box is pinned by the stylesheet rather than by width/height
 * attributes, which the task's rule explicitly allows ("width and height, or a
 * CSS aspect-ratio"). Each entry names a rule that must still exist in
 * styles.css — if the pin is deleted, the exemption stops being true and this
 * test fails rather than quietly allowing a layout shift.
 *
 * Keyed by a substring of the rendered <img>'s surrounding markup is fragile,
 * so instead these are matched on the src, which is what identifies the slot.
 */
const CSS_PINNED_SLOTS = [
  {
    what: "blog cover images (.blogCard__media / .subpage__cover)",
    // A cover is an arbitrary admin upload; its ratio is unknowable at render
    // time. Both slots give the <img> a fixed height with object-fit: cover.
    matches: (src) => src.startsWith("/uploads/"),
    cssMustContain: [".blogCard__media {", ".subpage__cover img {", "object-fit: cover;"],
  },
];

const STYLES_CSS = fs.readFileSync(path.join(REPO_ROOT, "assets", "css", "styles.css"), "utf8");

describe("rendered pages: every responsive image is honest about what it serves", () => {
  let srv;
  /** @type {Array<{page: string, html: string}>} */
  const pages = [];

  before(async () => {
    srv = await startServer({ label: "responsive-images" });

    const paths = [
      "/",
      "/solutions",
      "/products",
      "/blog",
      `/solutions/${getSolutions()[0].slug}`,
      `/industries/${getIndustries()[0].slug}`,
    ];

    // Discover a real post URL rather than hardcoding a slug the seed may drop.
    const blogHtml = await (await srv.get("/blog")).text();
    const postMatch = blogHtml.match(/href="(\/blog\/[a-z0-9-]+)"/i);
    if (postMatch) paths.push(postMatch[1]);

    for (const page of paths) {
      const res = await srv.get(page);
      assert.equal(res.status, 200, `expected 200 for ${page}`);
      pages.push({ page, html: await res.text() });
    }
  });

  after(async () => {
    await srv.stop();
  });

  it("renders enough images to be asserting something", () => {
    const total = pages.reduce((n, p) => n + parseImgs(p.html).length, 0);
    assert.ok(
      total >= 20,
      `only found ${total} <img> tags across ${pages.length} pages — the parser is broken`
    );
  });

  it("actually emits responsive sources (this whole feature is a no-op otherwise)", () => {
    const withPicture = pages.filter((p) => p.html.includes("<picture>"));
    assert.ok(withPicture.length >= 4, `only ${withPicture.length} pages emitted a <picture>`);

    const avif = pages.reduce(
      (n, p) => n + parseSources(p.html).filter((s) => s.type === "image/avif").length,
      0
    );
    assert.ok(avif >= 10, `only ${avif} AVIF sources across all pages`);
  });

  it("every srcset candidate on every page resolves to a real file", () => {
    const missing = [];
    for (const { page, html } of pages) {
      for (const source of parseSources(html)) {
        for (const candidate of (source.srcset || "").split(",")) {
          const url = candidate.trim().split(/\s+/)[0];
          if (!url) continue;
          const abs = urlToDisk(url);
          if (!abs || !fs.existsSync(abs)) missing.push(`${page}: ${url}`);
        }
      }
      for (const img of parseImgs(html)) {
        if (!img.srcset) continue;
        for (const candidate of img.srcset.split(",")) {
          const url = candidate.trim().split(/\s+/)[0];
          if (!url) continue;
          const abs = urlToDisk(url);
          if (!abs || !fs.existsSync(abs)) missing.push(`${page}: ${url}`);
        }
      }
    }
    assert.deepEqual(missing, [], "srcset candidates that would 404");
  });

  it("every <img> src on every page resolves to a real file", () => {
    const missing = [];
    for (const { page, html } of pages) {
      for (const img of parseImgs(html)) {
        const src = img.src || "";
        if (!src || src.startsWith("data:") || /^https?:/.test(src)) continue;
        const abs = urlToDisk(src);
        if (!abs || !fs.existsSync(abs)) missing.push(`${page}: ${src}`);
      }
    }
    assert.deepEqual(missing, [], "<img src> values that would 404");
  });

  it("every <img> declares width and height, or sits in a CSS-pinned slot", () => {
    const undeclared = [];
    for (const { page, html } of pages) {
      for (const img of parseImgs(html)) {
        if (img.width && img.height) continue;
        const src = img.src || "";
        const exemption = CSS_PINNED_SLOTS.find((slot) => slot.matches(src));
        if (exemption) continue;
        undeclared.push(`${page}: ${src}`);
      }
    }
    assert.deepEqual(undeclared, [], "images with no reserved box");
  });

  it("each CSS-pinned exemption still points at a rule that exists", () => {
    for (const slot of CSS_PINNED_SLOTS) {
      for (const needle of slot.cssMustContain) {
        assert.ok(
          STYLES_CSS.includes(needle),
          `${slot.what} is exempt from width/height because styles.css contains "${needle}" — it no longer does`
        );
      }
    }
  });

  it("nothing is both the LCP candidate and lazy", () => {
    const contradictions = [];
    for (const { page, html } of pages) {
      for (const img of parseImgs(html)) {
        if (img.fetchpriority === "high" && img.loading === "lazy")
          contradictions.push(`${page}: ${img.src}`);
      }
    }
    assert.deepEqual(contradictions, [], 'fetchpriority="high" with loading="lazy" cancels itself out');
  });

  it("the hero image of every image-led page is eager and high priority", () => {
    // /solutions, /solutions/:slug and /industries/:slug all open with
    // .solutionsPage__heroPrimary as their first painted content.
    const heroPages = pages.filter((p) => p.html.includes("solutionsPage__heroPrimary"));
    assert.ok(heroPages.length >= 3, `expected the three hero pages, found ${heroPages.length}`);

    for (const { page, html } of heroPages) {
      const idx = html.indexOf("solutionsPage__heroPrimary");
      const region = html.slice(idx, idx + 2000);
      const hero = parseImgs(region)[0];
      assert.ok(hero, `no <img> inside the hero figure on ${page}`);
      assert.notEqual(hero.loading, "lazy", `the hero image on ${page} is lazy`);
      assert.equal(hero.fetchpriority, "high", `the hero image on ${page} is not high priority`);
    }
  });

  it("a preloaded image is preloaded as the set the markup will pick from", () => {
    // A `<link rel=preload as=image href=X>` in front of a <picture> that then
    // chooses an AVIF candidate downloads the image twice.
    for (const { page, html } of pages) {
      for (const m of html.matchAll(/<link\b[^>]*rel="preload"[^>]*as="image"[^>]*>/g)) {
        const link = parseAttrs(m[0], m[0]);
        if (!link.href) {
          assert.ok(link.imagesrcset, `${page}: an image preload with neither href nor imagesrcset`);
          continue;
        }
        // An href-only preload is correct only when that image has no
        // derivatives for the markup to prefer over it.
        const base = link.href.split("?")[0];
        const dir = path.dirname(urlToDisk(base) || "");
        const stem = path.basename(base, path.extname(base));
        const hasDerivative = ["320", "480", "768", "1280"].some((w) =>
          [".webp", ".avif"].some((ext) => fs.existsSync(path.join(dir, `${stem}-${w}${ext}`)))
        );
        assert.ok(
          !hasDerivative,
          `${page}: preloads ${link.href} by href, but derivatives exist — the <picture> will fetch a different file and the preload is wasted`
        );
      }
    }
  });

  it("keeps the Arabic RTL shell intact on every page it touched", () => {
    for (const { page, html } of pages) {
      assert.ok(html.includes('lang="ar"'), `${page} lost lang="ar"`);
      assert.ok(html.includes('dir="rtl"'), `${page} lost dir="rtl"`);
    }
  });
});

describe("IMAGE_SIZES", () => {
  it("is a non-empty frozen table", () => {
    assert.ok(Object.isFrozen(IMAGE_SIZES));
    assert.ok(Object.keys(IMAGE_SIZES).length >= 8);
  });

  it("every entry is a syntactically valid sizes list", () => {
    // <media-condition> <source-size-value>, ... , <source-size-value>
    // calc() bodies here nest one level deep — calc((100vw - 48px) / 2).
    const calcBody = String.raw`(?:[^()]|\([^()]*\))*`;
    const value = String.raw`(?:\d+(?:\.\d+)?(?:px|vw|em|rem)|calc\(${calcBody}\))`;
    const clause = String.raw`(?:\([^)]*\)\s+${value})`;
    const re = new RegExp(String.raw`^(?:${clause},\s*)*${value}$`);

    for (const [name, sizes] of Object.entries(IMAGE_SIZES)) {
      assert.match(sizes, re, `IMAGE_SIZES.${name} is not a valid sizes attribute: ${sizes}`);
    }
  });

  it("no entry uses min()/max()/clamp(), which sizes does not reliably parse", () => {
    for (const [name, sizes] of Object.entries(IMAGE_SIZES)) {
      assert.ok(
        !/\b(?:min|max|clamp)\(/.test(sizes),
        `IMAGE_SIZES.${name} uses a math function sizes may reject`
      );
    }
  });
});
