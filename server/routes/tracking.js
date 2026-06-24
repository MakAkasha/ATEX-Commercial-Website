const express = require("express");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const { getDb } = require("../db");
const { requireAdmin } = require("../auth");
const { parsePositiveInt } = require("../utils/safe");

const router = express.Router();

const trackLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

function sha256(s) {
  return crypto.createHash("sha256").update(String(s || "")).digest("hex");
}

function daysAgoISO(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function detectDevice(ua) {
  const s = String(ua || "").toLowerCase();
  if (s.includes("mobile")) return "mobile";
  if (s.includes("tablet") || s.includes("ipad")) return "tablet";
  return "desktop";
}

// Public: record page view
// Rules:
// - Before consent: store path only (essential). No visitor_id, no referrer.
// - After consent: store visitor_id (anonymous), referrer, and device.
router.post("/view", trackLimiter, (req, res) => {
  const body = req.body || {};
  const path = String(body.path || req.headers["x-path"] || "").trim() || "/";
  const consent = String(body.consent || "essential");
  const hasConsent = consent === "analytics";

  const ua = req.headers["user-agent"] || "";
  const device = detectDevice(ua);

  let visitorId = null;
  let referrer = null;
  if (hasConsent) {
    // Visitor id should be anonymous (cookie value from client). Hash it before storing.
    const rawVid = String(body.visitorId || "").trim();
    visitorId = rawVid ? sha256(rawVid) : null;
    referrer = String(body.referrer || req.headers.referer || "").slice(0, 500);
  }

  const db = getDb();
  db.prepare(
    "INSERT INTO page_views (path, consent_level, visitor_id, referrer, device, user_agent) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(path.slice(0, 500), hasConsent ? "analytics" : "essential", visitorId, referrer, device, hasConsent ? String(ua).slice(0, 500) : null);

  res.json({ ok: true });
});

// Admin: aggregated stats
router.get("/stats/summary", requireAdmin, (req, res) => {
  const days = Math.min(365, parsePositiveInt(req.query.range) || 7);
  const since = daysAgoISO(days - 1);
  const db = getDb();

  const total = db.prepare("SELECT COUNT(*) as c FROM page_views WHERE ts >= ?").get(since).c;
  const totalEssential = db
    .prepare("SELECT COUNT(*) as c FROM page_views WHERE ts >= ? AND consent_level = 'essential'")
    .get(since).c;
  const totalAnalytics = db
    .prepare("SELECT COUNT(*) as c FROM page_views WHERE ts >= ? AND consent_level = 'analytics'")
    .get(since).c;

  const uniques = db
    .prepare(
      "SELECT COUNT(DISTINCT visitor_id) as c FROM page_views WHERE ts >= ? AND consent_level = 'analytics' AND visitor_id IS NOT NULL"
    )
    .get(since).c;

  res.json({
    rangeDays: days,
    since,
    total,
    totals: { essential: totalEssential, analytics: totalAnalytics },
    uniques,
  });
});

router.get("/stats/top", requireAdmin, (req, res) => {
  const days = Math.min(365, parsePositiveInt(req.query.range) || 7);
  const since = daysAgoISO(days - 1);
  const db = getDb();

  const rows = db
    .prepare(
      "SELECT path, COUNT(*) as visits FROM page_views WHERE ts >= ? GROUP BY path ORDER BY visits DESC LIMIT 20"
    )
    .all(since);
  res.json({ rangeDays: days, since, top: rows });
});

router.get("/stats/daily", requireAdmin, (req, res) => {
  const days = Math.min(365, parsePositiveInt(req.query.range) || 30);
  const since = daysAgoISO(days - 1);
  const db = getDb();

  const rows = db
    .prepare(
      "SELECT substr(ts, 1, 10) as day, COUNT(*) as visits FROM page_views WHERE ts >= ? GROUP BY substr(ts, 1, 10) ORDER BY day ASC"
    )
    .all(since);

  // Fill missing days
  const map = new Map(rows.map((r) => [r.day, r.visits]));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const day = d.toISOString().slice(0, 10);
    out.push({ day, visits: map.get(day) || 0 });
  }

  res.json({ rangeDays: days, since, series: out });
});

// Simple “ping” event for admin test status
router.post("/event", requireAdmin, (req, res) => {
  // For now we store events as page_views with synthetic paths
  const body = req.body || {};
  const name = String(body.name || "").trim() || "event";
  const path = `/__event/${name}`;
  const db = getDb();
  db.prepare("INSERT INTO page_views (path, consent_level) VALUES (?, 'analytics')").run(path);
  res.json({ ok: true });
});

module.exports = router;
