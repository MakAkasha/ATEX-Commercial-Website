const express = require("express");
const { getDb } = require("../db");
const { requireAdmin } = require("../auth");
const { normalizeHomeContent } = require("../homeSchema");
const { safeJsonParse } = require("../utils/safe");

const router = express.Router();

router.get("/home", (req, res) => {
  const db = getDb();
  const row = db.prepare("SELECT content_json FROM home_content WHERE id = 1").get();
  const content = safeJsonParse(row ? row.content_json : "", null);
  // Always return a normalized, complete object (prevents admin UI crashes)
  res.json({ content: normalizeHomeContent(content) });
});

router.put("/home", requireAdmin, (req, res) => {
  const content = req.body && req.body.content;
  if (!content || typeof content !== "object") return res.status(400).json({ error: "INVALID_CONTENT" });

  const db = getDb();
  const normalized = normalizeHomeContent(content);
  db.prepare("UPDATE home_content SET content_json = ? WHERE id = 1").run(JSON.stringify(normalized));
  res.json({ ok: true });
});

router.patch("/home/sections", requireAdmin, (req, res) => {
  const sections = req.body && req.body.sections;
  if (!sections || typeof sections !== "object") {
    return res.status(400).json({ error: "INVALID_SECTIONS" });
  }

  if (typeof sections.productsEnabled !== "boolean" && typeof sections.blogEnabled !== "boolean") {
    return res.status(400).json({ error: "INVALID_SECTIONS_PAYLOAD" });
  }

  const db = getDb();
  const row = db.prepare("SELECT content_json FROM home_content WHERE id = 1").get();
  const content = safeJsonParse(row ? row.content_json : "", null);
  const normalized = normalizeHomeContent(content);
  normalized.sections = normalized.sections || {};
  if (typeof sections.productsEnabled === "boolean") {
    normalized.sections.productsEnabled = sections.productsEnabled;
  }
  if (typeof sections.blogEnabled === "boolean") {
    normalized.sections.blogEnabled = sections.blogEnabled;
  }

  db.prepare("UPDATE home_content SET content_json = ? WHERE id = 1").run(JSON.stringify(normalized));
  res.json({ ok: true, sections: normalized.sections });
});

module.exports = router;
