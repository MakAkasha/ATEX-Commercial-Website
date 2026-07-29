/**
 * Renames the four machine-generated blog slugs ("P422904", ...) to readable,
 * SEO-friendly slugs.
 *
 * The old URLs stay alive: server/data/blogRedirects.js 301-redirects each old
 * slug to its new one, and that map is the source of truth for the mapping
 * below (imported, not copied, so the two can never drift apart).
 *
 * Safe to run repeatedly: a second run finds no old slugs and reports zero
 * changes. Keyed on slug, never on row id. Only posts.slug is written.
 *
 * posts.slug carries a UNIQUE constraint, so a rename into an already-taken
 * slug would throw. This script checks first and SKIPs those rows with a clear
 * message instead — it never overwrites or deletes an existing post.
 *
 * Usage:
 *   node tools/rename-blog-slugs.js --dry-run
 *   node tools/rename-blog-slugs.js
 *   node tools/rename-blog-slugs.js --db /path/to/data.sqlite
 */

const path = require("path");
const Database = require("better-sqlite3");

const { RAW_REDIRECTS } = require("../server/data/blogRedirects");

// old slug -> new slug. Single source of truth lives in blogRedirects.js.
const SLUG_RENAMES = RAW_REDIRECTS;

function pad(value, width) {
  const s = String(value);
  return s + " ".repeat(Math.max(0, width - s.length));
}

function printTable(rows) {
  if (!rows.length) return;
  const headers = ["OLD SLUG", "NEW SLUG", "RESULT"];
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

function run() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const dbFlag = args.indexOf("--db");
  const dbPath =
    dbFlag !== -1 && args[dbFlag + 1]
      ? path.resolve(args[dbFlag + 1])
      : path.resolve(__dirname, "..", "server", "data.sqlite");

  const db = new Database(dbPath);
  const entries = Object.entries(SLUG_RENAMES);

  console.log(`DB: ${dbPath}`);
  console.log(`Mode: ${dryRun ? "DRY RUN (no writes)" : "APPLY"}`);
  console.log(`Renames defined: ${entries.length}`);

  const findBySlug = db.prepare("SELECT id, slug, title FROM posts WHERE slug = ?");
  const updateSlug = db.prepare(
    "UPDATE posts SET slug = ?, updated_at = datetime('now') WHERE slug = ?"
  );

  const table = [];
  let changed = 0;

  entries.forEach(([oldSlug, newSlug]) => {
    const source = findBySlug.get(oldSlug);
    const target = findBySlug.get(newSlug);

    if (!source) {
      // Either already renamed on a previous run, or this DB never had the row.
      const note = target ? "SKIP (already renamed)" : "SKIP (old slug not in DB)";
      console.log(`SKIP    ${oldSlug}: no post with this slug${target ? " — new slug already present" : ""}`);
      table.push([oldSlug, newSlug, note]);
      return;
    }

    if (target) {
      // UNIQUE(slug) would reject this. Report loudly, touch nothing.
      console.log(
        `CONFLICT ${oldSlug} -> ${newSlug}: target slug already taken by post id ${target.id} ("${target.title}"). Not renaming post id ${source.id}.`
      );
      table.push([oldSlug, newSlug, `SKIP (target taken by id ${target.id})`]);
      return;
    }

    if (!dryRun) updateSlug.run(newSlug, oldSlug);
    changed += 1;
    console.log(
      `${dryRun ? "WOULD  " : "RENAMED"} ${oldSlug} -> ${newSlug} (post id ${source.id}: "${source.title}")`
    );
    table.push([oldSlug, newSlug, dryRun ? "WOULD RENAME" : "RENAMED"]);
  });

  printTable(table);

  const remaining = db
    .prepare("SELECT slug FROM posts WHERE slug LIKE 'P______' ORDER BY slug")
    .all()
    .map((r) => r.slug)
    .filter((s) => /^P\d{6}$/.test(s));
  if (remaining.length) {
    console.log(
      `WARN: machine-generated slugs still in the DB after this run (unmapped, or skipped above): ${remaining.join(", ")}`
    );
  }

  db.close();
  console.log(`${dryRun ? "Would change" : "Changed"}: ${changed} post(s)`);
}

if (require.main === module) run();

module.exports = { SLUG_RENAMES };
