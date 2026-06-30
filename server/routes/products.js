const express = require("express");
const multer = require("multer");
const { getDb } = require("../db");
const { requireAdmin } = require("../auth");
const { nonEmptyString, parsePositiveInt, toSqliteBool } = require("../utils/safe");

const router = express.Router();
const uploadCsv = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 3 * 1024 * 1024,
  },
});

function normalizePayload(body = {}) {
  const slugRaw = nonEmptyString(body.slug);
  const title = nonEmptyString(body.title);
  const category = String(body.category || "").trim();
  const description = String(body.description || "").trim();
  const image = String(body.image || "").trim();
  const brochureUrl = String(body.brochure_url || body.brochureUrl || "").trim();
  const sortOrder = parsePositiveInt(body.sort_order ?? body.sortOrder) || 0;
  const published = toSqliteBool(body.published ?? true);

  let slug = String(slugRaw || "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\u0600-\u06FFa-z0-9\-]/gi, "")
    .replace(/\-+/g, "-")
    .replace(/^\-+|\-+$/g, "");

  if (!slug && title) {
    slug = String(title)
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\u0600-\u06FFa-z0-9\-]/gi, "")
      .replace(/\-+/g, "-")
      .replace(/^\-+|\-+$/g, "");
  }

  return {
    slug,
    title,
    category,
    description,
    image,
    brochure_url: brochureUrl,
    published,
    sort_order: sortOrder,
  };
}

function splitCsvLine(line) {
  const out = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  out.push(current);
  return out.map((x) => String(x || "").trim());
}

function parseCsvProducts(text) {
  const lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  if (!lines.length) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const rows = lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? "";
    });
    return row;
  });
  return { headers, rows };
}

router.get("/public", (req, res) => {
  const db = getDb();
  const products = db
    .prepare(
      "SELECT id, slug, category, title, description, image, brochure_url, sort_order FROM products WHERE published = 1 AND is_catalog = 0 ORDER BY sort_order ASC, id DESC"
    )
    .all();
  return res.json({ products });
});

// Dedicated catalog feed for the /products page (Q-System items).
router.get("/catalog", (req, res) => {
  const db = getDb();
  const products = db
    .prepare(
      "SELECT id, slug, category, title, description, image, brochure_url, sort_order FROM products WHERE published = 1 AND is_catalog = 1 ORDER BY sort_order ASC, id ASC"
    )
    .all();
  return res.json({ products });
});

router.get("/", requireAdmin, (req, res) => {
  const db = getDb();
  const products = db
    .prepare(
      "SELECT id, slug, category, title, description, image, brochure_url, published, sort_order, created_at, updated_at FROM products ORDER BY sort_order ASC, id DESC"
    )
    .all();
  return res.json({ products });
});

router.post("/", requireAdmin, (req, res) => {
  const db = getDb();
  const next = normalizePayload(req.body || {});
  if (!next.slug || !next.title) return res.status(400).json({ error: "MISSING_FIELDS" });

  try {
    const result = db
      .prepare(
        "INSERT INTO products (slug, category, title, description, image, brochure_url, published, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        next.slug,
        next.category,
        next.title,
        next.description,
        next.image,
        next.brochure_url,
        next.published,
        next.sort_order
      );
    return res.json({ ok: true, id: result.lastInsertRowid });
  } catch (e) {
    if (String(e.message || "").includes("UNIQUE")) return res.status(409).json({ error: "SLUG_EXISTS" });
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

router.put("/:id", requireAdmin, (req, res) => {
  const db = getDb();
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "INVALID_ID" });

  const next = normalizePayload(req.body || {});
  if (!next.slug || !next.title) return res.status(400).json({ error: "MISSING_FIELDS" });

  try {
    const result = db
      .prepare(
        "UPDATE products SET slug = ?, category = ?, title = ?, description = ?, image = ?, brochure_url = ?, published = ?, sort_order = ? WHERE id = ?"
      )
      .run(
        next.slug,
        next.category,
        next.title,
        next.description,
        next.image,
        next.brochure_url,
        next.published,
        next.sort_order,
        id
      );

    if (!result.changes) return res.status(404).json({ error: "NOT_FOUND" });
    return res.json({ ok: true });
  } catch (e) {
    if (String(e.message || "").includes("UNIQUE")) return res.status(409).json({ error: "SLUG_EXISTS" });
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

router.delete("/:id", requireAdmin, (req, res) => {
  const db = getDb();
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "INVALID_ID" });

  const result = db.prepare("DELETE FROM products WHERE id = ?").run(id);
  if (!result.changes) return res.status(404).json({ error: "NOT_FOUND" });
  return res.json({ ok: true });
});

router.post("/import-csv", requireAdmin, uploadCsv.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "NO_FILE" });
  const text = req.file.buffer.toString("utf8");
  const { headers, rows } = parseCsvProducts(text);

  if (!rows.length) {
    return res.status(400).json({ error: "EMPTY_CSV" });
  }

  if (!headers.includes("title")) {
    return res.status(400).json({ error: "MISSING_TITLE_COLUMN" });
  }

  const db = getDb();
  const insertStmt = db.prepare(
    "INSERT INTO products (slug, category, title, description, image, brochure_url, published, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const updateStmt = db.prepare(
    "UPDATE products SET category = ?, title = ?, description = ?, image = ?, brochure_url = ?, published = ?, sort_order = ? WHERE slug = ?"
  );
  const findBySlugStmt = db.prepare("SELECT id FROM products WHERE slug = ? LIMIT 1");

  const stats = { created: 0, updated: 0, skipped: 0, errors: [] };

  const runImport = db.transaction(() => {
    rows.forEach((raw, idx) => {
      const payload = normalizePayload(raw);
      const line = idx + 2;

      if (!payload.title || !payload.slug) {
        stats.skipped += 1;
        stats.errors.push({ line, error: "MISSING_TITLE_OR_SLUG" });
        return;
      }

      try {
        const existing = findBySlugStmt.get(payload.slug);
        if (existing?.id) {
          updateStmt.run(
            payload.category,
            payload.title,
            payload.description,
            payload.image,
            payload.brochure_url,
            payload.published,
            payload.sort_order,
            payload.slug
          );
          stats.updated += 1;
        } else {
          insertStmt.run(
            payload.slug,
            payload.category,
            payload.title,
            payload.description,
            payload.image,
            payload.brochure_url,
            payload.published,
            payload.sort_order
          );
          stats.created += 1;
        }
      } catch (e) {
        stats.skipped += 1;
        stats.errors.push({ line, error: "ROW_FAILED" });
      }
    });
  });

  runImport();
  return res.json({ ok: true, ...stats });
});

module.exports = router;
