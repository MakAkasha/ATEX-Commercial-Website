/**
 * Repairs broken and un-optimised product image paths in the `products` table.
 *
 * Both problems live in the data, not in the code: the catalog seed in
 * server/db.js only runs when the catalog table is empty and never overwrites
 * an existing slug, so a database that was seeded before the assets changed
 * keeps its stale paths forever. This script is that repair.
 *
 *   Case A  `image` points at a file that is not on disk, but a sibling with
 *           the same basename and a different supported extension is. Example:
 *           a row still pointing at /assets/products/items/gt-38-4.png when
 *           only gt-38-4.jpg was ever committed -> broken product card.
 *   Case B  `image` resolves, but a smaller modern sibling (.webp/.avif)
 *           exists. Commit 1ad3c38 re-encoded the product images and noted the
 *           matching DB update was still owed; this is that update, discovered
 *           at runtime rather than hardcoded to a slug list.
 *   Case C  `image` is missing and no sibling exists. Reported loudly, never
 *           guessed at, and left alone for manual attention.
 *
 * Preview by default: an argument-less run reports and writes nothing. Writing
 * requires BOTH --apply and --i-have-a-backup, because this mutates live data.
 *
 * Only products.image is ever written, inside a single transaction. No row is
 * inserted or deleted. (The schema's own products_updated_at trigger bumps
 * updated_at on any UPDATE — that is the database doing its own bookkeeping,
 * not this script writing a second column.)
 *
 * Safe to run repeatedly: after --apply, a second run reports zero changes.
 *
 * Usage:
 *   node tools/fix-product-image-paths.js
 *   node tools/fix-product-image-paths.js --dry-run
 *   node tools/fix-product-image-paths.js --apply --i-have-a-backup
 *   node tools/fix-product-image-paths.js --db /path/to/data.sqlite
 *   node tools/fix-product-image-paths.js --assets-root /srv/atex/assets
 */

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const ROOT_DIR = path.resolve(__dirname, "..");

// Web paths are served from <repo>/assets by server/app.js.
const ASSETS_PREFIX = "/assets/";

// Preference order when several siblings exist: modern and small first.
const EXT_PREFERENCE = [".webp", ".avif", ".jpg", ".jpeg", ".png", ".gif", ".svg"];

// Formats worth swapping *to* when the current file already resolves.
const MODERN_EXTS = [".webp", ".avif"];

// Never rasterise a vector: an .svg is not "un-optimised" just because a
// smaller .webp sits next to it.
const VECTOR_EXTS = [".svg"];

const USAGE = `ATEX product image path repair

Finds product rows whose \`image\` points at a file that is missing (a sibling
with another extension exists) or at a needlessly large file (a smaller .webp
or .avif sibling exists), and repoints them.

Usage:
  node tools/fix-product-image-paths.js [options]

Options:
  --dry-run             Preview only. This is the default; accepted as an alias.
  --apply               Write the changes. Requires --i-have-a-backup.
  --i-have-a-backup     Acknowledge you have a database backup. Required with
                        --apply. Run \`npm run backup:db\` first if unsure.
  --db <path>           Database file. Default: $DB_PATH, else server/data.sqlite
  --assets-root <path>  Directory served as /assets. Default: <repo>/assets
  --help, -h            Show this help and exit.

Preview by default — an argument-less run writes nothing.

Examples:
  node tools/fix-product-image-paths.js
  node tools/fix-product-image-paths.js --apply --i-have-a-backup
  DB_PATH=/srv/atex/server/data.sqlite node tools/fix-product-image-paths.js`;

