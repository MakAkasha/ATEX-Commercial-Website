#!/usr/bin/env node
"use strict";

/**
 * One-off generator for responsive image derivatives over committed static
 * assets (the upload route does the same thing for new uploads — both share
 * server/utils/imageDerivatives.js, which is the single definition of the
 * widths, the encoder settings and the path convention).
 *
 * Same safety posture as the database tools under tools/ (see tools/lib/cli.js):
 *
 *   PREVIEW BY DEFAULT. An argument-less run writes nothing. The preview is a
 *   real measurement, not an estimate: every derivative is actually encoded in
 *   memory so the reported "bytes out" is the number you would get on disk.
 *   That makes preview slower than a guess would be, and worth it.
 *
 * Unlike those tools this one touches no database — it reads and writes files.
 * Two rules it never breaks:
 *
 *   - It never modifies or deletes a source image. Output is additive only.
 *   - It never overwrites an existing file unless --force is passed.
 *
 * Usage:
 *   node tools/generate-image-derivatives.js                 # preview
 *   node tools/generate-image-derivatives.js --apply         # write
 *   node tools/generate-image-derivatives.js --dir uploads --apply
 */

const fs = require("fs");
const path = require("path");

const { fail, parseArgs } = require("./lib/cli");
const {
  DERIVATIVE_WIDTHS,
  FORMATS,
  MAX_INPUT_PIXELS,
  SOURCE_EXTENSIONS,
  THUMBNAIL_WIDTH,
  generateDerivatives,
  inspectImage,
  isDerivativePath,
} = require("../server/utils/imageDerivatives");

const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_DIR = path.join(REPO_ROOT, "assets");

/**
 * A file below this size is left alone. At a few KB the source is already
 * smaller than the HTTP overhead of the extra requests a <picture> element
 * would make to fetch a derivative, so generating one is a net loss.
 */
const MIN_SOURCE_BYTES = 8 * 1024;

/**
 * Filenames that are icons rather than content images. A favicon or a
 * touch icon is consumed at one fixed size by the browser from a <link> tag —
 * it is never served through a responsive <picture>, so a 320px WebP of it is
 * dead weight in the repository.
 */
const ICON_NAME_PATTERN = /^(favicon|apple-touch-icon|atex-icon|.*-icon)([-.]|$)/i;

const HELP = `
generate-image-derivatives — responsive WebP/AVIF derivatives for static images

  node tools/generate-image-derivatives.js [--dir <path>] [--apply] [--force]

Options:
  --dir <path>   Directory to walk (default: ${DEFAULT_DIR})
  --apply        Write the derivatives. Without it, nothing is written.
  --force        Overwrite an existing derivative. Default: never overwrite.
  --dry-run      Alias for the default preview mode.
  --help, -h     This text.

What it produces, for every raster source wider than ${THUMBNAIL_WIDTH}px:

  <dir>/<name>-<width>.webp      and      <dir>/<name>-<width>.avif

for width in ${DERIVATIVE_WIDTHS.join(", ")}. A width at or above the source's own
width is skipped — this never upscales. Metadata (EXIF/GPS) is stripped and the
EXIF orientation is baked into the pixels.

What it skips, and why:
  - Anything that is not a raster image (${SOURCE_EXTENSIONS.join(" ")}).
    SVG and .ico are vector/multi-size by nature; a raster derivative of either
    is pointless.
  - Files matching ${ICON_NAME_PATTERN} — favicons and touch icons are fetched at
    one fixed size from a <link>, never through a responsive <picture>.
  - Files under ${MIN_SOURCE_BYTES} bytes — already smaller than the request
    overhead of fetching a variant.
  - Sources at or under ${THUMBNAIL_WIDTH}px wide — every width would upscale.
  - Animated images (multi-page GIF/WebP) — a still derivative of an animation
    is a silent content change, not an optimisation.
  - Files this tool already produced (<name>-<width>.webp/.avif).
  - Sources above ${MAX_INPUT_PIXELS.toLocaleString("en-US")} pixels — reported as an error, never decoded.

PREVIEW BY DEFAULT. Run with no arguments, read the summary, then re-run with
--apply. --apply writes files into the source tree; there is no undo beyond
deleting them again.
`;

