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

  if (!name || !companyName || !commercialRegister || !whatsapp || !message) {
    return res.status(400).json({ error: "MISSING_FIELDS" });
  }
  if (name.length < 2) {
    return res.status(400).json({ error: "INVALID_NAME" });
  }
  if (companyName.length < 2) {
    return res.status(400).json({ error: "INVALID_COMPANY_NAME" });
  }
  if (!isValidCommercialRegister(commercialRegister)) {
    return res.status(400).json({ error: "INVALID_COMMERCIAL_REGISTER" });
  }
  if (!isValidWhatsapp(whatsapp)) {
    return res.status(400).json({ error: "INVALID_WHATSAPP" });
  }
  if (message.length < 10) {
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

  db.prepare(
    "INSERT INTO contact_submissions (name, email, message, ip, user_agent) VALUES (?, ?, ?, ?, ?)"
  ).run(name, whatsapp, normalizedMessage, ip, userAgent);

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
