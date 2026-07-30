"use strict";

/**
 * Responsive image derivative generation (sharp).
 *
 * Used by two callers:
 *   - server/routes/uploads.js  — after an admin uploads an image
 *   - tools/generate-image-derivatives.js — one-off pass over committed assets
 *
 * PATH CONVENTION (the only place a derivative's location is defined):
 *
 *     <dir>/<basename-without-extension>-<width>.<format>
 *
 * e.g. an original at
 *     uploads/images/2026/07/1753900000000-a1b2c3.png
 * produces
 *     uploads/images/2026/07/1753900000000-a1b2c3-320.webp   (thumbnail)
 *     uploads/images/2026/07/1753900000000-a1b2c3-320.avif
 *     uploads/images/2026/07/1753900000000-a1b2c3-480.webp
 *     ...
 *     uploads/images/2026/07/1753900000000-a1b2c3-1280.avif
 *
 * Derivative paths are DERIVED, never stored. Nothing is written to the
 * database, so there is no schema change and no migration: a consumer that
 * wants the 768px WebP builds the path from the original's URL.
 *
 * INVARIANTS
 *  - The original file is never read-modified-written, moved, or deleted here.
 *  - Derivatives are additive. An existing file is never overwritten unless the
 *    caller explicitly passes `force: true`.
 *  - No upscaling: a width at or above the source's *displayed* width is
 *    skipped, so a 200px source yields nothing at 480/768/1280.
 *  - Metadata is stripped. sharp emits no EXIF/XMP/IPTC/GPS unless asked to,
 *    and we never ask. `.rotate()` with no argument bakes the EXIF Orientation
 *    into the pixels and drops the tag.
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

/** Thumbnail width. Same convention as the responsive steps, just smaller. */
const THUMBNAIL_WIDTH = 320;

/** Responsive steps. Chosen to bracket the site's layout breakpoints. */
const RESPONSIVE_WIDTHS = [480, 768, 1280];

const DERIVATIVE_WIDTHS = [THUMBNAIL_WIDTH, ...RESPONSIVE_WIDTHS];

/**
 * Encoder settings.
 *
 * WebP quality 80 is libwebp's long-standing sweet spot for photographic
 * content — visually hard to separate from the source at normal viewing size,
 * and roughly 25-35% smaller than JPEG at a comparable look.
 *
 * AVIF quality 52 is NOT the same scale as WebP 80; AVIF's quantiser is much
 * more aggressive per unit. sharp's own default is 50. 52 sits just above it,
 * which in practice lands near WebP-80 perceptual quality at meaningfully
 * fewer bytes.
 *
 * `effort` is left at each encoder's default. AVIF encoding is CPU-bound and
 * runs inline with an admin's upload; raising effort buys a few percent of
 * size for multiples of the wall-clock cost.
 */
const FORMATS = [
  { format: "webp", ext: ".webp", options: { quality: 80 } },
  { format: "avif", ext: ".avif", options: { quality: 52 } },
];

/**
 * Decompression-bomb budget: 50 megapixels.
 *
 * The 5 MB upload cap does not bound decoded size — PNG and WebP happily
 * compress a 30000x30000 canvas of flat colour into a few hundred KB, which
 * decodes to gigabytes of RGBA. sharp's own default limit is ~268 MP, far more
 * than this site ever needs.
 *
 * 50 MP is ~8660x5773 — larger than any photograph a corporate site publishes,
 * and bounded at roughly 200 MB of decoded RGBA in the worst case, which a
 * small VPS survives. Anything above it is rejected, not downscaled: at that
 * size the upload is a mistake or an attack, and silently accepting it hides
 * both.
 */
const MAX_INPUT_PIXELS = 50 * 1000 * 1000;

/** Extensions this pipeline will read as a source image. */
const SOURCE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".tif", ".tiff", ".avif"];

/**
 * The derivative path for one (original, width, format) triple.
 * See the PATH CONVENTION block at the top of this file.
 */
function derivativePath(originalPath, width, ext) {
  const dir = path.dirname(originalPath);
  const base = path.basename(originalPath, path.extname(originalPath));
  return path.join(dir, `${base}-${width}${ext}`);
}

/**
 * True when `filePath` looks like something this module produced, so a
 * directory walk does not try to make derivatives of derivatives.
 */
function isDerivativePath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== ".webp" && ext !== ".avif") return false;
  const base = path.basename(filePath, ext);
  const match = /-(\d+)$/.exec(base);
  return !!match && DERIVATIVE_WIDTHS.includes(Number(match[1]));
}

/**
 * Read the header of an image without decoding it.
 *
 * Returns `{ ok: true, ... }` for a readable image inside the pixel budget, or
 * `{ ok: false, reason }` where reason is one of:
 *   - "UNREADABLE"  — not an image sharp can parse, or a truncated/corrupt one
 *   - "TOO_LARGE"   — parses, but exceeds MAX_INPUT_PIXELS
 *
 * `displayWidth`/`displayHeight` account for EXIF Orientation: an orientation
 * of 5-8 means the stored pixels are rotated a quarter turn from how the image
 * is meant to be seen, so the axes swap once `.rotate()` has been applied.
 */
