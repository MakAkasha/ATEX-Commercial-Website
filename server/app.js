const path = require("path");
const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const { migrate, getDb } = require("./db");
const { getConfig } = require("./config");
const { requireAdminPage } = require("./auth");
const { createCsrfGuard } = require("./middleware/csrf");
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
const { createResponsiveImage, IMAGE_SIZES } = require("./utils/responsiveImage");
const { createIconHelper } = require("./utils/icon");
const { createAssetHelper } = require("./utils/assets");

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
      path.join(ROOT_DIR, "assets", "js", "consent.js"),
      // The icon sprite is served from /assets with maxAge 1d, and every icon
      // on every page resolves through it, so a stale copy after a deploy that
      // adds a glyph would leave holes in the page until the day expired.
      path.join(ROOT_DIR, "assets", "icons", "sprite.svg"),
    ];
    const newest = Math.max(...files.map((f) => fs.statSync(f).mtimeMs));
    return String(Math.floor(newest));
  } catch {
    return "1";
  }
})();

// Stylesheet / script URLs for every rendered view.
//
// Emits the content-hashed /assets/build/... URLs when `npm run build` has been
// run, and today's /assets/css/styles.css?v=<assetVer> URLs when it has not, so
// the site is correct either way and no deploy has to change for this to be
// safe. Decided once, here, and logged at boot. See server/utils/assets.js.
app.locals.asset = createAssetHelper({ rootDir: ROOT_DIR, assetVer: app.locals.assetVer }).asset;

// Sector links for the site footer — available to every rendered view,
// so the footer list can never drift from server/data/industries.js.
app.locals.footerIndustries = getIndustries();

// Icon markup helper, exposed to every view. Reads assets/icons/sprite.svg at
// boot so the set of renderable names is the sprite itself rather than a list
// that could drift from it. The ?v= is the same cache-buster the stylesheet
// uses, and sprite.svg is one of the files assetVer is derived from above.
app.locals.icon = createIconHelper({
  spritePath: path.join(ROOT_DIR, "assets", "icons", "sprite.svg"),
  spriteUrl: `/assets/icons/sprite.svg?v=${app.locals.assetVer}`,
});

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

// CSRF defense: reject cross-origin state-changing API requests.
// Fails closed (a missing Origin/Referer is a rejection) and compares parsed
// origins rather than string prefixes. See server/middleware/csrf.js for the
// full rationale, including why it is defence-in-depth alongside the session
// cookie's sameSite setting.
app.use("/api", createCsrfGuard(config));

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

    const staticUrls = [
      { loc: baseUrl, priority: "1.0", changefreq: "daily" },
      { loc: `${baseUrl}/solutions`, priority: "0.9", changefreq: "weekly" },
      { loc: `${baseUrl}/products`, priority: "0.8", changefreq: "weekly" },
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

    const postUrls = posts.map(p => ({
      loc: `${baseUrl}/blog/${p.slug}`,
      priority: "0.7",
      changefreq: "weekly",
      lastmod: p.updated_at ? new Date(p.updated_at.replace(' ', 'T') + 'Z').toISOString() : new Date().toISOString()
    }));

    const allUrls = [...staticUrls, ...solutionUrls, ...industryUrls, ...postUrls];

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

// Blog RSS source data (request-independent). Cached 60s; 50 most-recent published posts.
const RSS_TTL_MS = 60_000;
const loadRssPosts = memoize(() => {
  const db = getDb();
  return db
    .prepare(
      "SELECT slug, title, excerpt, created_at, updated_at FROM posts WHERE published = 1 ORDER BY datetime(created_at) DESC LIMIT 50"
    )
    .all();
}, RSS_TTL_MS);

const escapeXml = (str) =>
  String(str || "").replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));

const toRfc822 = (ts) => {
  const d = ts ? new Date(ts.replace(" ", "T") + "Z") : new Date();
  return (isNaN(d) ? new Date() : d).toUTCString();
};

