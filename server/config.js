function parseBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  const s = String(value || "").trim().toLowerCase();
  if (!s) return fallback;
  return ["1", "true", "yes", "on"].includes(s);
}

function parseIntSafe(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function fromCsv(value) {
  return String(value || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function buildCspDirectives() {
  return {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    objectSrc: ["'none'"],
    frameAncestors: ["'self'"],
    imgSrc: ["'self'", "data:", "blob:", "https:"],
    // The Google Fonts origins are deliberately absent. Cairo and Tajawal are
    // now self-hosted from /assets/fonts (@font-face in assets/css/styles.css
    // and admin/admin.css), so nothing served by this app loads a stylesheet
    // from fonts.googleapis.com or a webfont from fonts.gstatic.com.
    //
    // cdnjs.cloudflare.com is gone from every directive. Its last use anywhere
    // was the Font Awesome stylesheet in views/partials/head.ejs, which pulled
    // the FA webfonts in turn; both are replaced by assets/icons/sprite.svg.
    // The public site now loads no third-party CSS and no third-party fonts.
    //
    // jsdelivr stays for both: the admin pages (admin/admin.html and
    // admin/admin-login.html) still load Tabler's CSS and its icon webfont
    // from cdn.jsdelivr.net. Admin is the only surface that needs it.
    fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
    scriptSrc: [
      "'self'",
      "'unsafe-inline'",
      "https://cdn.jsdelivr.net",
      "https://www.googletagmanager.com",
      "https://www.google-analytics.com",
      "https://tracker.metricool.com",
      "https://analytics.tiktok.com",
    ],
    scriptSrcAttr: ["'unsafe-inline'"],
    connectSrc: ["'self'", "https://www.googletagmanager.com", "https://www.google-analytics.com", "https://tracker.metricool.com", "https://analytics.tiktok.com"],
    frameSrc: ["'self'", "https://www.youtube-nocookie.com", "https://www.youtube.com", "https://www.google.com"],
    mediaSrc: ["'self'", "https:", "blob:"],
  };
}

function getConfig() {
  const nodeEnv = String(process.env.NODE_ENV || "development").trim() || "development";
  const isProduction = nodeEnv === "production";

  const cfg = {
    nodeEnv,
    isProduction,
    host: process.env.HOST || "127.0.0.1",
    port: parseIntSafe(process.env.PORT, 5173),

    trustProxy: parseBool(process.env.TRUST_PROXY, isProduction),

    sessionSecret: String(process.env.SESSION_SECRET || "").trim(),
    sessionName: String(process.env.SESSION_NAME || "atex.sid").trim() || "atex.sid",
    sessionMaxAgeMs: parseIntSafe(process.env.SESSION_MAX_AGE_MS, 1000 * 60 * 60 * 12),
    sessionSameSite: String(process.env.SESSION_SAME_SITE || "lax").trim().toLowerCase() || "lax",
    sessionSecureCookie: parseBool(process.env.SESSION_COOKIE_SECURE, isProduction),

    enableRequestLogs: parseBool(process.env.ENABLE_REQUEST_LOGS, true),

    globalRateLimitWindowMs: parseIntSafe(process.env.GLOBAL_RATE_LIMIT_WINDOW_MS, 60 * 1000),
    globalRateLimitLimit: parseIntSafe(process.env.GLOBAL_RATE_LIMIT_LIMIT, 300),
    contactRateLimitWindowMs: parseIntSafe(process.env.CONTACT_RATE_LIMIT_WINDOW_MS, 60 * 1000),
    contactRateLimitLimit: parseIntSafe(process.env.CONTACT_RATE_LIMIT_LIMIT, 20),
    contactEmailForwardEnabled: parseBool(process.env.CONTACT_EMAIL_FORWARD_ENABLED, true),
    contactEmailTo: String(process.env.CONTACT_EMAIL_TO || "atexksa.iot@gmail.com").trim(),

    cspReportOnly: parseBool(process.env.CSP_REPORT_ONLY, false),
    cspDirectives: buildCspDirectives(),

    analyticsEnabled: parseBool(process.env.ANALYTICS_ENABLED, false),
    allowedOrigins: fromCsv(process.env.ALLOWED_ORIGINS),
  };

  if (!cfg.sessionSecret) {
    if (isProduction) {
      throw new Error("Missing required SESSION_SECRET in production");
    }
    cfg.sessionSecret = "dev-secret-change-me";
  }

  if (isProduction && cfg.sessionSecret.length < 16) {
    throw new Error("SESSION_SECRET must be at least 16 characters in production");
  }

  if (!["lax", "strict", "none"].includes(cfg.sessionSameSite)) {
    cfg.sessionSameSite = "lax";
  }

  return cfg;
}

module.exports = {
  getConfig,
};