async function inspectImage(filePath) {
  let meta;
  try {
    meta = await sharp(filePath, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch (err) {
    const message = err && err.message ? err.message : "UNKNOWN_ERROR";
    // sharp raises the pixel-limit error from the same call as a parse error;
    // its text is "Input image exceeds pixel limit".
    const isLimit = /pixel limit|limitInputPixels/i.test(message);
    return { ok: false, reason: isLimit ? "TOO_LARGE" : "UNREADABLE", message };
  }

  const width = Number(meta.width) || 0;
  const height = Number(meta.height) || 0;
  if (!width || !height) {
    return { ok: false, reason: "UNREADABLE", message: "NO_DIMENSIONS" };
  }
  if (width * height > MAX_INPUT_PIXELS) {
    return { ok: false, reason: "TOO_LARGE", message: `${width}x${height}` };
  }

  const orientation = Number(meta.orientation) || 1;
  const swapped = orientation >= 5 && orientation <= 8;

  return {
    ok: true,
    format: meta.format || null,
    width,
    height,
    orientation,
    // > 1 for an animated GIF/WebP. Those are left alone — a still derivative
    // of an animation is a silent content change, not an optimisation.
    pages: Number(meta.pages) || 1,
    displayWidth: swapped ? height : width,
    displayHeight: swapped ? width : height,
  };
}

/**
 * The set of derivatives that WOULD be produced for a source of this width.
 * Pure — touches no disk. Used by the preview mode of the CLI tool.
 */
function plannedDerivatives(originalPath, displayWidth) {
  const planned = [];
  for (const width of DERIVATIVE_WIDTHS) {
    if (width >= displayWidth) continue; // never upscale
    for (const fmt of FORMATS) {
      planned.push({
        path: derivativePath(originalPath, width, fmt.ext),
        width,
        format: fmt.format,
      });
    }
  }
  return planned;
}

/**
 * Generate the derivative set for one image.
 *
 * @param {string} originalPath   Absolute path to the untouched source.
 * @param {object} [opts]
 * @param {object} [opts.info]    Result of inspectImage(), if already read.
 * @param {boolean} [opts.force]  Overwrite an existing derivative. Default false.
 * @param {boolean} [opts.skipUpToDate] Skip a derivative newer than its source.
 * @param {boolean} [opts.dryRun] Encode to memory and report the real byte
 *   count, but write nothing. This is what makes the CLI tool's preview an
 *   actual measurement rather than a guess.
 * @returns {Promise<{generated: Array, skipped: Array, failures: Array, info: object|null}>}
 *
 * Never throws for a per-file problem. A failure to encode one derivative is
 * recorded in `failures` and the rest still run; the caller decides whether
 * that matters.
 */
async function generateDerivatives(originalPath, opts = {}) {
  const { force = false, skipUpToDate = false, dryRun = false } = opts;

  const generated = [];
  const skipped = [];
  const failures = [];

  const info = opts.info || (await inspectImage(originalPath));
  if (!info.ok) {
    failures.push({ path: originalPath, reason: info.reason, message: info.message });
    return { generated, skipped, failures, info: null };
  }

  if (info.pages > 1) {
    skipped.push({ path: originalPath, reason: "ANIMATED" });
    return { generated, skipped, failures, info };
  }

  let sourceMtimeMs = 0;
  if (skipUpToDate) {
    try {
      sourceMtimeMs = fs.statSync(originalPath).mtimeMs;
    } catch {
      sourceMtimeMs = 0;
    }
  }

  for (const width of DERIVATIVE_WIDTHS) {
    if (width >= info.displayWidth) {
      skipped.push({ path: null, width, reason: "WOULD_UPSCALE" });
      continue;
    }

    for (const fmt of FORMATS) {
      const target = derivativePath(originalPath, width, fmt.ext);

      let existing = null;
      try {
        existing = fs.statSync(target);
      } catch {
        existing = null;
      }

      if (existing) {
        if (skipUpToDate && existing.mtimeMs >= sourceMtimeMs) {
          skipped.push({ path: target, width, format: fmt.format, reason: "UP_TO_DATE" });
          continue;
        }
        if (!force) {
          skipped.push({ path: target, width, format: fmt.format, reason: "EXISTS" });
          continue;
        }
      }

      try {
        const pipeline = sharp(originalPath, { limitInputPixels: MAX_INPUT_PIXELS })
          // No argument: apply the EXIF Orientation to the pixels, then forget
          // it. Must come before resize so the width means what it looks like.
          .rotate()
          .resize({ width, withoutEnlargement: true })
          // No withMetadata()/keepMetadata() anywhere: sharp writes no EXIF,
          // XMP, IPTC or GPS unless explicitly told to.
          .toFormat(fmt.format, fmt.options);

        const out = dryRun ? (await pipeline.toBuffer({ resolveWithObject: true })).info : await pipeline.toFile(target);

        generated.push({
          path: target,
          width: out.width,
          height: out.height,
          format: fmt.format,
          bytes: out.size,
        });
      } catch (err) {
        failures.push({
          path: target,
          width,
          format: fmt.format,
          reason: "ENCODE_FAILED",
          message: err && err.message ? err.message : "UNKNOWN_ERROR",
        });
      }
    }
  }

  return { generated, skipped, failures, info };
}

module.exports = {
  DERIVATIVE_WIDTHS,
  FORMATS,
  MAX_INPUT_PIXELS,
  RESPONSIVE_WIDTHS,
  SOURCE_EXTENSIONS,
  THUMBNAIL_WIDTH,
  derivativePath,
  generateDerivatives,
  inspectImage,
  isDerivativePath,
  plannedDerivatives,
};