// Blog RSS 2.0 feed
app.get("/blog/rss.xml", (req, res) => {
  try {
    const proto = req.get("x-forwarded-proto") || req.protocol;
    const baseUrl = `${proto}://${req.get("host")}`;
    const posts = loadRssPosts();
    const buildDate = posts.length ? toRfc822(posts[0].updated_at || posts[0].created_at) : new Date().toUTCString();

    const items = posts
      .map((p) => {
        const link = `${baseUrl}/blog/${p.slug}`;
        return `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${toRfc822(p.created_at)}</pubDate>
      <description>${escapeXml(p.excerpt)}</description>
    </item>`;
      })
      .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>مدونة أتكس | ATEX Blog</title>
    <link>${baseUrl}/blog</link>
    <description>أحدث المقالات والرؤى من أتكس حول حلول إنترنت الأشياء والمباني الذكية.</description>
    <language>ar</language>
    <lastBuildDate>${buildDate}</lastBuildDate>
    <atom:link href="${baseUrl}/blog/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

    res.set("Content-Type", "application/rss+xml; charset=utf-8");
    res.send(xml);
  } catch (err) {
    console.error("Error generating RSS feed:", err);
    res.status(500).send("Error generating RSS feed");
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
      `# Blog RSS feed: ${proto}://${host}/blog/rss.xml`,
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
// Fonts before the general /assets mount so they get their own cache policy.
// The filenames embed the upstream Google Fonts version (cairo-v31-*,
// tajawal-v12-*), so a font can never change behind a URL — a new upstream
// release lands at a new path. That makes them safe to mark immutable, the
// same posture as the /vendor/tinymce mount below. Everything else under
// /assets keeps 1d because those filenames are NOT content-addressed and rely
// on the ?v= query for busting, which fonts (referenced from inside CSS) skip.
app.use(
  "/assets/fonts",
  express.static(path.join(ROOT_DIR, "assets", "fonts"), { maxAge: "1y", immutable: true })
);
// Vite build output, before the general /assets mount so it gets its own cache
// policy. Every filename here carries a content hash of its own bytes, so a
// file can never change behind a URL — the same reasoning that makes the fonts
// above immutable, but airtight rather than convention-based.
//
// The directory may not exist (no build has been run); express.static is
// perfectly happy serving nothing, and the asset helper will not have pointed
// at it in that case anyway. The Vite manifest lives at
// assets/build/.vite/manifest.json and stays unreachable from the web because
// serve-static's dotfiles:"ignore" default 404s any dot-segment path.
app.use(
  "/assets/build",
  express.static(path.join(ROOT_DIR, "assets", "build"), { maxAge: "1y", immutable: true })
);
app.use("/assets", express.static(path.join(ROOT_DIR, "assets"), { maxAge: "1d" }));
// Note: /data is intentionally NOT served statically. The JSON source files
// (products.json, posts.json) are read server-side (DB seed in db.js, contentRegistry)
// and exposed to clients only via /api/products/public and /api/posts/public.
app.use("/uploads", express.static(UPLOADS_DIR, { maxAge: "30d" }));

// Responsive-image markup helper, exposed to every view.
//
// Its roots must be exactly the two mounts above: it turns a public URL back
// into the file that serves it so it can check which WebP/AVIF derivatives
// exist before naming them in a srcset. Wired here rather than next to the
// other app.locals at the top of the file because UPLOADS_DIR is only settled
// at this point.
const { picture, preload } = createResponsiveImage({
  roots: [
    { prefix: "/assets/", dir: path.join(ROOT_DIR, "assets") },
    { prefix: "/uploads/", dir: UPLOADS_DIR },
  ],
});
app.locals.picture = picture;
app.locals.imagePreload = preload;
app.locals.imageSizes = IMAGE_SIZES;
// Self-hosted TinyMCE for the admin blog editor (admin/admin.html loads
// /vendor/tinymce/tinymce.min.js; admin/admin.js pins base_url to this prefix,
// so the skin, theme, model, icon and plugin files resolve here too).
//
// Resolved through Node's own module resolution rather than a hardcoded
// ROOT_DIR/node_modules path: that hardcoding only works when npm happens to
// install flat next to the app, and silently 404s the whole editor otherwise
// (a git worktree with no local node_modules, a hoisted monorepo install, or
// pnpm's linked layout). Falls back to the flat path so a missing dependency
// degrades to a broken editor rather than a server that will not boot.
//
// Public by design, exactly as the CDN copy was: this is GPL library code with
// no session or customer data in it.
function resolveTinymceDir() {
  try {
    return path.dirname(require.resolve("tinymce/package.json"));
  } catch {
    return path.join(ROOT_DIR, "node_modules", "tinymce");
  }
}
app.use("/vendor/tinymce", express.static(resolveTinymceDir(), { maxAge: "1y", immutable: true }));

// Admin static, behind the admin session check (disable directory redirect so
// /admin can be handled by router). Exception: the logged-out login page
// (/admin-login, served from routes/pages.js) loads these two files by absolute
// path, so gating them locks everyone out of the panel.
//
// admin.js is deliberately NOT here: at ~100 KB it maps every admin API path,
// payload shape and field name, which is free reconnaissance for an anonymous
// visitor. Its login-form handler was split out into admin/admin-login.js so the
// main bundle can stay gated. admin.css stays exposed because a stylesheet is
// only class names and layout — negligible recon value next to the JS.
//
// Exact-match allowlist on req.path, so anything else — including traversal or
// percent-encoded spellings of admin.js, which never match these literals —
// falls through to requireAdminPage. Fails closed by construction.
const ADMIN_LOGIN_ASSETS = new Set(["/admin.css", "/admin-login.js"]);
app.use(
  "/admin",
  (req, res, next) =>
    ADMIN_LOGIN_ASSETS.has(req.path) ? next() : requireAdminPage(req, res, next),
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
