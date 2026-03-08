const path = require("path");
const fs = require("fs");
const express = require("express");

const { requireAdminPage } = require("../auth");
const { getDb } = require("../db");
const { normalizeHomeContent } = require("../homeSchema");
const { sanitizePageHtml } = require("./customPages");
const { loadAnalyticsSettings } = require("./settings");
const { solutions } = require("../data/solutions");

const router = express.Router();
const ROOT_DIR = path.resolve(__dirname, "..", "..");

function loadPartnerLogos() {
  const dir = path.join(ROOT_DIR, "assets", "social-logos");
  try {
    const files = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => /^partner-(\d+)\.svg$/i.test(name))
      .sort((a, b) => {
        const ai = Number((a.match(/^partner-(\d+)\.svg$/i) || [])[1] || 0);
        const bi = Number((b.match(/^partner-(\d+)\.svg$/i) || [])[1] || 0);
        return ai - bi;
      })
      .map((name) => `/assets/social-logos/${name}`);
    if (files.length) return files;
  } catch {
    // ignore and fallback
  }

  return [
    "/assets/social-logos/roshn.svg",
    "/assets/social-logos/red-sea.svg",
    "/assets/social-logos/stc.svg",
    "/assets/social-logos/new-murabba.svg",
    "/assets/social-logos/almarai.svg",
    "/assets/social-logos/aramco-digital.svg",
  ];
}

function loadHomeContent() {
  const db = getDb();
  const row = db.prepare("SELECT content_json FROM home_content WHERE id = 1").get();
  try {
    return normalizeHomeContent(row ? JSON.parse(row.content_json) : null);
  } catch {
    return normalizeHomeContent(null);
  }
}

function parseCookie(cookieHeader) {
  const safeDecode = (value) => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };

  const out = {};
  const raw = String(cookieHeader || "");
  raw.split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i <= 0) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (!k) return;
    out[k] = safeDecode(v);
  });
  return out;
}

function getConsent(req) {
  const cookies = parseCookie(req.headers.cookie);
  const v = String(cookies["atex.consent"] || "").toLowerCase();
  if (v === "analytics") return "analytics";
  if (v === "essential") return "essential";
  return "unknown";
}

function baseRenderData(req) {
  return {
    consent: getConsent(req),
    analytics: loadAnalyticsSettings(),
  };
}

// Home (SSR)
router.get("/", (req, res) => {
  const content = loadHomeContent();
  const db = getDb();
  const socialLogos = loadPartnerLogos();
  const pageSolutions = solutions;
  const latestPosts = db
    .prepare(
      "SELECT id, slug, title, excerpt, cover_image, created_at FROM posts WHERE published = 1 ORDER BY created_at DESC LIMIT 3"
    )
    .all();
  return res.render("home", {
    content,
    pageSolutions,
    socialLogos,
    latestPosts,
    ...baseRenderData(req),
    meta: {
      title: "ATEX | حلول إنترنت الأشياء في السعودية",
      description:
        "ATEX مزود سعودي لحلول إنترنت الأشياء للشركات: تتبّع الأصول، إدارة الأساطيل، المراقبة البيئية، العدادات والطاقة، وسلسلة التبريد مع منصة بيانات وتكاملات.",
    },
  });
});

// Friendly routes
router.get("/admin-login", (req, res) => {
  res.sendFile(path.join(ROOT_DIR, "admin", "admin-login.html"));
});

router.get("/admin", requireAdminPage, (req, res) => {
  res.sendFile(path.join(ROOT_DIR, "admin", "admin.html"));
});

// Legal (SSR)
router.get("/privacy", (req, res) => {
  const content = loadHomeContent();
  res.render("privacy", {
    content,
    ...baseRenderData(req),
    meta: { title: "ATEX | سياسة الخصوصية", description: "سياسة الخصوصية لموقع ATEX داخل المملكة العربية السعودية." },
  });
});

router.get("/terms", (req, res) => {
  const content = loadHomeContent();
  res.render("terms", {
    content,
    ...baseRenderData(req),
    meta: { title: "ATEX | الشروط والأحكام", description: "الشروط والأحكام لاستخدام موقع ATEX داخل المملكة العربية السعودية." },
  });
});

