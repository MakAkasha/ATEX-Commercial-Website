/**
 * Imports the markdown seed files in content-src/blog-seed/ into posts.
 *
 * Preview by default: without --apply nothing is written.
 *
 * DEPLOY ORDER — restart the app BEFORE running this tool. tools/lib/cli.js
 * openDb() opens the database raw and never migrates it; only server/db.js
 * migrate() does, and only at app boot. Against an unmigrated database this
 * tool has no `meta_description` column to write to, and stops with
 * DATABASE_NOT_MIGRATED.
 *
 * Usage:
 *   node tools/import-blog-seeds.js
 *   node tools/import-blog-seeds.js --apply
 *   node tools/import-blog-seeds.js --apply --db /path/to/data.sqlite
 *   node tools/import-blog-seeds.js --apply --only some-slug --only other-slug
 *   node tools/import-blog-seeds.js --help
 */

const fs = require("fs");
const path = require("path");

const cli = require("./lib/cli");

const ROOT = path.resolve(__dirname, "..");
const SEED_DIR = path.join(ROOT, "content-src", "blog-seed");

const HELP = `
Usage: node tools/import-blog-seeds.js [options]

Imports the seed files in content-src/blog-seed/ into the posts table: INSERT
when the slug is new, UPDATE when it already exists. Internal content-brief
sections are trimmed off and image placeholders resolved first. A body that is
already final HTML is stored as-is; only a markdown body is converted.

A new post is inserted published. An existing post keeps whatever published
value it already has, so re-importing never republishes a post an admin
deliberately unpublished.

DEPLOY ORDER: restart the app BEFORE running this tool. This tool opens the
database raw and never migrates it - only the app does, at boot. Run it against
an unmigrated database and it stops with DATABASE_NOT_MIGRATED.

Options:
  --apply        Write the imported posts. Without it this tool only previews.
  --dry-run      Accepted for backwards compatibility; same as the default preview.
  --db <path>    Database file to use.
  --only <slug>  Restrict the run to this slug. Repeatable. Every other seed
                 file is left completely alone - not read against the database,
                 not written. Use this when the stored copy of a post has been
                 edited since it was seeded and must not be reverted.
  -h, --help     Show this help and exit.
${cli.COMMON_HELP_FOOTER}`;

const IMAGE_MAP = {
  smart_home_system_saudi_arabia_guide: {
    REPLACE_WITH_FEATURED_IMAGE_URL: "/uploads/images/2026/03/blog/smart-home-featured.jpg",
    REPLACE_WITH_SECTION_IMAGE_1_URL: "/uploads/images/2026/03/blog/smart-home-controls.jpg",
    REPLACE_WITH_SECTION_IMAGE_2_URL: "/uploads/images/2026/03/blog/smart-home-lock.jpg",
    REPLACE_WITH_SECTION_IMAGE_3_URL: "/uploads/images/2026/03/blog/smart-home-security.jpg",
    REPLACE_WITH_SECTION_IMAGE_4_URL: "/uploads/images/2026/03/blog/smart-home-thermostat.jpg",
  },
  smart_building_systems_saudi_arabia: {
    REPLACE_WITH_FEATURED_IMAGE_URL: "/uploads/images/2026/03/blog/smart-building-featured.jpg",
    REPLACE_WITH_SECTION_IMAGE_1_URL: "/uploads/images/2026/03/blog/smart-building-dashboard.jpg",
    REPLACE_WITH_SECTION_IMAGE_2_URL: "/uploads/images/2026/03/blog/smart-building-access.jpg",
    REPLACE_WITH_SECTION_IMAGE_3_URL: "/uploads/images/2026/03/blog/smart-building-security.jpg",
    REPLACE_WITH_SECTION_IMAGE_4_URL: "/uploads/images/2026/03/blog/smart-building-hvac.jpg",
  },
  smart_hotel_systems_saudi_arabia: {
    REPLACE_WITH_FEATURED_IMAGE_URL: "/uploads/images/2026/03/blog/smart-hotel-featured.jpg",
    REPLACE_WITH_SECTION_IMAGE_1_URL: "/uploads/images/2026/03/blog/smart-hotel-panel.jpg",
    REPLACE_WITH_SECTION_IMAGE_2_URL: "/uploads/images/2026/03/blog/smart-hotel-lock.jpg",
    REPLACE_WITH_SECTION_IMAGE_3_URL: "/uploads/images/2026/03/blog/smart-hotel-security.jpg",
    REPLACE_WITH_SECTION_IMAGE_4_URL: "/uploads/images/2026/03/blog/smart-hotel-room-control.jpg",
  },
};

