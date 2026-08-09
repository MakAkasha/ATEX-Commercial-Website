"use strict";

/**
 * Emits responsive <picture>/<img> markup for a web-facing image path.
 *
 * This is the read side of server/utils/imageDerivatives.js. That module owns
 * the path convention (`<dir>/<basename>-<width>.<format>`) and creates the
 * files; this one asks which of them actually exist and builds a srcset out of
 * exactly those.
 *
 * THE INVARIANT THIS MODULE EXISTS TO ENFORCE
 *
 *   A srcset never names a file that is not on disk.
 *
 * That matters because the image set is not uniform. Static assets under
 * assets/ were generated in bulk by tools/generate-image-derivatives.js, but
 * only for the directories that are actually rendered through an <img>. Blog
 * covers and testimonial photos live under uploads/, which is gitignored and
 * per-environment: a file uploaded before the derivative pipeline landed has
 * no derivatives at all, and a production box has a completely different set
 * of files from a dev box. A hardcoded srcset would therefore 404 for some
 * images in some environments — and a 404 inside a srcset is strictly worse
 * than no srcset, because the browser has already committed to that candidate
 * by the time it fails and does not silently fall back to `src`.
 *
 * So: every candidate is existence-checked, and an image with no derivatives
 * degrades to the plain <img> it was before.
 *
 * CACHING
 *
 * The existence checks run per render. fs.existsSync on every image on every
 * request is a real cost on a small VPS (the products grid alone is 55 images
 * x 8 candidate paths = 440 stat calls per page view). Results are cached in a
 * Map that is thrown away wholesale every TTL, using the existing memoize()
 * from ttlCache.js: memoize is argument-insensitive, so it cannot key by path
 * itself, but memoizing the *creation of the Map* gives exactly the wanted
 * behaviour — a cache that expires as a unit and repopulates lazily. A newly
 * uploaded image therefore starts serving its derivatives within one TTL,
 * which is the same freshness contract the settings and content caches use.
 */

const fs = require("fs");
const path = require("path");

const { DERIVATIVE_WIDTHS } = require("./imageDerivatives");
const { memoize } = require("./ttlCache");

/**
 * How long a resolved candidate set is trusted.
 *
 * Five minutes: long enough that a page render is effectively free, short
 * enough that an admin who uploads an image sees it served responsively
 * without a restart.
 */
const DEFAULT_TTL_MS = 5 * 60 * 1000;

/**
 * Source formats, best first. Order is load-bearing: the browser takes the
 * first <source> whose type it supports, so AVIF must precede WebP.
 *
 * AVIF lands roughly 35-45% under WebP at the quality settings in
 * imageDerivatives.js (measured on this site's own assets: the 480px step of
 * assets/solutions/smart-parking is 19.6 KB WebP against 11.6 KB AVIF). That
 * gap is why every image with derivatives gets a <picture> rather than a bare
 * srcset — even when the original is already WebP, negotiation still pays.
 */
const SOURCE_FORMATS = [
  { ext: ".avif", type: "image/avif" },
  { ext: ".webp", type: "image/webp" },
];

/**
 * The `sizes` attribute for every responsive slot on the site.
 *
 * Kept here, in one table, rather than inline in eight templates: a `sizes`
 * value is a claim about the stylesheet, and a wrong claim is worse than no
 * srcset at all (the browser resolves `sizes` before layout, so an inflated
 * value makes it download a *larger* file than it would have without any of
 * this). Collecting them makes each claim checkable against the CSS cited
 * beside it, and lets the blog cover's preload hint reuse the exact string the
 * markup uses instead of a second copy that can drift.
 *
 * Two constants recur below and are worth stating once:
 *
 *   --font-scale is 0.85 site-wide (assets/css/styles.css), and almost every
 *   length in the stylesheet is written `calc(Npx * var(--font-scale))`. So a
 *   rule that reads 1160px renders at 986px, 16px renders at 13.6px, and so on.
 *   The numbers here are the *rendered* ones.
 *
 *   .container is `width: min(986px, 100vw - 34px)`, so it stops growing at a
 *   1020px viewport. That is where the trailing fixed-pixel entry in most of
 *   these lists takes over from the vw-relative one.
 */
