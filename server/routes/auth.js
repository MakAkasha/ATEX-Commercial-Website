const express = require("express");
const bcrypt = require("bcrypt");
const rateLimit = require("express-rate-limit");
const { getDb } = require("../db");
const { nonEmptyString } = require("../utils/safe");

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get("/me", (req, res) => {
  if (req.session && req.session.admin) return res.json({ admin: req.session.admin });
  return res.json({ admin: null });
});

router.post("/login", loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  const cleanUsername = nonEmptyString(username);
  const cleanPassword = nonEmptyString(password);
  if (!cleanUsername || !cleanPassword) return res.status(400).json({ error: "MISSING_FIELDS" });

  const db = getDb();
  const admin = db.prepare("SELECT id, username, password_hash FROM admins WHERE username = ?").get(cleanUsername);
  if (!admin) return res.status(401).json({ error: "INVALID_CREDENTIALS" });

  const ok = bcrypt.compareSync(cleanPassword, admin.password_hash);
  if (!ok) return res.status(401).json({ error: "INVALID_CREDENTIALS" });

  return req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: "SESSION_ERROR" });
    req.session.admin = { id: admin.id, username: admin.username };
    return res.json({ ok: true, admin: req.session.admin });
  });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("atex.sid");
    return res.json({ ok: true });
  });
});

router.post("/change-password", (req, res) => {
  if (!req.session?.admin) return res.status(401).json({ error: "UNAUTHORIZED" });

  const { currentPassword, newPassword } = req.body || {};
  const cleanCurrent = nonEmptyString(currentPassword);
  const cleanNew = nonEmptyString(newPassword);
  if (!cleanCurrent || !cleanNew) return res.status(400).json({ error: "MISSING_FIELDS" });
  if (cleanNew.length < 8) return res.status(400).json({ error: "PASSWORD_TOO_SHORT" });

  const db = getDb();
  const admin = db.prepare("SELECT id, password_hash FROM admins WHERE id = ?").get(req.session.admin.id);
  if (!admin) return res.status(404).json({ error: "NOT_FOUND" });

  const ok = bcrypt.compareSync(cleanCurrent, admin.password_hash);
  if (!ok) return res.status(401).json({ error: "WRONG_PASSWORD" });

  const newHash = bcrypt.hashSync(cleanNew, 12);
  db.prepare("UPDATE admins SET password_hash = ? WHERE id = ?").run(newHash, admin.id);

  req.session.destroy(() => {
    res.clearCookie("atex.sid");
    return res.json({ ok: true });
  });
});

module.exports = router;