const INTERNAL_GUIDANCE_HEADINGS = [
  "image plan",
  "free-to-use image source pools",
  "suggested blog page structure",
  "suggested implementation notes for ai agent",
  "optional related articles ideas",
  "reference links used for research",
];

function normalizeSlugKey(slug) {
  return String(slug || "").replace(/-/g, "_");
}

function stripQuotes(value) {
  const v = String(value || "").trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { meta: {}, body: content };

  const frontmatter = match[1];
  const body = content.slice(match[0].length);
  const meta = {};
  let currentArrayKey = null;

  frontmatter.split(/\r?\n/).forEach((line) => {
    const arrayItem = line.match(/^\s*-\s+(.*)$/);
    if (arrayItem && currentArrayKey) {
      if (!Array.isArray(meta[currentArrayKey])) meta[currentArrayKey] = [];
      meta[currentArrayKey].push(stripQuotes(arrayItem[1]));
      return;
    }

    // A nested block whose children are `key: value` pairs rather than list
    // items (`open_graph:` is the only one in the seed files). The pair regex
    // below is anchored at column 0, so without this the indented children match
    // nothing at all and the whole block is silently dropped.
    const nestedPair = line.match(/^\s+([a-zA-Z0-9_]+):\s*(.+)$/);
    if (nestedPair && currentArrayKey && Array.isArray(meta[currentArrayKey]) && !meta[currentArrayKey].length) {
      meta[currentArrayKey] = {};
    }
    if (nestedPair && currentArrayKey && meta[currentArrayKey] && !Array.isArray(meta[currentArrayKey])) {
      meta[currentArrayKey][nestedPair[1]] = stripQuotes(nestedPair[2]);
      return;
    }

    const pair = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (!pair) return;

    const key = pair[1];
    const rawValue = pair[2];
    if (!rawValue) {
      meta[key] = meta[key] || [];
      currentArrayKey = key;
      return;
    }

    currentArrayKey = null;
    meta[key] = stripQuotes(rawValue);
  });

  return { meta, body };
}

