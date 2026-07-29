const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(ROOT, "server", "data.sqlite");
const SEED_DIR = path.join(ROOT, "content-src", "blog-seed");

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
    db.prepare(
      "UPDATE posts SET title = ?, excerpt = ?, cover_image = ?, content_html = ?, tags_json = ?, published = 1 WHERE slug = ?"
    ).run(post.title, post.excerpt, post.cover_image, post.content_html, JSON.stringify(post.tags), post.slug);
    return { action: "updated", slug: post.slug };
  }

  db.prepare(
    "INSERT INTO posts (slug, title, excerpt, cover_image, content_html, tags_json, published) VALUES (?, ?, ?, ?, ?, ?, 1)"
  ).run(post.slug, post.title, post.excerpt, post.cover_image, post.content_html, JSON.stringify(post.tags));
  return { action: "created", slug: post.slug };
}

function run() {
  const files = ["blog_post_no1.md", "blog_post_no2.md", "blog_post_no3.md"].map((f) => path.join(SEED_DIR, f));
  const db = new Database(DB_PATH);

  const changes = [];
  files.forEach((file) => {
    const raw = fs.readFileSync(file, "utf8");
    const { meta, body } = parseFrontmatter(raw);
    const slug = String(meta.slug || "").trim();
    if (!slug) return;

    const cleanedBody = trimToPublishableMarkdown(body);
    const bodyWithImages = replaceImagePlaceholders(cleanedBody, slug);
    assertNoUnresolvedPlaceholders(bodyWithImages, slug);
    const post = {
      slug,
      title: String(meta.title || "").trim(),
      excerpt: String(meta.excerpt || "").trim(),
      cover_image:
        (IMAGE_MAP[normalizeSlugKey(slug)] && IMAGE_MAP[normalizeSlugKey(slug)].REPLACE_WITH_FEATURED_IMAGE_URL) || "",
      content_html: markdownToHtml(bodyWithImages),
      tags: Array.isArray(meta.tags) ? meta.tags : [],
    };

    changes.push(upsertPost(db, post));
  });

  db.close();
  changes.forEach((c) => {
    console.log(`${c.action.toUpperCase()}: ${c.slug}`);
  });
}

run();
