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

// Format guards (mirror admin client-side checks; defense-in-depth against direct API calls).
const ANALYTICS_FORMATS = {
  gaMeasurementId: /^G-[A-Z0-9]+$/i,
  gtmContainerId: /^GTM-[A-Z0-9]+$/i,
  metricoolHash: /^[a-f0-9]{16,64}$/i,
  tiktokPixelId: /^[A-Z0-9]{10,40}$/i,
};

// Returns an error code string for the first invalid field, or null if all valid.
function validateAnalyticsInput(body) {
  for (const [field, re] of Object.entries(ANALYTICS_FORMATS)) {
    const raw = String(body?.[field] || "").trim();
    if (raw && !re.test(raw)) return `INVALID_${field}`;
  }
  return null;
}

function envAnalyticsOverride() {
  // Env overrides (highest precedence)
  const ga4 = (process.env.GA_MEASUREMENT_ID || "").trim();
  const gtm = (process.env.GTM_CONTAINER_ID || "").trim();
  const metricool = (process.env.METRICOOL_HASH || "").trim();
  const tiktok = (process.env.TIKTOK_PIXEL_ID || "").trim();
  const enabledRaw = (process.env.ANALYTICS_ENABLED || "").trim();

  const enabled = enabledRaw ? enabledRaw === "1" || enabledRaw.toLowerCase() === "true" : null;
  if (!ga4 && !gtm && !metricool && !tiktok && enabled === null) return null;

  return {
    enabled: enabled === null ? true : enabled,
    gaMeasurementId: ga4,
    gtmContainerId: gtm,
    metricoolHash: metricool,
    tiktokPixelId: tiktok,
    source: "env",
  };
}

function loadAnalyticsSettingsRaw() {
  const env = envAnalyticsOverride();
  const db = getDb();
  const row = db.prepare("SELECT value_json FROM settings WHERE key = ?").get(KEY_ANALYTICS);
  let value = { enabled: false, gaMeasurementId: "", gtmContainerId: "", metricoolHash: "", tiktokPixelId: "" };
  const parsed = safeJsonParse(row && row.value_json ? row.value_json : "", null);
  if (parsed && typeof parsed === "object") value = { ...value, ...parsed };
  if (env) {
    // env overrides fields but still show DB values for missing ones
    return {
      enabled: typeof env.enabled === "boolean" ? env.enabled : parseBoolean(value.enabled, false),
      gaMeasurementId: env.gaMeasurementId || value.gaMeasurementId || "",
      gtmContainerId: env.gtmContainerId || value.gtmContainerId || "",
      metricoolHash: env.metricoolHash || value.metricoolHash || "",
      tiktokPixelId: env.tiktokPixelId || value.tiktokPixelId || "",
      source: "env",
    };
  }
  return { ...value, source: "db" };
}

// 60s TTL cache; busted on save below. Analytics settings are global, not per-user.
// baseRenderData() reads this on every page render, so the cache removes one
// synchronous SQLite read per page view.
const loadAnalyticsSettings = memoize(loadAnalyticsSettingsRaw, SETTINGS_TTL_MS);

function saveAnalyticsSettings(next) {
  const clean = {
    enabled: parseBoolean(next.enabled, false),
    gaMeasurementId: String(next.gaMeasurementId || "").trim(),
    gtmContainerId: String(next.gtmContainerId || "").trim(),
    metricoolHash: String(next.metricoolHash || "").trim(),
    tiktokPixelId: String(next.tiktokPixelId || "").trim(),
  };
  const db = getDb();
  db.prepare(
    "INSERT INTO settings (key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json"
  ).run(KEY_ANALYTICS, JSON.stringify(clean));
  loadAnalyticsSettings.bust();
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
  const invalid = validateAnalyticsInput(body);
  if (invalid) return res.status(400).json({ ok: false, error: invalid });
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
  // Copy first: loadAnalyticsSettings() is memoized, so deleting from the
  // returned object would mutate the shared cache entry for every later caller.
  const s = { ...loadAnalyticsSettings() };
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