function parseArgs(argv) {
  const opts = {
    help: false,
    apply: false,
    dryRunFlag: false,
    backupAck: false,
    db: null,
    assetsRoot: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else if (arg === "--apply") {
      opts.apply = true;
    } else if (arg === "--dry-run") {
      opts.dryRunFlag = true;
    } else if (arg === "--i-have-a-backup") {
      opts.backupAck = true;
    } else if (arg === "--db") {
      opts.db = argv[i + 1];
      if (!opts.db) throw new Error("--db requires a path");
      i += 1;
    } else if (arg === "--assets-root") {
      opts.assetsRoot = argv[i + 1];
      if (!opts.assetsRoot) throw new Error("--assets-root requires a path");
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (opts.apply && opts.dryRunFlag) {
    throw new Error("--apply and --dry-run contradict each other; pass one or neither");
  }
  return opts;
}

function resolveDbPath(flagValue) {
  if (flagValue) return path.resolve(flagValue);
  if (process.env.DB_PATH) return path.resolve(process.env.DB_PATH);
  return path.join(ROOT_DIR, "server", "data.sqlite");
}

function fileSize(target) {
  try {
    const stat = fs.statSync(target);
    return stat.isFile() ? stat.size : null;
  } catch {
    return null;
  }
}

/**
 * Maps a web path like /assets/products/items/x.webp onto its on-disk file,
 * refusing anything that escapes the assets root.
 */
function webPathToDisk(assetsRoot, image) {
  const withoutSuffix = image.split("#")[0].split("?")[0];
  let rel = withoutSuffix.slice(ASSETS_PREFIX.length);
  try {
    rel = decodeURIComponent(rel);
  } catch {
    return { ok: false, reason: "malformed percent-encoding" };
  }
  if (!rel.trim()) return { ok: false, reason: "no file component after /assets/" };

  const abs = path.resolve(assetsRoot, rel);
  const prefix = assetsRoot.endsWith(path.sep) ? assetsRoot : assetsRoot + path.sep;
  if (!abs.startsWith(prefix)) {
    return { ok: false, reason: "path escapes the assets root" };
  }
  return { ok: true, abs };
}

function diskToWebPath(assetsRoot, abs) {
  const rel = path.relative(assetsRoot, abs).split(path.sep).join("/");
  return `${ASSETS_PREFIX}${rel}`;
}

/**
 * Decides what should happen to one `image` value.
 * Returns { status: SKIP | REJECTED | OK | A | B | C, ... }.
 */
function classify(image, assetsRoot) {
  const raw = String(image == null ? "" : image).trim();
  if (!raw) return { status: "SKIP", note: "empty image" };
  if (!raw.startsWith(ASSETS_PREFIX)) {
    return { status: "SKIP", note: "not an /assets/ path" };
  }

  const resolved = webPathToDisk(assetsRoot, raw);
  if (!resolved.ok) return { status: "REJECTED", note: resolved.reason };

  const currentAbs = resolved.abs;
  const currentSize = fileSize(currentAbs);
  const dir = path.dirname(currentAbs);
  const currentExt = path.extname(currentAbs).toLowerCase();
  const base = path.basename(currentAbs, path.extname(currentAbs));

  const sibling = (ext) => {
    const candidate = path.join(dir, base + ext);
    // Case-insensitive compare: on Windows x.PNG and x.png are one file.
    if (candidate.toLowerCase() === currentAbs.toLowerCase()) return null;
    const size = fileSize(candidate);
    return size === null ? null : { abs: candidate, size };
  };

  if (currentSize === null) {
    for (const ext of EXT_PREFERENCE) {
      const candidate = sibling(ext);
      if (candidate) {
        return {
          status: "A",
          proposed: diskToWebPath(assetsRoot, candidate.abs),
          currentSize: null,
          proposedSize: candidate.size,
        };
      }
    }
    return { status: "C", note: "file missing and no sibling with a supported extension" };
  }

  if (!VECTOR_EXTS.includes(currentExt)) {
    for (const ext of MODERN_EXTS) {
      const candidate = sibling(ext);
      if (candidate && candidate.size < currentSize) {
        return {
          status: "B",
          proposed: diskToWebPath(assetsRoot, candidate.abs),
          currentSize,
          proposedSize: candidate.size,
        };
      }
    }
  }

  return { status: "OK", currentSize };
}

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return "-";
  const sign = bytes < 0 ? "-" : "";
  const abs = Math.abs(bytes);
  if (abs < 1024) return `${sign}${abs} B`;
  if (abs < 1024 * 1024) return `${sign}${(abs / 1024).toFixed(1)} KB`;
  return `${sign}${(abs / (1024 * 1024)).toFixed(2)} MB`;
}

function pad(value, width) {
  const s = String(value);
  return s + " ".repeat(Math.max(0, width - s.length));
}

function printTable(headers, rows) {
  if (!rows.length) return;
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i]).length))
  );
  const line = (cells) => cells.map((c, i) => pad(c, widths[i])).join("  |  ");
  console.log("");
  console.log(line(headers));
  console.log(widths.map((w) => "-".repeat(w)).join("--+--"));
  rows.forEach((r) => console.log(line(r)));
  console.log("");
}

