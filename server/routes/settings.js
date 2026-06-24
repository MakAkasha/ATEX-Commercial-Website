const express = require("express");
const { getDb } = require("../db");
const { requireAdmin } = require("../auth");
const { safeJsonParse, parseBoolean } = require("../utils/safe");
const { memoize } = require("../utils/ttlCache");

const router = express.Router();
const SETTINGS_TTL_MS = 60_000;

const KEY_ANALYTICS = "analytics";
const KEY_GENERAL = "general";
const KEY_PAGE_SEO = "page_seo";

const PAGE_SEO_ROUTES = ["/", "/solutions", "/contact-us", "/blog", "/privacy", "/terms"];

function cleanPageSeoEntry(entry) {
  return {
    title: String(entry?.title || "").trim(),
    description: String(entry?.description || "").trim(),
    ogImage: String(entry?.ogImage || "").trim(),
    keywords: String(entry?.keywords || "").trim(),
    robots: String(entry?.robots || "").trim(),
    canonical: String(entry?.canonical || "").trim(),
  };
}

function loadPageSeoSettingsRaw() {
  const db = getDb();
  const row = db.prepare("SELECT value_json FROM settings WHERE key = ?").get(KEY_PAGE_SEO);
  const parsed = safeJsonParse(row?.value_json || "", {});
  const result = {};
  PAGE_SEO_ROUTES.forEach((route) => {
    result[route] = cleanPageSeoEntry(parsed?.[route] || {});
  });
  return result;
}

// 60s TTL cache; busted on save below. Page SEO settings are global, not per-user.
const loadPageSeoSettings = memoize(loadPageSeoSettingsRaw, SETTINGS_TTL_MS);

function savePageSeoSettings(next) {
  const clean = {};
  PAGE_SEO_ROUTES.forEach((route) => {
    clean[route] = cleanPageSeoEntry(next?.[route] || {});
  });
  const db = getDb();
  db.prepare(
    "INSERT INTO settings (key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json"
  ).run(KEY_PAGE_SEO, JSON.stringify(clean));
  loadPageSeoSettings.bust();
  return clean;
}

function envAnalyticsOverride() {
  // Env overrides (highest precedence)
  const ga4 = (process.env.GA_MEASUREMENT_ID || "").trim();
  const gtm = (process.env.GTM_CONTAINER_ID || "").trim();
  const enabledRaw = (process.env.ANALYTICS_ENABLED || "").trim();

  const enabled = enabledRaw ? enabledRaw === "1" || enabledRaw.toLowerCase() === "true" : null;
  if (!ga4 && !gtm && enabled === null) return null;

  return {
    enabled: enabled === null ? true : enabled,
    gaMeasurementId: ga4,
    gtmContainerId: gtm,
    source: "env",
  };
}

function loadAnalyticsSettings() {
  const env = envAnalyticsOverride();
  const db = getDb();
  const row = db.prepare("SELECT value_json FROM settings WHERE key = ?").get(KEY_ANALYTICS);
  let value = { enabled: false, gaMeasurementId: "", gtmContainerId: "" };
  const parsed = safeJsonParse(row && row.value_json ? row.value_json : "", null);
  if (parsed && typeof parsed === "object") value = { ...value, ...parsed };
  if (env) {
    // env overrides fields but still show DB values for missing ones
    return {
      enabled: typeof env.enabled === "boolean" ? env.enabled : parseBoolean(value.enabled, false),
      gaMeasurementId: env.gaMeasurementId || value.gaMeasurementId || "",
      gtmContainerId: env.gtmContainerId || value.gtmContainerId || "",
      source: "env",
    };
  }
  return { ...value, source: "db" };
}

function saveAnalyticsSettings(next) {
  const clean = {
    enabled: parseBoolean(next.enabled, false),
    gaMeasurementId: String(next.gaMeasurementId || "").trim(),
    gtmContainerId: String(next.gtmContainerId || "").trim(),
  };
  const db = getDb();
  db.prepare(
    "INSERT INTO settings (key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json"
  ).run(KEY_ANALYTICS, JSON.stringify(clean));
  return clean;
}

function loadGeneralSettingsRaw() {
  const db = getDb();
  const row = db.prepare("SELECT value_json FROM settings WHERE key = ?").get(KEY_GENERAL);
  const base = {
    companyName: "ATEX",
    adminEmail: "",
    whatsapp: "",
    maintenanceMode: false,
    homepageTitle: "ATEX | حلول إنترنت الأشياء في السعودية",
    homepageDescription:
      "ATEX مزود سعودي لحلول إنترنت الأشياء للشركات: تتبّع الأصول، إدارة الأساطيل، المراقبة البيئية، العدادات والطاقة، وسلسلة التبريد مع منصة بيانات وتكاملات.",
  };
  const parsed = safeJsonParse(row && row.value_json ? row.value_json : "", null);
  if (!parsed || typeof parsed !== "object") return base;
  return {
    ...base,
    ...parsed,
    maintenanceMode: parseBoolean(parsed.maintenanceMode, false),
  };
}

// 60s TTL cache; busted on save below. General settings are global, not per-user.
const loadGeneralSettings = memoize(loadGeneralSettingsRaw, SETTINGS_TTL_MS);

function saveGeneralSettings(next) {
  const clean = {
    companyName: String(next.companyName || "ATEX").trim() || "ATEX",
    adminEmail: String(next.adminEmail || "").trim(),
    whatsapp: String(next.whatsapp || "").trim(),
    maintenanceMode: parseBoolean(next.maintenanceMode, false),
    homepageTitle: String(next.homepageTitle || "").trim(),
    homepageDescription: String(next.homepageDescription || "").trim(),
  };
  const db = getDb();
  db.prepare(
    "INSERT INTO settings (key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json"
  ).run(KEY_GENERAL, JSON.stringify(clean));
  loadGeneralSettings.bust();
  return clean;
}

// Admin-only get
router.get("/analytics", requireAdmin, (req, res) => {
  return res.json({ settings: loadAnalyticsSettings() });
});

// Admin-only set (DB). If env overrides are in effect, we still allow saving for later,
// but returned `source` will remain "env".
router.put("/analytics", requireAdmin, (req, res) => {
  const body = req.body || {};
  const saved = saveAnalyticsSettings(body);
  return res.json({ ok: true, saved, effective: loadAnalyticsSettings() });
});

router.get("/general", requireAdmin, (req, res) => {
  return res.json({ settings: loadGeneralSettings() });
});

router.put("/general", requireAdmin, (req, res) => {
  const saved = saveGeneralSettings(req.body || {});
  return res.json({ ok: true, saved });
});

router.get("/page-seo", requireAdmin, (req, res) => {
  return res.json({ settings: loadPageSeoSettings() });
});

router.put("/page-seo", requireAdmin, (req, res) => {
  const saved = savePageSeoSettings(req.body || {});
  return res.json({ ok: true, saved });
});

// Public effective read (for SSR injection)
router.get("/public/analytics", (req, res) => {
  const s = loadAnalyticsSettings();
  // Do not expose where it came from publicly.
  delete s.source;
  return res.json({ settings: s });
});

module.exports = {
  router,
  loadAnalyticsSettings,
  loadGeneralSettings,
  loadPageSeoSettings,
};
