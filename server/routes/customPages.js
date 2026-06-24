const express = require("express");
const sanitizeHtml = require("sanitize-html");
const { getDb } = require("../db");
const { requireAdmin } = require("../auth");
const { parsePositiveInt, nonEmptyString, parseBoolean, toSqliteBool } = require("../utils/safe");

const router = express.Router();

function slugify(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\u0600-\u06FF0-9a-z\-]+/gi, "")
    .replace(/\-+/g, "-")
    .replace(/^\-+|\-+$/g, "");
}

function sanitizePageHtml(html) {
  // Allow common content tags; block scripts.
  return sanitizeHtml(html || "", {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "h1", "h2", "h3", "h4", "span", "section", "header", "footer"]),
    disallowedTagsMode: "discard",
    allowedAttributes: {
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "title", "width", "height", "loading"],
      "*": ["class", "id"],
    },
    allowedSchemes: ["http", "https"],
  });
}

// Strip CSS constructs that can be used for injection or exfiltration.
// Blocks: closing </style> tag (breaks out of style block), <script injection,
// javascript: URIs in url(), expression() (IE CSS XSS), and @import (SSRF/exfil).
function sanitizeCssCode(css) {
  return String(css || "")
    .replace(/<\/style/gi, "")
    .replace(/<script/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/expression\s*\(/gi, "")
    .replace(/@import\b/gi, "");
}

function readRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    html_code: row.html_code || "",
    css_code: row.css_code || "",
    js_code: row.js_code || "",
    published: parseBoolean(row.published, false),
    unsafe_js: parseBoolean(row.unsafe_js, false),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Admin: list
router.get("/", requireAdmin, (req, res) => {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM custom_pages ORDER BY updated_at DESC").all();
  res.json({ pages: rows.map(readRow) });
});

// Public: fetch metadata (published only)
router.get("/public/:slug", (req, res) => {
  const slug = String(req.params.slug || "");
  const db = getDb();
  const row = db.prepare("SELECT * FROM custom_pages WHERE slug = ? AND published = 1").get(slug);
  if (!row) return res.status(404).json({ error: "NOT_FOUND" });

  const page = readRow(row);
  // Do not expose JS publicly via API; public rendering will handle it conditionally.
  page.js_code = "";
  res.json({ page });
});

// Admin: get
router.get("/:id", requireAdmin, (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "INVALID_ID" });
  const db = getDb();
  const row = db.prepare("SELECT * FROM custom_pages WHERE id = ?").get(id);
  if (!row) return res.status(404).json({ error: "NOT_FOUND" });
  res.json({ page: readRow(row) });
});

// Admin: create
router.post("/", requireAdmin, (req, res) => {
  const body = req.body || {};
  const title = nonEmptyString(body.title);
  const slug = slugify(body.slug || title);
  if (!title || !slug) return res.status(400).json({ error: "MISSING_FIELDS" });

  const html = sanitizePageHtml(body.html_code || "");
  const css = sanitizeCssCode(body.css_code || "");
  const js = String(body.js_code || "");
  const published = toSqliteBool(body.published);
  const unsafe = toSqliteBool(body.unsafe_js);

  const db = getDb();
  const existing = db.prepare("SELECT id FROM custom_pages WHERE slug = ? LIMIT 1").get(slug);
  if (existing?.id) return res.status(409).json({ error: "SLUG_EXISTS" });

  const info = db
    .prepare(
      "INSERT INTO custom_pages (title, slug, html_code, css_code, js_code, published, unsafe_js) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(title, slug, html, css, js, published, unsafe);
  res.json({ ok: true, id: info.lastInsertRowid });
});

// Admin: update
router.put("/:id", requireAdmin, (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "INVALID_ID" });
  const body = req.body || {};

  const title = nonEmptyString(body.title);
  const slug = slugify(body.slug || title);
  if (!title || !slug) return res.status(400).json({ error: "MISSING_FIELDS" });

  const html = sanitizePageHtml(body.html_code || "");
  const css = sanitizeCssCode(body.css_code || "");
  const js = String(body.js_code || "");
  const published = toSqliteBool(body.published);
  const unsafe = toSqliteBool(body.unsafe_js);

  const db = getDb();
  const slugOwner = db.prepare("SELECT id FROM custom_pages WHERE slug = ? LIMIT 1").get(slug);
  if (slugOwner?.id && Number(slugOwner.id) !== id) {
    return res.status(409).json({ error: "SLUG_EXISTS" });
  }

  const result = db
    .prepare(
      "UPDATE custom_pages SET title=?, slug=?, html_code=?, css_code=?, js_code=?, published=?, unsafe_js=? WHERE id=?"
    )
    .run(title, slug, html, css, js, published, unsafe, id);

  if (!result.changes) return res.status(404).json({ error: "NOT_FOUND" });

  res.json({ ok: true });
});

// Admin: delete
router.delete("/:id", requireAdmin, (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "INVALID_ID" });
  const db = getDb();
  const result = db.prepare("DELETE FROM custom_pages WHERE id = ?").run(id);
  if (!result.changes) return res.status(404).json({ error: "NOT_FOUND" });
  res.json({ ok: true });
});

module.exports = {
  router,
  slugify,
  sanitizePageHtml,
  sanitizeCssCode,
};