function hasIsCatalogColumn(db) {
  return db
    .prepare("PRAGMA table_info(products)")
    .all()
    .some((c) => c.name === "is_catalog");
}

function groupLabel(isCatalog) {
  return Number(isCatalog) === 1 ? "catalog" : "home";
}

function run(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    console.error("");
    console.error(USAGE);
    return 1;
  }

  if (opts.help) {
    console.log(USAGE);
    return 0;
  }

  const dbPath = resolveDbPath(opts.db);
  const assetsRoot = opts.assetsRoot
    ? path.resolve(opts.assetsRoot)
    : path.join(ROOT_DIR, "assets");

  console.log("ATEX product image path repair");
  console.log(`Mode:        ${opts.apply ? "APPLY (writes to the database)" : "PREVIEW (no writes)"}`);
  console.log(`Database:    ${dbPath}`);
  console.log(`Assets root: ${assetsRoot}`);
  console.log("");

  if (opts.apply && !opts.backupAck) {
    console.error("REFUSED: --apply mutates live product data.");
    console.error("Back the database up first:  npm run backup:db");
    console.error("Then re-run with:            --apply --i-have-a-backup");
    return 1;
  }

  if (!fs.existsSync(dbPath)) {
    console.error(`REFUSED: database not found at ${dbPath}`);
    console.error("This tool never creates a database. Check --db or $DB_PATH.");
    return 1;
  }

  if (!fs.existsSync(assetsRoot)) {
    console.error(`REFUSED: assets root not found at ${assetsRoot}`);
    console.error("Every row would look broken. Point --assets-root at the served assets/ directory.");
    return 1;
  }

  let db;
  try {
    db = new Database(dbPath, { fileMustExist: true });
    db.pragma("journal_mode = WAL");
  } catch (err) {
    console.error(`ERROR: could not open ${dbPath}: ${err.message}`);
    return 1;
  }

  try {
    return inspectAndMaybeApply(db, assetsRoot, opts);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    return 1;
  } finally {
    db.close();
  }
}

