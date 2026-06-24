const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const { requireAdmin } = require("../auth");

const router = express.Router();
const ROOT_DIR = path.resolve(__dirname, "..", "..");
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(ROOT_DIR, "uploads");

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

function makeStorage(kind, allowedExts, fallbackExt) {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const now = new Date();
      const year = String(now.getFullYear());
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const dir = path.join(UPLOADS_DIR, kind, year, month);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase();
      const safeExt = allowedExts.includes(ext) ? ext : fallbackExt;
      const base = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      cb(null, `${base}${safeExt}`);
    },
  });
}

const imageStorage = makeStorage("images", [".jpg", ".jpeg", ".png", ".webp", ".gif"], ".bin");
const videoStorage = makeStorage("videos", [".mp4", ".webm", ".ogg"], ".mp4");

function imageFileFilter(req, file, cb) {
  const ok = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.mimetype);
  cb(ok ? null : new Error("INVALID_FILE_TYPE"), ok);
}

function videoFileFilter(req, file, cb) {
  const ok = ["video/mp4", "video/webm", "video/ogg"].includes(file.mimetype);
  cb(ok ? null : new Error("INVALID_FILE_TYPE"), ok);
}

const uploadImages = multer({
  storage: imageStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

const uploadVideos = multer({
  storage: videoStorage,
  fileFilter: videoFileFilter,
  limits: {
    fileSize: 120 * 1024 * 1024,
  },
});

function toPublicUploadUrl(absPath) {
  const rel = path.relative(UPLOADS_DIR, absPath);
  return `/uploads/${rel.replace(/\\/g, "/")}`;
}

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

router.post("/images", requireAdmin, uploadLimiter, uploadImages.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "NO_FILE" });
  res.json({ ok: true, url: toPublicUploadUrl(req.file.path) });
});

router.post("/videos", requireAdmin, uploadLimiter, uploadVideos.single("video"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "NO_FILE" });
  res.json({ ok: true, url: toPublicUploadUrl(req.file.path) });
});

router.get("/videos", requireAdmin, uploadLimiter, (req, res) => {
  const root = path.join(UPLOADS_DIR, "videos");
  const videos = walkFiles(root)
    .filter((fullPath) => [".mp4", ".webm", ".ogg"].includes(path.extname(fullPath).toLowerCase()))
    .map((fullPath) => {
      const stat = fs.statSync(fullPath);
      return {
        url: toPublicUploadUrl(fullPath),
        name: path.basename(fullPath),
        size: stat.size,
        mtimeMs: stat.mtimeMs,
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  res.json({ ok: true, videos });
});

module.exports = router;