const IMAGE_SIZES = Object.freeze({
  /**
   * home.ejs — .hero__asset, three decorative floats over the overview scene.
   * `width: clamp(102px, 14vw, 170px)`; `clamp(107px, 29vw, 165px)` at <=980px.
   * clamp() is not reliably parsed inside `sizes`, so the vw term is used bare;
   * it overstates by ~19% only above a 1215px viewport, and the sources are
   * 375px wide, so the candidate chosen is the same either way.
   */
  heroAsset: "(max-width: 980px) 29vw, 14vw",

  /**
   * home.ejs — #blog .homeBlogCard__media (aspect-ratio 16/10).
   * Desktop: .grid--posts is 3 columns with a 13.6px gap inside .container,
   * so (986 - 27.2) / 3 = 320px.
   * <=980px the grid becomes a horizontal scroller: `flex: 0 0 min(78vw, 349px)`.
   * <=768px: `flex-basis: min(90vw, 332px)`, which caps out at a 369px viewport.
   */
  homeBlogCover:
    "(max-width: 368px) 90vw, (max-width: 768px) 332px, (max-width: 980px) 349px, (max-width: 1020px) 32vw, 320px",

  /**
   * blog-list.ejs — .blogCard__media inside .blogGrid.
   * Desktop: 3 columns, 13.6px gap -> 320px; the featured first card spans two
   * columns and splits 1.05fr/1fr internally -> 334px, the value used here.
   * <=980px: 2 columns -> (100vw - 34 - 13.6) / 2.
   * <=768px: 1 column -> full container width.
   */
  blogCardCover:
    "(max-width: 768px) calc(100vw - 34px), (max-width: 980px) calc((100vw - 48px) / 2), (max-width: 1020px) 32vw, 334px",

  /**
   * blog-post.ejs — .subpage__cover inside .subpage__panel (17px padding,
   * 11.9px at <=768px) inside .container. So 986 - 36 = 950px at the cap.
   * This is the page's LCP element; the same string is reused for its preload.
   */
  blogPostCover: "(max-width: 768px) calc(100vw - 60px), (max-width: 1020px) calc(100vw - 70px), 950px",

  /**
   * blog-post.ejs — .blogRelated__grid, 3 columns / 2 at <=980px / 1 at <=600px,
   * directly inside .container with a 13.6px gap.
   */
  blogRelatedCover:
    "(max-width: 600px) calc(100vw - 34px), (max-width: 980px) calc((100vw - 48px) / 2), (max-width: 1020px) 32vw, 320px",

  /**
   * solutions.ejs and industry-detail.ejs — .solutionsPage__heroPrimary.
   * .solutionsPage__heroInner is `0.94fr 1.06fr` with a 22.1px gap, and
   * .solutionsPage__heroMedia is `1fr 0.52fr` with a 10.2px gap, so the primary
   * figure is ((986 - 22.1) * 0.53 - 10.2) / 1.52 = 329px at the container cap.
   * <=980px heroInner collapses to one column, which makes the figure *wider*:
   * (100vw - 44.2) / 1.52, near enough 63vw.
   * <=768px heroMedia collapses too and the figure fills the container.
   */
  solutionsHeroPrimary:
    "(max-width: 768px) calc(100vw - 34px), (max-width: 980px) 63vw, (max-width: 1020px) 33vw, 329px",

  /**
   * solutions.ejs — the two .solutionsPage__heroStack figures, the 0.52fr
   * column: ((986 - 22.1) * 0.53 - 10.2) * 0.342 = 171px at the cap.
   * <=768px the stack becomes two side-by-side columns with a 6.8px gap.
   */
  solutionsHeroStack:
    "(max-width: 768px) calc((100vw - 41px) / 2), (max-width: 980px) 33vw, (max-width: 1020px) 17vw, 171px",

  /**
   * solution-detail.ejs — .solutionsPage__heroMedia--single is a single column,
   * so the figure takes the whole 1.06fr track: (986 - 22.1) * 0.53 = 511px.
   * <=980px heroInner is one column and it fills the container.
   */
  solutionDetailHero: "(max-width: 980px) calc(100vw - 34px), (max-width: 1020px) 51vw, 511px",

  /**
   * products.ejs — .products-page__cardMedia img.
   * .products-page__wrap is `max-width: 1300px` with `padding-inline:
   * clamp(18px, 4vw, 48px)`, and it is content-box — so 1300px is the *grid*
   * width and the padding sits outside it. The grid is 3 columns with a 14px
   * gap (2 columns at <=768px) and the media box adds 22px of padding on each
   * side plus the card's 1px border, i.e. 46px off the card width. This block
   * is NOT font-scaled: the products page declares its own raw-pixel tokens.
   *   >=1413px viewport: the 1300px cap binds -> (1300 - 28) / 3 - 46 = 378px.
   *   1201-1412px: padding is capped at 48 -> (100vw - 124) / 3 - 46.
   *   769-1200px:  padding is 4vw       -> (92vw - 28) / 3 - 46.
   *   451-768px:   two columns          -> (92vw - 14) / 2 - 46.
   *   <=450px:     padding floors at 18 -> (100vw - 50) / 2 - 46.
   * Measured against Chrome at 1440px: card 424px, media 422px, image 378px.
   */
  productCard:
    "(max-width: 450px) calc(50vw - 71px), (max-width: 768px) calc(46vw - 53px), (max-width: 1200px) calc(30.6vw - 55px), (max-width: 1413px) calc(33.3vw - 87px), 378px",

  /**
   * views/partials/rec/products.ejs — .recCard__media inside .recProducts__grid
   * (assets/css/rec-landing.css). The grid is
   * `repeat(auto-fill, minmax(calc(280px * var(--font-scale)), 1fr))` with a
   * --s-4 (13.6px) gap inside .container, so at the 986px container cap it
   * settles at 3 columns -> (986 - 27.2) / 3 = 320px. Measured against Chrome
   * at 1440px: 319.6px.
   * Below 1020px .container is `100vw - 34px` and the same minmax gives two
   * columns -> (100vw - 47.6) / 2, until the 238px track minimum stops fitting
   * twice at a ~524px viewport and it drops to one full-width column.
   */
  recProductCard:
    "(max-width: 559px) calc((100vw - 34px) * 0.84), (max-width: 1020px) calc((100vw - 47.6px) / 2), 320px",

  /**
   * home.ejs — .quoteCard__avatar is a fixed 40.8px box (48px * 0.85) with
   * `object-fit: cover`. Stated so an oversized uploaded photo resolves to the
   * 320px derivative instead of the original.
   */
  testimonialAvatar: "41px",
});

