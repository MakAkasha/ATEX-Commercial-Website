const path = require("path");
const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const { migrate, getDb } = require("./db");
const { getConfig } = require("./config");
const authRoutes = require("./routes/auth");
const contentRoutes = require("./routes/content");
const postsRoutes = require("./routes/posts");
const productsRoutes = require("./routes/products");
const uploadsRoutes = require("./routes/uploads");
const trackingRoutes = require("./routes/tracking");
const contactRoutes = require("./routes/contact");
const { router: customPagesRoutes } = require("./routes/customPages");
const { router: settingsRoutes } = require("./routes/settings");
const pagesRoutes = require("./routes/pages");

const app = express();
const ROOT_DIR = path.resolve(__dirname, "..");
const config = getConfig();

app.disable("x-powered-by");
if (config.trustProxy) {
  app.set("trust proxy", 1);
}

// Views (EJS) for server-rendered pages like blog/legal
app.set("view engine", "ejs");
app.set("views", path.join(ROOT_DIR, "views"));

// Migrate DB on boot
migrate();

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: config.cspDirectives,
      reportOnly: config.cspReportOnly,
    },
  })
);

if (config.enableRequestLogs) {
  app.use((req, res, next) => {
    const startAt = Date.now();
    res.on("finish", () => {
      const ms = Date.now() - startAt;
      console.log(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: "info",
          type: "http",
          method: req.method,
          path: req.originalUrl,
          status: res.statusCode,
          ms,
          ip: req.ip,
        })
      );
    });
    next();
  });
}

// Rate limit (general)
app.use(
  rateLimit({
    windowMs: config.globalRateLimitWindowMs,
    limit: config.globalRateLimitLimit,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Sessions
app.use(
  session({
    name: config.sessionName,
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: config.sessionSameSite,
      secure: config.sessionSecureCookie,
      maxAge: config.sessionMaxAgeMs,
    },
  })
);

app.get("/healthz", (req, res) => {
  res.json({ ok: true, env: config.nodeEnv, uptimeSec: Math.round(process.uptime()) });
});

app.get("/readyz", (req, res) => {
  try {
    const db = getDb();
    db.prepare("SELECT 1 as ok").get();
    return res.json({ ok: true, db: true });
  } catch {
    return res.status(503).json({ ok: false, db: false });
  }
});

// Static public site
app.use("/assets", express.static(path.join(ROOT_DIR, "assets")));
app.use("/data", express.static(path.join(ROOT_DIR, "data")));
app.use("/uploads", express.static(path.join(ROOT_DIR, "uploads")));
app.use("/vendor/tinymce", express.static(path.join(ROOT_DIR, "node_modules", "tinymce")));

// Admin static (disable directory redirect so /admin can be handled by router)
app.use(
  "/admin",
  express.static(path.join(ROOT_DIR, "admin"), {
    redirect: false,
  })
);

// APIs
app.use("/api/auth", authRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/posts", postsRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/uploads", uploadsRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/custom-pages", customPagesRoutes);
app.use("/api/track", trackingRoutes);
app.use("/api/contact", contactRoutes);

// Pages (SSR later; currently sends static HTML files)
app.use(pagesRoutes);

// Basic error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "error",
      type: "request_error",
      method: req.method,
      path: req.originalUrl,
      message: err && err.message ? err.message : "UNKNOWN_ERROR",
      stack: err && err.stack ? err.stack : undefined,
    })
  );
  // If Express/router sets a status (e.g. URIError on malformed % encodings => 400),
  // preserve it instead of always forcing 500.
  const status = Number(err.status || err.statusCode || 500);
  if (status >= 400 && status < 600) {
    return res.status(status).json({ error: status === 500 ? "SERVER_ERROR" : "BAD_REQUEST" });
  }
  return res.status(500).json({ error: "SERVER_ERROR" });
});

app.listen(config.port, config.host, () => {
  console.log(`[ATEX] server running on http://${config.host}:${config.port} (${config.nodeEnv})`);
});
