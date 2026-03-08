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

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").toLowerCase());
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
  const email = normalizeText(nonEmptyString(req.body?.email) || "", 160).toLowerCase();
  const message = normalizeText(nonEmptyString(req.body?.message) || "", 3000);

  if (!name || !email || !message) {
    return res.status(400).json({ error: "MISSING_FIELDS" });
  }
  if (name.length < 2) {
    return res.status(400).json({ error: "INVALID_NAME" });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "INVALID_EMAIL" });
  }
  if (message.length < 10) {
    return res.status(400).json({ error: "MESSAGE_TOO_SHORT" });
  }

  const db = getDb();
  const ip = String(req.ip || "");
  const userAgent = String(req.headers["user-agent"] || "");

  db.prepare(
    "INSERT INTO contact_submissions (name, email, message, ip, user_agent) VALUES (?, ?, ?, ?, ?)"
  ).run(name, email, message, ip, userAgent);

  const forward = await forwardContactEmail({
    name,
    email,
    message,
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