/** Attribute-value escaping. Everything interpolated into markup goes through it. */
function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Maps a public URL path onto the file that serves it, or null when the path
 * is not one this app serves from disk.
 *
 * Refuses, in order: anything that is not a rooted path (absolute URLs,
 * protocol-relative URLs, `data:` payloads — TinyMCE happily inlines base64
 * covers, and those have no file to stat), anything under no configured root,
 * and anything that escapes its root once resolved. The last check is what
 * stops `/uploads/../../server/data.sqlite` from being probed for existence.
 *
 * @param {string} webPath  e.g. "/assets/solutions/smart-home.webp"
 * @param {Array<{prefix: string, dir: string}>} roots
 * @returns {string|null} absolute file path
 */
function resolveDiskPath(webPath, roots) {
  if (typeof webPath !== "string" || !webPath.startsWith("/") || webPath.startsWith("//")) return null;
  if (webPath.includes("\0")) return null;

  const clean = webPath.split("#")[0].split("?")[0];

  for (const root of roots) {
    if (!clean.startsWith(root.prefix)) continue;
    let rel;
    try {
      rel = decodeURIComponent(clean.slice(root.prefix.length));
    } catch {
      return null;
    }
    const abs = path.resolve(root.dir, rel);
    if (abs !== root.dir && !abs.startsWith(root.dir + path.sep)) return null;
    return abs;
  }
  return null;
}

function fileExists(abs) {
  try {
    return fs.statSync(abs).isFile();
  } catch {
    return false;
  }
}

/**
 * Builds one image's candidate set.
 *
 * Pure apart from the stat calls, and deliberately separate from the markup so
 * the "no candidate is a 404" property can be asserted directly.
 *
 * @returns {{src: string, sources: Array<{type: string, srcset: string}>}}
 *   `sources` is empty when nothing was generated for this image — the caller
 *   then renders a plain <img>, exactly as before this module existed.
 */
function buildCandidates(webPath, roots) {
  const empty = { src: webPath, sources: [] };

  const abs = resolveDiskPath(webPath, roots);
  if (!abs) return empty;

  const clean = webPath.split("#")[0].split("?")[0];
  const dirUrl = clean.slice(0, clean.lastIndexOf("/"));
  const base = path.basename(clean, path.extname(clean));

  const sources = [];
  for (const format of SOURCE_FORMATS) {
    const candidates = [];
    for (const width of DERIVATIVE_WIDTHS) {
      const name = `${base}-${width}${format.ext}`;
      if (!fileExists(path.join(path.dirname(abs), name))) continue;
      candidates.push(`${dirUrl}/${encodeURIComponent(name)} ${width}w`);
    }
    if (candidates.length) sources.push({ type: format.type, srcset: candidates.join(", ") });
  }

  // The original is deliberately NOT added as a srcset candidate. It is the
  // <img> fallback and nothing else. Adding it would require its intrinsic
  // width (sharp has no synchronous metadata read, so a render-path call is
  // out), and where the width happens to be known the original is usually the
  // *worse* candidate anyway: assets/products/items/*.webp is 640px at ~17 KB
  // while its 768px WebP derivative — encoded from the 1080px PNG sibling — is
  // 14 KB. A bigger, heavier candidate is not one the browser should be able
  // to pick.
  return { src: webPath, sources };
}

