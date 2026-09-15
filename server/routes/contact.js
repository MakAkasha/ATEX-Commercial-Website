const express = require("express");
const rateLimit = require("express-rate-limit");
const { getDb } = require("../db");
const { getConfig } = require("../config");
const { nonEmptyString } = require("../utils/safe");

const router = express.Router();
const config = getConfig();

const contactLimiter = rateLimit({
  windowMs: config.contactRateLimitWindowMs,
  limit: config.contactRateLimitLimit,
  standardHeaders: true,
  legacyHeaders: false,
});

function isValidWhatsapp(value) {
  return /^\+\d{8,16}$/.test(String(value || "").trim());
}

function isValidCommercialRegister(value) {
  return /^[0-9A-Za-z\-]{5,40}$/.test(String(value || "").trim());
}

function normalizeText(value, maxLen) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLen);
}

// Lead attribution, in the order the columns were added in server/db.js.
// Click IDs are opaque advertising tokens; UTM values are campaign labels the
// marketer chose. Neither is personal data, and neither is ever echoed back to
// the browser or written into a URL this app generates.
const ATTRIBUTION_FIELDS = [
  "gclid",
  "wbraid",
  "gbraid",
  "fbclid",
  "ttclid",
  "msclkid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "landing_path",
  "referrer",
];

/**
 * A rejected value is stored as '' rather than 400-ing the submission: a lead
 * is worth more than a well-formed tracking token, and a malformed one is
 * simply unusable for an offline conversion upload anyway.
 */
function normalizeAttribution(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return ATTRIBUTION_FIELDS.map((field) => {
    const value = String(source[field] || "").replace(/\s+/g, "").trim().slice(0, 300);
    if (!value) return "";
    if (field === "referrer") return /^https?:\/\/[^\s]+$/i.test(value) ? value : "";
    if (field === "landing_path") return /^\/[\w\-./]*$/.test(value) ? value : "";
    return /^[\w.\-~%]+$/.test(value) ? value : "";
  });
}

async function forwardContactEmail(payload) {
  if (!config.contactEmailForwardEnabled || !config.contactEmailTo) {
    return { attempted: false, ok: false };
  }

  const endpoint = `https://formsubmit.co/ajax/${encodeURIComponent(config.contactEmailTo)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        _subject: "ATEX Contact Form Submission",
        _template: "table",
        _captcha: "false",
        name: payload.name,
        email: payload.email,
        message: payload.message,
        ip: payload.ip,
        user_agent: payload.userAgent,
        source: payload.source,
        campaign: payload.campaign,
      }),
    });

    if (!res.ok) {
      return { attempted: true, ok: false, status: res.status };
    }

    return { attempted: true, ok: true };
  } catch (err) {
    return { attempted: true, ok: false, error: err && err.message ? err.message : "FORWARD_FAILED" };
  } finally {
    clearTimeout(timeout);
  }
}

router.post("/", contactLimiter, async (req, res) => {
  const name = normalizeText(nonEmptyString(req.body?.name) || "", 120);
  const companyName = normalizeText(nonEmptyString(req.body?.companyName) || "", 160);
  const commercialRegister = normalizeText(nonEmptyString(req.body?.commercialRegister) || "", 80).replace(/\s+/g, "");
  const whatsapp = normalizeText(nonEmptyString(req.body?.whatsapp) || "", 20);
  const message = normalizeText(nonEmptyString(req.body?.message) || "", 3000);

  if (!name || !whatsapp) {
    return res.status(400).json({ error: "MISSING_FIELDS" });
  }
  if (name.length < 2) {
    return res.status(400).json({ error: "INVALID_NAME" });
  }
  if (companyName && companyName.length < 2) {
    return res.status(400).json({ error: "INVALID_COMPANY_NAME" });
  }
  if (commercialRegister && !isValidCommercialRegister(commercialRegister)) {
    return res.status(400).json({ error: "INVALID_COMMERCIAL_REGISTER" });
  }
  if (!isValidWhatsapp(whatsapp)) {
    return res.status(400).json({ error: "INVALID_WHATSAPP" });
  }
  if (message && message.length < 10) {
    return res.status(400).json({ error: "MESSAGE_TOO_SHORT" });
  }

  const db = getDb();
  const ip = String(req.ip || "");
  const userAgent = String(req.headers["user-agent"] || "");

  const normalizedMessage = [
    `Company: ${companyName}`,
    `Commercial Register: ${commercialRegister}`,
    `WhatsApp: ${whatsapp}`,
    "",
    message,
  ].join("\n");

  const attribution = normalizeAttribution(req.body?.attribution);

  db.prepare(
    `INSERT INTO contact_submissions (name, email, message, ip, user_agent, ${ATTRIBUTION_FIELDS.join(", ")})
     VALUES (?, ?, ?, ?, ?, ${ATTRIBUTION_FIELDS.map(() => "?").join(", ")})`
  ).run(name, whatsapp, normalizedMessage, ip, userAgent, ...attribution);

  const forward = await forwardContactEmail({
    name,
    email: "no-reply@atex.sa",
    whatsapp,
    companyName,
    commercialRegister,
    message: normalizedMessage,
    ip,
    userAgent,
    source: String(req.headers.host || "").trim() || "atex.sa",
    // The team reads the forwarded email, not the database, so the campaign
    // has to travel with it or nobody ever sees where a lead came from.
    campaign: ATTRIBUTION_FIELDS.map((field, i) => (attribution[i] ? `${field}=${attribution[i]}` : ""))
      .filter(Boolean)
      .join(" | ") || "direct",
  });

  if (forward.attempted && !forward.ok) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "warn",
        type: "contact_email_forward_failed",
        detail: forward,
      })
    );
  }

  return res.json({ ok: true, email_forwarded: !!forward.ok });
});

module.exports = router;
