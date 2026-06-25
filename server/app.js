const path = require("path");
const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const { migrate, getDb } = require("./db");
const { getConfig } = require("./config");
const SqliteStore = require("./sessionStore");
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
const { getSolutions, getIndustries } = require("./data/contentRegistry");
const { memoize } = require("./utils/ttlCache");

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

// Cache-busting asset version: newest mtime of the hot static assets.
// Changes every deploy, so the ?v= query yields a fresh URL that bypasses
// any stale browser/CDN (Cloudflare) cache automatically.
app.locals.assetVer = (() => {
  const fs = require("fs");
  try {
    const files = [
      path.join(ROOT_DIR, "assets", "css", "styles.css"),
      path.join(ROOT_DIR, "assets", "js", "main.js"),
    ];
    const newest = Math.max(...files.map((f) => fs.statSync(f).mtimeMs));
    return String(Math.floor(newest));
  } catch {
    return "1";
  }
})();

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
    store: new SqliteStore({ ttl: config.sessionMaxAgeMs }),
    cookie: {
      httpOnly: true,
      sameSite: config.sessionSameSite,
      secure: config.sessionSecureCookie,
      maxAge: config.sessionMaxAgeMs,
    },
  })
);

app.get("/healthz", (req, res) => {
  res.json({ ok: true });
});

// CSRF defense: reject cross-origin state-changing API requests
app.use("/api", (req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  const origin = req.get("origin") || req.get("referer") || "";
  const host = req.get("host");
  if (origin && host && !origin.startsWith(`${req.protocol}://${host}`)) {
    return res.status(403).json({ error: "CSRF_REJECTED" });
  }
  next();
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

// Sitemap source data (request-independent). Cached 60s; rebuilt per-request
// into URLs using the request's baseUrl, so nothing request-specific is cached.
const SITEMAP_TTL_MS = 60_000;
const loadSitemapData = memoize(() => {
  const db = getDb();
  const solutionSlugs = getSolutions().map((s) => s.slug);
  const industrySlugs = getIndustries().map((i) => i.slug);
  const posts = db.prepare("SELECT slug, updated_at FROM posts WHERE published = 1").all();
  return { solutionSlugs, industrySlugs, posts };
}, SITEMAP_TTL_MS);

// Sitemap.xml generator
app.get("/sitemap.xml", (req, res) => {
  try {
    const proto = req.get("x-forwarded-proto") || req.protocol;
    const baseUrl = `${proto}://${req.get("host")}`;
    const { solutionSlugs, industrySlugs, posts } = loadSitemapData();

    // Get all static routes
    const staticUrls = [
      { loc: baseUrl, priority: "1.0", changefreq: "daily" },
      { loc: `${baseUrl}/solutions`, priority: "0.9", changefreq: "weekly" },
      { loc: `${baseUrl}/contact-us`, priority: "0.8", changefreq: "monthly" },
      { loc: `${baseUrl}/privacy`, priority: "0.5", changefreq: "monthly" },
      { loc: `${baseUrl}/terms`, priority: "0.5", changefreq: "monthly" },
      { loc: `${baseUrl}/blog`, priority: "0.9", changefreq: "daily" },
    ];

    // Solutions + industries are file-based (contentRegistry), not DB tables
    const solutionUrls = solutionSlugs.map(slug => ({
      loc: `${baseUrl}/solutions/${slug}`,
      priority: "0.8",
      changefreq: "weekly",
    }));

    const industryUrls = industrySlugs.map(slug => ({
      loc: `${baseUrl}/industries/${slug}`,
      priority: "0.8",
      changefreq: "weekly",
    }));

    // Get all published blog posts
    const postUrls = posts.map(p => ({
      loc: `${baseUrl}/blog/${p.slug}`,
      priority: "0.7",
      changefreq: "weekly",
      lastmod: p.updated_at ? new Date(p.updated_at.replace(' ', 'T') + 'Z').toISOString() : new Date().toISOString()
    }));

    // Combine all URLs
    const allUrls = [...staticUrls, ...solutionUrls, ...industryUrls, ...postUrls];

    // Generate XML
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map(url => `  <url>
    <loc>${url.loc}</loc>
    ${url.lastmod ? `<lastmod>${url.lastmod}</lastmod>` : ''}
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`).join('\n')}
</urlset>`;
    
    res.set("Content-Type", "application/xml");
    res.send(xml);
  } catch (err) {
    console.error("Error generating sitemap:", err);
    res.status(500).send("Error generating sitemap");
  }
});

// robots.txt
app.get("/robots.txt", (req, res) => {
  const host = req.get("host") || "atex.sa";
  const proto = req.protocol || "https";
  res.type("text/plain").send(
    [
      "User-agent: *",
      "Allow: /",
      "Disallow: /admin",
      "Disallow: /admin-login",
      "Disallow: /api/",
      "",
      "# AI Crawlers",
      "User-agent: GPTBot",
      "Allow: /",
      "User-agent: ChatGPT-User",
      "Allow: /",
      "User-agent: Google-Extended",
      "Allow: /",
      "User-agent: PerplexityBot",
      "Allow: /",
      "User-agent: ClaudeBot",
      "Allow: /",
      "User-agent: Amazonbot",
      "Allow: /",
      "",
      `Sitemap: ${proto}://${host}/sitemap.xml`,
      `# LLM-readable site summary: ${proto}://${host}/llms.txt`,
      "",
    ].join("\n")
  );
});