function walkFiles(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    throw new Error(`cannot read directory ${dir}: ${err.message}`);
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function rel(p) {
  return path.relative(REPO_ROOT, p).replace(/\\/g, "/");
}

/** Why this file is not a derivative source, or null if it is one. */
function excludeReason(filePath, stat) {
  const ext = path.extname(filePath).toLowerCase();
  if (!SOURCE_EXTENSIONS.includes(ext)) return "not-a-raster-source";
  if (isDerivativePath(filePath)) return "already-a-derivative";
  if (ICON_NAME_PATTERN.test(path.basename(filePath))) return "icon";
  if (stat.size < MIN_SOURCE_BYTES) return "tiny";
  return null;
}

async function main() {
  const opts = parseArgs();

  if (opts.help) {
    console.log(HELP.trim());
    process.exit(0);
  }
  if (opts.apply && opts.dryRun) {
    fail("--apply and --dry-run contradict each other. Pass neither to preview, or --apply to write.");
  }

  const dirIndex = opts.args.indexOf("--dir");
  if (dirIndex !== -1) {
    const value = opts.args[dirIndex + 1];
    if (!value || value.startsWith("--")) fail("--dir requires a path argument.");
  }
  const targetDir = dirIndex === -1 ? DEFAULT_DIR : path.resolve(opts.args[dirIndex + 1]);
  const force = opts.args.includes("--force");
  const apply = opts.apply;

  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    fail(`directory not found: ${targetDir}`);
  }

  console.log("generate-image-derivatives");
  console.log(`Dir: ${targetDir}`);
  console.log(apply ? "Mode: APPLY — writing derivatives" : "Mode: PREVIEW (no files written) — pass --apply to write");
  console.log(
    `Set: ${DERIVATIVE_WIDTHS.join("/")}px x ${FORMATS.map((f) => f.format).join("/")}` +
      (force ? " (--force: existing derivatives will be overwritten)" : "")
  );
  console.log("");

  const files = walkFiles(targetDir);

  const excluded = new Map();
  const sources = [];
  for (const file of files) {
    const stat = fs.statSync(file);
    const reason = excludeReason(file, stat);
    if (reason) {
      excluded.set(reason, (excluded.get(reason) || 0) + 1);
      continue;
    }
    sources.push({ path: file, size: stat.size });
  }

  let bytesIn = 0;
  let bytesOut = 0;
  let generatedCount = 0;
  let skippedCount = 0;
  const skipReasons = new Map();
  const sourceSkipReasons = new Map();
  const errors = [];

  for (const source of sources) {
    const info = await inspectImage(source.path);
    if (!info.ok) {
      errors.push(`${rel(source.path)}: ${info.reason} (${info.message})`);
      continue;
    }
    if (info.pages > 1) {
      sourceSkipReasons.set("animated", (sourceSkipReasons.get("animated") || 0) + 1);
      continue;
    }
    if (info.displayWidth <= THUMBNAIL_WIDTH) {
      sourceSkipReasons.set("too-narrow", (sourceSkipReasons.get("too-narrow") || 0) + 1);
      continue;
    }

    const result = await generateDerivatives(source.path, {
      info,
      force,
      skipUpToDate: true,
      dryRun: !apply,
    });

    for (const failure of result.failures) {
      errors.push(`${rel(failure.path || source.path)}: ${failure.reason} (${failure.message})`);
    }

    const realSkips = result.skipped.filter((s) => s.reason !== "WOULD_UPSCALE");
    for (const skip of realSkips) {
      skipReasons.set(skip.reason, (skipReasons.get(skip.reason) || 0) + 1);
    }
    skippedCount += realSkips.length;

    if (result.generated.length) {
      bytesIn += source.size;
      for (const d of result.generated) bytesOut += d.bytes;
      generatedCount += result.generated.length;

      const label = apply ? "wrote" : "would write";
      console.log(
        `${label} ${result.generated.length} for ${rel(source.path)} ` +
          `(${info.displayWidth}x${info.displayHeight}, ${formatBytes(source.size)})`
      );
      for (const d of result.generated) {
        console.log(`    ${rel(d.path)}  ${d.width}x${d.height}  ${formatBytes(d.bytes)}`);
      }
    }
  }

  console.log("");
  console.log("Summary");
  const tally = (map) => [...map].map(([k, v]) => `${k}=${v}`).join(", ");
  console.log(`  files walked                  : ${files.length}`);
  console.log(`  source images considered      : ${sources.length}`);
  console.log(`  sources skipped whole         : ${[...sourceSkipReasons.values()].reduce((a, b) => a + b, 0)}${sourceSkipReasons.size ? ` (${tally(sourceSkipReasons)})` : ""}`);
  console.log(`  derivatives ${apply ? "written          " : "that would be written"} : ${generatedCount}`);
  console.log(`  derivatives skipped           : ${skippedCount}${skippedCount ? ` (${tally(skipReasons)})` : ""}`);
  console.log(`  bytes in  (sources that produced output) : ${formatBytes(bytesIn)} (${bytesIn})`);
  console.log(`  bytes out (all derivatives)              : ${formatBytes(bytesOut)} (${bytesOut})`);
  if (excluded.size) {
    console.log(`  files excluded from the walk  : ${tally(excluded)}`);
  }

  if (errors.length) {
    console.log("");
    console.error(`ERRORS (${errors.length}):`);
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }

  if (!apply) {
    console.log("");
    console.log("Nothing was written. Re-run with --apply to write these files.");
  }
}

main().catch((err) => {
  fail(err && err.stack ? err.stack : String(err));
});