// Blog (SSR)
router.get("/blog", (req, res) => {
  const db = getDb();
  const content = loadHomeContent();
  const posts = db
    .prepare(
      "SELECT id, slug, title, excerpt, cover_image, created_at, updated_at FROM posts WHERE published = 1 ORDER BY created_at DESC"
    )
    .all();
  res.render("blog-list", {
    posts,
    content,
    ...baseRenderData(req),
    meta: {
      title: "ATEX | المدونة",
      description: "مدونة ATEX: مقالات وأفضل الممارسات في حلول إنترنت الأشياء داخل المملكة العربية السعودية.",
    },
  });
});

router.get("/blog/:slug", (req, res) => {
  const db = getDb();
  const content = loadHomeContent();
  const post = db.prepare("SELECT * FROM posts WHERE published = 1 AND slug = ?").get(req.params.slug);
  if (!post)
    return res
      .status(404)
      .render("not-found", { content, ...baseRenderData(req), meta: { title: "ATEX | غير موجود" } });
  res.render("blog-post", {
    post,
    content,
    ...baseRenderData(req),
    meta: {
      title: `ATEX | ${post.title}`,
      description: post.excerpt || "",
    },
  });
});

// Solutions page
router.get("/solutions", (req, res) => {
  const content = loadHomeContent();
  return res.render("solutions", {
    content,
    pageSolutions: solutions,
    ...baseRenderData(req),
    meta: {
      title: "ATEX | الأنظمة والحلول",
      description:
        "صفحة الأنظمة والحلول من ATEX: تفاصيل موسّعة لكل حل مع القدرات الأساسية، حالات الاستخدام، وصور داعمة للمشاريع داخل السعودية.",
    },
  });
});

// Single solution page
router.get("/solutions/:slug", (req, res) => {
  const content = loadHomeContent();
  const slug = String(req.params.slug || "").toLowerCase();
  const solution = solutions.find((s) => s.slug === slug);

  if (!solution) {
    return res
      .status(404)
      .render("not-found", { content, ...baseRenderData(req), meta: { title: "ATEX | غير موجود" } });
  }

  const relatedSolutions = solutions.filter((s) => s.slug !== solution.slug).slice(0, 3);

  return res.render("solution-detail", {
    content,
    solution,
    relatedSolutions,
    ...baseRenderData(req),
    meta: {
      title: `ATEX | ${solution.title}`,
      description: solution.summary,
    },
  });
});

// Contact us page
router.get("/contact-us", (req, res) => {
  const content = loadHomeContent();
  return res.render("contact-us", {
    content,
    ...baseRenderData(req),
    meta: {
      title: "ATEX | تواصل معنا",
      description: "تواصل مع فريق أتكس للحصول على استشارة وحلول تقنية تناسب مشروعك.",
    },
  });
});

// Custom pages (public)
router.get("/rec/:slug", (req, res) => {
  const slug = String(req.params.slug || "");
  const db = getDb();
  const content = loadHomeContent();
  const row = db.prepare("SELECT * FROM custom_pages WHERE slug = ? AND published = 1").get(slug);
  if (!row)
    return res
      .status(404)
      .render("not-found", { content, ...baseRenderData(req), meta: { title: "ATEX | غير موجود" } });

  const page = {
    id: row.id,
    title: row.title,
    slug: row.slug,
    html_code: sanitizePageHtml(row.html_code || ""),
    css_code: String(row.css_code || ""),
    // JS is only allowed when unsafe_js is enabled for that page.
    js_code: row.unsafe_js ? String(row.js_code || "") : "",
    unsafe_js: !!row.unsafe_js,
  };

  return res.render("custom-page", {
    content,
    page,
    ...baseRenderData(req),
    meta: {
      title: `ATEX | ${page.title}`,
      description: page.title,
    },
  });
});

router.use((req, res) => {
  const content = loadHomeContent();
  res.status(404).render("not-found", { content, ...baseRenderData(req), meta: { title: "ATEX | غير موجود" } });
});

module.exports = router;