// llms.txt — Generative Engine Optimization (GEO) endpoint
// Provides a clean, structured Markdown summary for AI crawlers and LLMs.
app.get("/llms.txt", (req, res) => {
  try {
    const { getSolutions, getIndustries } = require("./data/contentRegistry");
    const { getDb } = require("./db");
    const db = getDb();
    const solutions = getSolutions();
    const industries = getIndustries();
    const baseUrl = `${req.protocol}://${req.get("host")}`;

    let blogSection = "";
    try {
      const posts = db
        .prepare(
          "SELECT title, slug, excerpt, tags_json FROM posts WHERE published = 1 ORDER BY created_at DESC LIMIT 10"
        )
        .all();
      if (posts.length) {
        blogSection =
          "\n## Latest Articles\n\n" +
          posts
            .map((p) => {
              let tags = [];
              try { tags = JSON.parse(p.tags_json || "[]"); } catch {}
              const tagStr = tags.length ? ` [${tags.join(", ")}]` : "";
              return `- [${p.title}](${baseUrl}/blog/${p.slug})${tagStr}: ${p.excerpt || ""}`;
            })
            .join("\n");
      }
    } catch {
      /* blog table may not exist */
    }

    const md = [
      "# ATEX (إي تي إي إكس التجارية)",
      "",
      "> Saudi Arabian IoT systems integrator specializing in smart buildings, smart homes, smart hotels, smart offices, EV charging, security systems, BMS, ICT infrastructure, LED screens, facade lighting, and central vacuum systems.",
      "",
      "## Company Overview",
      "",
      "ATEX is a Saudi-based technology company headquartered in Jeddah, Saudi Arabia. We design, deploy, and maintain Internet of Things (IoT) solutions for residential, commercial, government, industrial, healthcare, education, and smart-city projects across the Kingdom.",
      "",
      "- **Website**: " + baseUrl,
      "- **Phone**: +966 58 010 2121",
      "- **Location**: Jeddah, Saudi Arabia",
      "- **National Unified Number**: 7051668007",
      "- **Languages**: Arabic (primary), English",
      "",
      "## Solutions & Services",
      "",
      ...solutions.map((s) => {
        const features = (s.features || []).map((f) => `  - ${f}`).join("\n");
        const useCases = (s.useCases || []).join("، ");
        return [
          `### ${s.title}`,
          "",
          s.summary,
          "",
          s.details || "",
          "",
          features ? `**Key capabilities:**\n${features}` : "",
          useCases ? `**Use cases:** ${useCases}` : "",
          "",
          `Learn more: ${baseUrl}/solutions/${s.slug}`,
          "",
          "---",
          "",
        ].filter(Boolean).join("\n");
      }),
      "## Industries Served",
      "",
      ...industries.map((i) => {
        const sols = (i.solutions || []).join("، ");
        return [
          `### ${i.title} (${i.englishTitle})`,
          "",
          i.intro || "",
          "",
          sols ? `**Solutions:** ${sols}` : "",
          "",
          `Learn more: ${baseUrl}/industries/${i.slug}`,
          "",
          "---",
          "",
        ].filter(Boolean).join("\n");
      }),
      blogSection,
      "",
      "## Contact",
      "",
      "For inquiries, consultations, or project proposals:",
      "",
      `- **Contact page**: ${baseUrl}/contact-us`,
      "- **WhatsApp**: https://wa.me/966580102121",
      "- **Phone**: +966 58 010 2121",
      "",
      "---",
      "",
      `*This document was auto-generated on ${new Date().toISOString().slice(0, 10)} for AI and LLM consumption. For the full interactive experience, visit [${baseUrl}](${baseUrl}).*`,
      "",
    ].join("\n");

    res.type("text/plain; charset=utf-8").send(md);
  } catch (err) {
    console.error("Error generating llms.txt:", err);
    res.status(500).send("Error generating llms.txt");
  }
});

// Static public site
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(ROOT_DIR, "uploads");
app.use("/assets", express.static(path.join(ROOT_DIR, "assets"), { maxAge: "1d" }));
// Note: /data is intentionally NOT served statically. The JSON source files
// (products.json, posts.json) are read server-side (DB seed in db.js, contentRegistry)
// and exposed to clients only via /api/products/public and /api/posts/public.
app.use("/uploads", express.static(UPLOADS_DIR, { maxAge: "30d" }));
app.use("/vendor/tinymce", express.static(path.join(ROOT_DIR, "node_modules", "tinymce"), { maxAge: "1y", immutable: true }));

// Admin static (disable directory redirect so /admin can be handled by router)
app.use(
  "/admin",
  express.static(path.join(ROOT_DIR, "admin"), {
    redirect: false,
  })
);

// Version endpoint (admin panel reads this)
app.get("/api/version", (req, res) => {
  const { version } = require("../package.json");
  res.json({ version: `v.${version}` });
});

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