function inspectAndMaybeApply(db, assetsRoot, opts) {
  const hasCatalogCol = hasIsCatalogColumn(db);
  const select = hasCatalogCol
    ? "SELECT id, slug, image, is_catalog FROM products ORDER BY is_catalog DESC, slug"
    : "SELECT id, slug, image, 0 AS is_catalog FROM products ORDER BY slug";

  let rows;
  try {
    rows = db.prepare(select).all();
  } catch (err) {
    throw new Error(`could not read the products table: ${err.message}`);
  }

  const table = [];
  const changes = [];
  const unresolvable = [];
  const rejected = [];
  const counts = { A: 0, B: 0, C: 0, OK: 0, SKIP: 0, REJECTED: 0 };
  const perGroup = {};
  let bytesSaved = 0;

  rows.forEach((row) => {
    const group = groupLabel(row.is_catalog);
    if (!perGroup[group]) perGroup[group] = { rows: 0, A: 0, B: 0, C: 0, REJECTED: 0, bytesSaved: 0 };
    perGroup[group].rows += 1;

    const verdict = classify(row.image, assetsRoot);
    counts[verdict.status] += 1;

    if (verdict.status === "OK" || verdict.status === "SKIP") return;

    if (verdict.status === "REJECTED") {
      perGroup[group].REJECTED += 1;
      rejected.push({ slug: row.slug, image: row.image, note: verdict.note });
      table.push([row.slug, group, "REJECTED", String(row.image), `- (${verdict.note})`, "-"]);
      return;
    }

    if (verdict.status === "C") {
      perGroup[group].C += 1;
      unresolvable.push({ slug: row.slug, image: row.image, note: verdict.note });
      table.push([row.slug, group, "C", String(row.image), "- (unresolvable)", "-"]);
      return;
    }

    perGroup[group][verdict.status] += 1;
    const delta = verdict.currentSize === null ? null : verdict.currentSize - verdict.proposedSize;
    if (delta !== null && delta > 0) {
      bytesSaved += delta;
      perGroup[group].bytesSaved += delta;
    }

    changes.push({ id: row.id, slug: row.slug, from: String(row.image), to: verdict.proposed });
    table.push([
      row.slug,
      group,
      verdict.status,
      String(row.image),
      verdict.proposed,
      verdict.currentSize === null ? "- (was missing)" : formatBytes(delta),
    ]);
  });

  printTable(["SLUG", "SET", "CASE", "CURRENT IMAGE", "PROPOSED IMAGE", "SAVED"], table);
  if (!table.length) console.log("Nothing to repair: every product image already resolves to its best file.\n");

  if (opts.apply && changes.length) {
    const update = db.prepare("UPDATE products SET image = ? WHERE id = ?");
    const applyAll = db.transaction((pending) => {
      pending.forEach((change) => update.run(change.to, change.id));
    });
    applyAll(changes);
    changes.forEach((c) => console.log(`UPDATED ${c.slug}: ${c.from} -> ${c.to}`));
    if (changes.length) console.log("");
  }

  console.log("Summary");
  console.log(`  Rows examined:      ${rows.length}`);
  Object.keys(perGroup)
    .sort()
    .forEach((group) => {
      const g = perGroup[group];
      console.log(
        `    is_catalog ${group === "catalog" ? "1 (catalog)" : "0 (home)   "}: ${g.rows} row(s), ` +
          `Case A ${g.A}, Case B ${g.B}, unresolvable ${g.C}, rejected ${g.REJECTED}, saved ${formatBytes(g.bytesSaved)}`
      );
    });
  console.log(`  Case A (missing file, sibling found):  ${counts.A}`);
  console.log(`  Case B (smaller modern sibling found): ${counts.B}`);
  console.log(`  Case C (unresolvable, left alone):     ${counts.C}`);
  console.log(`  Rejected (unsafe path, left alone):    ${counts.REJECTED}`);
  console.log(`  Already optimal:                       ${counts.OK}`);
  console.log(`  Skipped (empty or non-/assets/ path):  ${counts.SKIP}`);
  console.log(`  Total bytes saved:                     ${formatBytes(bytesSaved)} (${bytesSaved} bytes)`);
  console.log(`  ${opts.apply ? "Rows written" : "Rows that would change"}:                ${changes.length}`);

  if (rejected.length) {
    console.log("");
    console.log("!! UNSAFE IMAGE PATHS — rejected, not changed, need manual attention:");
    rejected.forEach((r) => console.log(`   ${r.slug}: ${r.image}   (${r.note})`));
  }

  if (unresolvable.length) {
    console.log("");
    console.log("!! UNRESOLVABLE — no file on disk for these rows, and no sibling to fall back to.");
    console.log("   These product cards are broken and need a real image uploaded or the path corrected:");
    unresolvable.forEach((u) => console.log(`   ${u.slug}: ${u.image}`));
  }

  if (!opts.apply) {
    console.log("");
    console.log("No changes written. Re-run with --apply --i-have-a-backup to apply.");
  }

  return 0;
}

if (require.main === module) {
  process.exitCode = run(process.argv.slice(2));
}

module.exports = { classify, webPathToDisk, EXT_PREFERENCE, MODERN_EXTS };
