/**
 * Strips leaked internal AI content-brief sections out of already-published
 * posts.content_html.
 *
 * Background: posts imported before tools/import-blog-seeds.js gained
 * trimToPublishableMarkdown() still carry the trailing content-brief
 * ("Image Plan", "Suggested Implementation Notes for AI Agent", ...) as
 * visible article body. This trims those rows in place.
 *
 * The heading list below is copied verbatim from
 * tools/import-blog-seeds.js -> INTERNAL_GUIDANCE_HEADINGS (source of truth).
 * Kept inline so this script is self-contained and can be dropped onto a
 * server on its own. If the import tool's list changes, update this too.
 *
 * Safe to run repeatedly: rows with no guidance heading are left untouched.
 *
 * Usage:
 *   node tools/strip-blog-internal-guidance.js --dry-run
 *   node tools/strip-blog-internal-guidance.js
 *   node tools/strip-blog-internal-guidance.js --db /path/to/data.sqlite
 */

const path = require("path");
const Database = require("better-sqlite3");

const INTERNAL_GUIDANCE_HEADINGS = [
  "image plan",
  "free-to-use image source pools",
  "suggested blog page structure",
  "suggested implementation notes for ai agent",
  "optional related articles ideas",
  "reference links used for research",
];

const LEAK_MARKERS = [
  "AI Agent",
  "Image Plan",
  "Free-to-Use",
  "REPLACE_WITH",
  "pexels.com",
  "unsplash.com",
  "Suggested Blog Page Structure",
  "Reference Links Used",
  "Optional Related Articles",
];

function normalizeHeadingText(html) {
  return String(html)
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function findGuidanceStart(contentHtml) {
  const headingRe = /<h([2-4])(?:\s[^>]*)?>([\s\S]*?)<\/h\1>/gi;
  let match;
  while ((match = headingRe.exec(contentHtml)) !== null) {
    if (INTERNAL_GUIDANCE_HEADINGS.includes(normalizeHeadingText(match[2]))) {
      return match.index;
    }
  }
  return -1;
}

function trimTrailingSeparators(html) {
  let out = html.trimEnd();
  let previous;
  do {
    previous = out;
    out = out.replace(/(?:<hr\s*\/?>)\s*$/i, "").trimEnd();
  } while (out !== previous);
  return out;
}

function stripInternalGuidance(contentHtml) {
  const start = findGuidanceStart(contentHtml);
  if (start === -1) return null;
  return trimTrailingSeparators(contentHtml.slice(0, start));
}

function findMarkers(value) {
  if (typeof value !== "string") return [];
  return LEAK_MARKERS.filter((marker) => value.includes(marker));
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
  const rows = db.prepare("SELECT slug, title, excerpt, content_html FROM posts").all();

  console.log(`DB: ${dbPath}`);
  console.log(`Mode: ${dryRun ? "DRY RUN (no writes)" : "APPLY"}`);
  console.log(`Posts scanned: ${rows.length}`);

  const update = db.prepare(
    "UPDATE posts SET content_html = ?, updated_at = datetime('now') WHERE slug = ?"
  );

  let changed = 0;
  rows.forEach((row) => {
    const titleMarkers = findMarkers(row.title);
    const excerptMarkers = findMarkers(row.excerpt);
    if (titleMarkers.length) {
      console.log(`WARN ${row.slug}: title contains ${titleMarkers.join(", ")} (not auto-cleaned)`);
    }
    if (excerptMarkers.length) {
      console.log(`WARN ${row.slug}: excerpt contains ${excerptMarkers.join(", ")} (not auto-cleaned)`);
    }

    const cleaned = stripInternalGuidance(row.content_html || "");
    if (cleaned === null) {
      console.log(`SKIP    ${row.slug} (clean, ${(row.content_html || "").length} chars)`);
      return;
    }

    const before = row.content_html.length;
    const after = cleaned.length;
    if (!dryRun) update.run(cleaned, row.slug);
    changed += 1;
    console.log(
      `${dryRun ? "WOULD  " : "CLEANED"} ${row.slug}: ${before} -> ${after} chars (removed ${before - after})`
    );

    const residual = findMarkers(cleaned);
    if (residual.length) {
      console.log(`WARN ${row.slug}: residual markers after strip: ${residual.join(", ")}`);
    }
  });

  db.close();
  console.log(`${dryRun ? "Would change" : "Changed"}: ${changed} post(s)`);
}

if (require.main === module) run();

module.exports = { stripInternalGuidance, findGuidanceStart, INTERNAL_GUIDANCE_HEADINGS, LEAK_MARKERS };