/**
 * @param {object} options
 * @param {Array<{prefix: string, dir: string}>} options.roots  URL prefix -> disk dir
 * @param {number} [options.ttlMs]
 */
function createResponsiveImage({ roots, ttlMs = DEFAULT_TTL_MS }) {
  const normalisedRoots = roots.map((r) => ({
    prefix: r.prefix.endsWith("/") ? r.prefix : `${r.prefix}/`,
    dir: path.resolve(r.dir),
  }));

  // memoize() has no notion of arguments, so it cannot key by path. Memoizing
  // the Map itself gives a per-path cache with a whole-cache TTL — see the
  // CACHING note at the top of this file.
  const cacheHolder = memoize(() => new Map(), ttlMs);

  function candidates(webPath) {
    if (!webPath) return { src: "", sources: [] };
    const cache = cacheHolder();
    let hit = cache.get(webPath);
    if (!hit) {
      hit = buildCandidates(webPath, normalisedRoots);
      cache.set(webPath, hit);
    }
    return hit;
  }

  /**
   * Renders one image.
   *
   * Returns a <picture> when derivatives exist and a bare <img> when they do
   * not, so a template does not need to know or branch on which case it is in.
   *
   * @param {string} src
   * @param {object} [opts]
   * @param {string} [opts.alt]            Defaults to "" (decorative).
   * @param {string} [opts.sizes]          Ignored unless a srcset is emitted.
   * @param {string} [opts.loading]        "lazy" (default) or "eager".
   * @param {string} [opts.fetchpriority]  "high" for the LCP image.
   * @param {number|string} [opts.width]
   * @param {number|string} [opts.height]
   * @param {string} [opts.className]
   * @param {string} [opts.onerror]        Raw handler; used by the one call
   *                                       site that swaps in a placeholder.
   */
  function picture(src, opts = {}) {
    if (!src) return "";

    const { sources } = candidates(src);

    const attrs = [`src="${escapeAttr(src)}"`, `alt="${escapeAttr(opts.alt || "")}"`];
    if (opts.className) attrs.push(`class="${escapeAttr(opts.className)}"`);
    if (opts.width != null) attrs.push(`width="${escapeAttr(opts.width)}"`);
    if (opts.height != null) attrs.push(`height="${escapeAttr(opts.height)}"`);
    if (sources.length && opts.sizes) attrs.push(`sizes="${escapeAttr(opts.sizes)}"`);
    attrs.push(`loading="${escapeAttr(opts.loading || "lazy")}"`);
    attrs.push(`decoding="${escapeAttr(opts.decoding || "async")}"`);
    if (opts.fetchpriority) attrs.push(`fetchpriority="${escapeAttr(opts.fetchpriority)}"`);
    if (opts.onerror) attrs.push(`onerror="${escapeAttr(opts.onerror)}"`);

    const img = `<img ${attrs.join(" ")} />`;
    if (!sources.length) return img;

    const sizesAttr = opts.sizes ? ` sizes="${escapeAttr(opts.sizes)}"` : "";
    const sourceTags = sources
      .map((s) => `<source type="${escapeAttr(s.type)}" srcset="${escapeAttr(s.srcset)}"${sizesAttr} />`)
      .join("");
    return `<picture>${sourceTags}${img}</picture>`;
  }

  /**
   * The best preload for this image: the first format that has candidates, as
   * an imagesrcset, or the original when it has none.
   *
   * A <link rel=preload as=image href=original> in front of a <picture> is a
   * double download — the preload fetches the original and the <picture> then
   * fetches an AVIF candidate. Preloading the same responsive set the markup
   * will choose from is what keeps the preload and the render in agreement.
   *
   * `type` gates the hint: a browser without AVIF ignores that link entirely
   * and simply loads the image normally from the markup. That costs the
   * preload, never correctness.
   */
  function preload(src, sizes) {
    if (!src) return null;
    const { sources } = candidates(src);
    if (!sources.length) return { href: src, type: null, imagesrcset: null, imagesizes: null };
    return { href: src, type: sources[0].type, imagesrcset: sources[0].srcset, imagesizes: sizes || null };
  }

  return { picture, preload, candidates, bustCache: cacheHolder.bust };
}

module.exports = {
  DEFAULT_TTL_MS,
  IMAGE_SIZES,
  SOURCE_FORMATS,
  buildCandidates,
  createResponsiveImage,
  escapeAttr,
  resolveDiskPath,
};