function inlineMarkdown(text) {
  return String(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
}

function markdownToHtml(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const out = [];
  let inUnorderedList = false;
  let inOrderedList = false;
  let inBlockquote = false;
  let blockquoteLines = [];

  const closeUnorderedList = () => {
    if (inUnorderedList) {
      out.push("</ul>");
      inUnorderedList = false;
    }
  };

  const closeOrderedList = () => {
    if (inOrderedList) {
      out.push("</ol>");
      inOrderedList = false;
    }
  };

  const closeLists = () => {
    closeUnorderedList();
    closeOrderedList();
  };

  const flushBlockquote = () => {
    if (!inBlockquote) return;
    const content = blockquoteLines.map((line) => inlineMarkdown(line)).join("<br />");
    out.push(`<blockquote><p>${content}</p></blockquote>`);
    blockquoteLines = [];
    inBlockquote = false;
  };

  const closeAllBlocks = () => {
    closeLists();
    flushBlockquote();
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      closeLists();
      inBlockquote = true;
      blockquoteLines.push(quote[1]);
      continue;
    }

    if (!line) {
      closeAllBlocks();
      continue;
    }

    if (/^---+$/.test(line)) {
      closeAllBlocks();
      out.push("<hr />");
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      closeAllBlocks();
      const level = heading[1].length;
      out.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const img = line.match(/^!\[(.*?)\]\((.*?)\)$/);
    if (img) {
      closeAllBlocks();
      out.push(`<p><img src="${img[2]}" alt="${img[1]}" loading="lazy" /></p>`);
      continue;
    }

    const li = line.match(/^[-*]\s+(.+)$/);
    if (li) {
      flushBlockquote();
      closeOrderedList();
      if (!inUnorderedList) {
        out.push("<ul>");
        inUnorderedList = true;
      }
      out.push(`<li>${inlineMarkdown(li[1])}</li>`);
      continue;
    }

    const ol = line.match(/^\d+\.\s+(.+)$/);
    if (ol) {
      flushBlockquote();
      closeUnorderedList();
      if (!inOrderedList) {
        out.push("<ol>");
        inOrderedList = true;
      }
      out.push(`<li>${inlineMarkdown(ol[1])}</li>`);
      continue;
    }

    closeAllBlocks();
    out.push(`<p>${inlineMarkdown(line)}</p>`);
  }

  closeAllBlocks();
  return out.join("\n");
}

/**
 * Newer seed files ship a body that is already final HTML, not markdown. Running
 * the line-based converter over that HTML wraps every line in a stray <p> (so
 * `<div …>` becomes `<p><div …></p>`) and destroys the article. Detect a body
 * whose first non-empty line opens an HTML tag or comment and pass it through
 * untouched.
 *
 * The test is any tag, not a fixed list of block-level ones: an article opening
 * with `<span>`, `<strong>` or `<!-- … -->` is just as much final HTML, and
 * missing it silently destroys the article. A markdown seed never starts with a
 * raw tag — the three markdown seeds in content-src/blog-seed/ all open with a
 * `#` heading — so widening the test costs nothing. test/blog.seed.html.test.js
 * pins both behaviours.
 */
const HTML_BODY_START = /^<(?:!--|[a-z][a-z0-9]*\b)/i;

function looksLikeHtmlBody(text) {
  const firstLine = String(text || "")
    .split(/\r?\n/)
    .find((line) => line.trim().length);
  return Boolean(firstLine) && HTML_BODY_START.test(firstLine.trim());
}

function bodyToHtml(body) {
  return looksLikeHtmlBody(body) ? String(body).trim() : markdownToHtml(body);
}

function trimToPublishableMarkdown(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const kept = [];

  for (const line of lines) {
    const heading = line.match(/^#{2,4}\s+(.+)$/);
    if (heading) {
      const normalized = String(heading[1]).trim().toLowerCase();
      if (INTERNAL_GUIDANCE_HEADINGS.includes(normalized)) {
        break;
      }
    }
    kept.push(line);
  }

  return kept.join("\n").trim();
}

function assertNoUnresolvedPlaceholders(markdown, slug) {
  const unresolved = String(markdown || "").match(/REPLACE_WITH_[A-Z0-9_]+/g) || [];
  if (!unresolved.length) return;
  throw new Error(`UNRESOLVED_PLACEHOLDERS for ${slug}: ${Array.from(new Set(unresolved)).join(", ")}`);
}

function replaceImagePlaceholders(markdown, slug) {
  const key = normalizeSlugKey(slug);
  const map = IMAGE_MAP[key] || {};
  let next = markdown;
  Object.entries(map).forEach(([placeholder, value]) => {
    next = next.split(placeholder).join(value);
  });
  return next;
}

function upsertPost(db, post) {
  const existing = db.prepare("SELECT id FROM posts WHERE slug = ?").get(post.slug);
  if (existing) {
    // `published` is deliberately absent from the SET list. It used to be forced
    // to 1 here, so every re-run silently republished any seed-managed post an
    // admin had unpublished. Publication state is an admin decision; the seed
    // file owns the content, not the visibility.
    db.prepare(
      "UPDATE posts SET title = ?, excerpt = ?, cover_image = ?, content_html = ?, tags_json = ?, " +
        "meta_description = ?, og_title = ?, og_description = ?, cover_image_alt = ? WHERE slug = ?"
    ).run(
      post.title,
      post.excerpt,
      post.cover_image,
      post.content_html,
      JSON.stringify(post.tags),
      post.meta_description,
      post.og_title,
      post.og_description,
      post.cover_image_alt,
      post.slug
    );
    return { action: "updated", slug: post.slug };
  }

  db.prepare(
    "INSERT INTO posts (slug, title, excerpt, cover_image, content_html, tags_json, " +
      "meta_description, og_title, og_description, cover_image_alt, published) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)"
  ).run(
    post.slug,
    post.title,
    post.excerpt,
    post.cover_image,
    post.content_html,
    JSON.stringify(post.tags),
    post.meta_description,
    post.og_title,
    post.og_description,
    post.cover_image_alt
  );
  return { action: "created", slug: post.slug };
}

const COMPARED_FIELDS = [
  "title",
  "excerpt",
  "cover_image",
  "content_html",
  "tags_json",
  "meta_description",
  "og_title",
  "og_description",
  "cover_image_alt",
  "published",
];

function buildPosts() {
  const files = [
    "blog_post_no1.md",
    "blog_post_no2.md",
    "blog_post_no3.md",
    "blog_post_no4.md",
    "blog_post_no5.md",
  ].map((f) => path.join(SEED_DIR, f));
  const posts = [];
  let skipped = 0;

  files.forEach((file) => {
    const raw = fs.readFileSync(file, "utf8");
    const { meta, body } = parseFrontmatter(raw);
    const slug = String(meta.slug || "").trim();
    if (!slug) {
      console.log(`SKIP    ${path.basename(file)}: no slug in frontmatter`);
      skipped += 1;
      return;
    }

    const cleanedBody = trimToPublishableMarkdown(body);
    const bodyWithImages = replaceImagePlaceholders(cleanedBody, slug);
    assertNoUnresolvedPlaceholders(bodyWithImages, slug);
    // The hand-written SEO copy. `open_graph` is a nested block, so it arrives as
    // an object; guard against the array the parser produces for an empty one.
    const openGraph = meta.open_graph && !Array.isArray(meta.open_graph) ? meta.open_graph : {};
    posts.push({
      slug,
      title: String(meta.title || "").trim(),
      excerpt: String(meta.excerpt || "").trim(),
      cover_image:
        (IMAGE_MAP[normalizeSlugKey(slug)] && IMAGE_MAP[normalizeSlugKey(slug)].REPLACE_WITH_FEATURED_IMAGE_URL) ||
        String(meta.cover_image || "").trim(),
      content_html: bodyToHtml(bodyWithImages),
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      meta_description: String(meta.meta_description || "").trim(),
      og_title: String(openGraph.og_title || "").trim(),
      og_description: String(openGraph.og_description || "").trim(),
      cover_image_alt: String(meta.featured_image_alt || "").trim(),
    });
  });

  return { posts, skipped };
}

/** Read-only: decides whether the seed file would create, change, or match the stored row. */
function classifyPost(db, post) {
  const existing = db
    .prepare(
      "SELECT id, title, excerpt, cover_image, content_html, tags_json, " +
        "meta_description, og_title, og_description, cover_image_alt, published FROM posts WHERE slug = ?"
    )
    .get(post.slug);

  const next = {
    title: post.title,
    excerpt: post.excerpt,
    cover_image: post.cover_image,
    content_html: post.content_html,
    tags_json: JSON.stringify(post.tags),
    meta_description: post.meta_description,
    og_title: post.og_title,
    og_description: post.og_description,
    cover_image_alt: post.cover_image_alt,
    // Mirrors upsertPost: INSERT publishes, UPDATE leaves the stored value
    // alone. Reporting a flat 1 here would tell the operator the preview is
    // about to publish a row that --apply will in fact leave unpublished.
    published: existing ? existing.published : 1,
  };

  if (!existing) return { action: "create", existing: null, next, differing: [] };

  const differing = COMPARED_FIELDS.filter((f) => String(existing[f]) !== String(next[f]));
  return { action: differing.length ? "update" : "unchanged", existing, next, differing };
}

function describeValue(value, max = 60) {
  const s = String(value === null || value === undefined ? "" : value).replace(/\s+/g, " ");
  if (s.length > max) return `<${s.length} chars> "${s.slice(0, max)}…"`;
  return JSON.stringify(s);
}

/** Collects every `--only <slug>` pair. Repeatable; a value starting with `--` is a missing argument. */
function parseOnly(argv) {
  const args = argv || [];
  const slugs = [];
  args.forEach((arg, i) => {
    if (arg !== "--only") return;
    const value = args[i + 1];
    if (!value || value.startsWith("--")) cli.fail("--only requires a slug argument.");
    slugs.push(value.trim());
  });
  return slugs;
}

/**
 * Narrows the parsed seed posts to the requested slugs.
 *
 * An unknown slug is a hard failure rather than an empty run: the operator
 * typed a slug they expect to be imported, and silently importing nothing (or,
 * worse, importing everything) is not what they asked for.
 */
function selectPosts(posts, only) {
  if (!only.length) return posts;
  const known = new Set(posts.map((p) => p.slug));
  const unknown = only.filter((s) => !known.has(s));
  if (unknown.length) {
    cli.fail(
      `--only names a slug that no seed file defines: ${unknown.join(", ")}.\n` +
        `Known slugs: ${[...known].join(", ")}`
    );
  }
  const wanted = new Set(only);
  return posts.filter((p) => wanted.has(p.slug));
}

/** Columns added by server/db.js migrate() that every statement below needs. */
const REQUIRED_POST_COLUMNS = ["meta_description", "og_title", "og_description", "cover_image_alt"];

/**
 * cli.openDb() opens the database raw and never migrates it, so an import run
 * before the app has been restarted hits a missing column and dies on a raw
 * SQLite exception. Say what actually went wrong instead.
 */
function assertMigrated(db) {
  const columns = db
    .prepare("PRAGMA table_info(posts)")
    .all()
    .map((c) => c.name);
  const missing = REQUIRED_POST_COLUMNS.filter((c) => !columns.includes(c));
  if (!missing.length) return;
  cli.fail(
    `DATABASE_NOT_MIGRATED: posts is missing ${missing.join(", ")}.\n` +
      "This tool never migrates a schema; only the app does, at boot.\n" +
      "Restart the app against this database first, then re-run this tool."
  );
}

function run() {
  const { apply, preview, dbPath, opts } = cli.start("import-blog-seeds", HELP);
  const db = cli.openDb(dbPath);
  assertMigrated(db);

  const only = parseOnly(opts.args);
  const { posts: allPosts, skipped } = buildPosts();
  const posts = selectPosts(allPosts, only);
  console.log(`Seed posts parsed: ${allPosts.length}`);
  if (only.length) {
    console.log(`--only ${only.join(", ")} — importing ${posts.length}, leaving ${allPosts.length - posts.length} untouched.`);
  }

  let created = 0;
  let updated = 0;
  let unchanged = 0;

  posts.forEach((post) => {
    const verdict = classifyPost(db, post);

    if (verdict.action === "create") {
      created += 1;
      console.log(
        `${preview ? "WOULD CREATE" : "CREATED     "} ${post.slug}: ${describeValue(post.title)}, ` +
          `${post.content_html.length} chars html, tags ${JSON.stringify(post.tags)}`
      );
    } else if (verdict.action === "update") {
      updated += 1;
      console.log(
        `${preview ? "WOULD UPDATE" : "UPDATED     "} ${post.slug} (post id ${verdict.existing.id}) — changed fields: ${verdict.differing.join(", ")}` +
          (Number(verdict.existing.published) ? "" : " (stays unpublished — publication state is left as the admin set it)")
      );
      verdict.differing.forEach((field) => {
        console.log(`        ${field}: ${describeValue(verdict.existing[field])} -> ${describeValue(verdict.next[field])}`);
      });
    } else {
      unchanged += 1;
      console.log(
        `UNCHANGED    ${post.slug} (post id ${verdict.existing.id}) — stored values already match the seed file` +
          (apply ? " (row re-written, updated_at bumped)" : "")
      );
    }

    if (apply) upsertPost(db, post);
  });

  db.close();
  console.log(
    `Summary: ${created} created, ${updated} updated, ${unchanged} unchanged, ${skipped} seed file(s) skipped` +
      ` (${preview ? "preview only, nothing written" : "written"}).`
  );
  if (preview && created + updated) console.log("Nothing was written. Re-run with --apply to write these posts.");
}

if (require.main === module) run();

module.exports = {
  assertMigrated,
  bodyToHtml,
  buildPosts,
  classifyPost,
  parseOnly,
  selectPosts,
  looksLikeHtmlBody,
  markdownToHtml,
  parseFrontmatter,
  trimToPublishableMarkdown,
  upsertPost,
};
