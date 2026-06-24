const path = require("path");
const fs = require("fs");
const express = require("express");

const { requireAdminPage, isAdminSession } = require("../auth");
const { getDb } = require("../db");
const { normalizeHomeContent } = require("../homeSchema");
const { sanitizePageHtml, sanitizeCssCode } = require("./customPages");
const { sanitizePostHtml } = require("./posts");
const { loadAnalyticsSettings, loadPageSeoSettings } = require("./settings");
const { getSolutions, getIndustries } = require("../data/contentRegistry");
const { safeJsonParse } = require("../utils/safe");

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

// Merges admin-controlled page SEO overrides on top of server defaults.
// Only non-empty values from the override win.
function applyPageSeo(route, defaults) {
  const allSeo = loadPageSeoSettings();
  const override = allSeo[route] || {};
  const result = { ...defaults };
  if (override.title) result.title = override.title;
  if (override.description) result.description = override.description;
  if (override.ogDescription) result.ogDescription = override.ogDescription;
  if (override.description && !result.ogDescription) result.ogDescription = override.description;
  if (override.ogImage) result.ogImage = override.ogImage;
  if (override.keywords) result.keywords = override.keywords;
  if (override.robots) result.robots = override.robots;
  if (override.canonical) result.canonical = override.canonical;
  return result;
}

function absoluteUrl(req, pathname = "/") {
  const proto = req.get("x-forwarded-proto") || req.protocol;
  const origin = `${proto}://${req.get("host")}`;
  return new URL(pathname, origin).toString();
}

function withMeta(req, meta) {
  return {
    ...meta,
    canonical: meta?.canonical || absoluteUrl(req, req.originalUrl || "/"),
  };
}

function estimateReadingTime(html) {
  const text = String(html || "").replace(/<[^>]+>/g, " ");
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function formatArabicDate(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(String(dateStr).replace(" ", "T"));
    return d.toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return String(dateStr);
  }
}

function toISODate(dateStr) {
  if (!dateStr) return "";
  try {
    return new Date(String(dateStr).replace(" ", "T")).toISOString();
  } catch {
    return "";
  }
}

function processPost(post) {
  return {
    ...post,
    tags: safeJsonParse(post.tags_json, []),
    readingTime: estimateReadingTime(post.content_html || ""),
    formattedDate: formatArabicDate(post.created_at),
    isoPublished: toISODate(post.created_at),
    isoModified: toISODate(post.updated_at || post.created_at),
  };
}

// Home (SSR)
router.get("/", (req, res) => {
  const solutions = getSolutions();
  const industries = getIndustries();
  const content = loadHomeContent();
  const db = getDb();
  const socialLogos = []; // partner logos hidden pending verification of client relationships
  const pageSolutions = solutions;
  const pageIndustries = industries;
  const latestPosts = db
    .prepare(
      "SELECT id, slug, title, excerpt, cover_image, created_at FROM posts WHERE published = 1 ORDER BY created_at DESC LIMIT 3"
    )
    .all();
  
  const siteUrl = absoluteUrl(req, "/");
  
  // JSON-LD Structured Data for Homepage
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteUrl}#organization`,
        "name": "ATEX",
        "alternateName": "اتكس",
        "url": siteUrl,
        "logo": {
          "@type": "ImageObject",
          "url": absoluteUrl(req, "/assets/ATEX-logo.svg")
        },
        "description": "ATEX (اتكس) مزود سعودي لحلول إنترنت الأشياء: المنازل الذكية، الفنادق الذكية، المكاتب الذكية، المباني الذكية، إضائة الواجهات الخارجية للمباني، نظام المكنسة المركزية، حلول شحن السيارات الكهربائية، الانظمة الامنية التقنية، انظمة تقنية المعلومات. Smart Homes, Smart Hotels, Smart Offices, Smart Buildings, Building Exterior Lighting, Central Vacuum System, Electric Vehicle Charging, Security Systems, IT Systems",
        "address": {
          "@type": "PostalAddress",
          "addressCountry": "SA",
          "addressLocality": "جدة"
        },
        "contactPoint": {
          "@type": "ContactPoint",
          "telephone": "+966580102121",
          "contactType": "sales"
        }
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}#website`,
        "url": siteUrl,
        "name": "ATEX",
        "alternateName": "اتكس",
        "description": "حلول إنترنت الأشياء في السعودية: المنازل الذكية، الفنادق الذكية، المكاتب الذكية، المباني الذكية، إضائة الواجهات الخارجية للمباني، نظام المكنسة المركزية، حلول شحن السيارات الكهربائية، الانظمة الامنية التقنية، انظمة تقنية المعلومات. Smart Homes, Smart Hotels, Smart Offices, Smart Buildings, Building Exterior Lighting, Central Vacuum System, Electric Vehicle Charging, Security Systems, IT Systems",
        "inLanguage": "ar-SA",
        "publisher": {
          "@id": `${siteUrl}#organization`
        }
      },
      {
        "@type": "WebPage",
        "@id": `${siteUrl}#webpage`,
        "url": siteUrl,
        "name": "ATEX (اتكس) | حلول إنترنت الأشياء - المنازل الذكية، الفنادق الذكية، المكاتب الذكية في السعودية",
        "alternateName": "اتكس | حلول إنترنت الأشياء - المنازل الذكية، الفنادق الذكية، المكاتب الذكية",
        "description": "ATEX (اتكس) مزود سعودي لحلول إنترنت الأشياء: المنازل الذكية، الفنادق الذكية، المكاتب الذكية، المباني الذكية، إضائة الواجهات الخارجية للمباني، نظام المكنسة المركزية، حلول شحن السيارات الكهربائية، الانظمة الامنية التقنية، انظمة تقنية المعلومات. Smart Homes, Smart Hotels, Smart Offices, Smart Buildings, Building Exterior Lighting, Central Vacuum System, Electric Vehicle Charging, Security Systems, IT Systems in Saudi Arabia",
        "isPartOf": {
          "@id": `${siteUrl}#website`
        },
        "about": {
          "@id": `${siteUrl}#organization`
        }
      }
    ]
  };
  
  return res.render("home", {
    content,
    pageSolutions,
    pageIndustries,
    socialLogos,
    latestPosts,
    ...baseRenderData(req),
    structuredData,
    meta: withMeta(req, applyPageSeo("/", {
      title: "أتكس | حلول إنترنت الأشياء - المنازل الذكية، الفنادق الذكية، المكاتب الذكية في السعودية",
      description:
        "أتكس مزود سعودي لحلول إنترنت الأشياء: المنازل الذكية، الفنادق الذكية، المكاتب الذكية، المباني الذكية، إضائة الواجهات الخارجية للمباني، نظام المكنسة المركزية، حلول شحن السيارات الكهربائية، الانظمة الامنية التقنية، انظمة تقنية المعلومات. Smart Homes, Smart Hotels, Smart Offices, Smart Buildings, Building Exterior Lighting, Central Vacuum System, Electric Vehicle Charging, Security Systems, IT Systems in Saudi Arabia.",
      ogImage: absoluteUrl(req, "/assets/solutions/smart-building.webp"),
      preloadImage: "/assets/hero-video/video-keeper.webp",
    })),
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
    meta: withMeta(req, applyPageSeo("/privacy", {
      title: "أتكس | سياسة الخصوصية",
      description: "سياسة الخصوصية لموقع أتكس داخل المملكة العربية السعودية.",
    })),
  });
});

router.get("/terms", (req, res) => {
  const content = loadHomeContent();
  res.render("terms", {
    content,
    ...baseRenderData(req),
    meta: withMeta(req, applyPageSeo("/terms", {
      title: "أتكس | الشروط والأحكام",
      description: "الشروط والأحكام لاستخدام موقع أتكس داخل المملكة العربية السعودية.",
    })),
  });
});

// Blog (SSR)
router.get("/blog", (req, res) => {
  const db = getDb();
  const content = loadHomeContent();
  const rawPosts = db
    .prepare(
      "SELECT id, slug, title, excerpt, cover_image, tags_json, created_at, updated_at, content_html FROM posts WHERE published = 1 ORDER BY created_at DESC"
    )
    .all();
  const posts = rawPosts.map(processPost);

  const siteUrl = absoluteUrl(req, "/");
  const blogUrl = absoluteUrl(req, "/blog");
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "الرئيسية", "item": siteUrl },
          { "@type": "ListItem", "position": 2, "name": "المدونة", "item": blogUrl },
        ],
      },
      {
        "@type": "Blog",
        "name": "مدونة أتكس",
        "description": "مقالات وأفضل الممارسات في حلول إنترنت الأشياء داخل المملكة العربية السعودية.",
        "url": blogUrl,
        "inLanguage": "ar-SA",
        "publisher": {
          "@type": "Organization",
          "name": "ATEX",
          "logo": { "@type": "ImageObject", "url": absoluteUrl(req, "/assets/ATEX-logo.svg") },
        },
      },
    ],
  };

  res.render("blog-list", {
    posts,
    content,
    structuredData,
    ...baseRenderData(req),
    meta: withMeta(req, applyPageSeo("/blog", {
      title: "أتكس | المدونة — حلول إنترنت الأشياء في السعودية",
      description: "مدونة أتكس: مقالات وأفضل الممارسات في حلول إنترنت الأشياء، المنازل الذكية، المباني الذكية، وإدارة الطاقة داخل المملكة العربية السعودية.",
      ogImage: absoluteUrl(req, "/assets/solutions/smart-building.webp"),
    })),
  });
});

router.get("/blog/:slug", (req, res) => {
  const db = getDb();
  const content = loadHomeContent();
  const rawPost = db.prepare("SELECT * FROM posts WHERE published = 1 AND slug = ?").get(req.params.slug);
  if (!rawPost)
    return res
      .status(404)
      .render("not-found", { content, ...baseRenderData(req), meta: { title: "أتكس | غير موجود", robots: "noindex, nofollow" } });

  const post = processPost({
    ...rawPost,
    // Defense-in-depth: re-sanitize at render time in case DB row was tampered or pre-dates input sanitization.
    content_html: sanitizePostHtml(rawPost.content_html),
  });

  // Related posts: prefer tag overlap, fallback to latest
  const allOtherRaw = db
    .prepare("SELECT id, slug, title, excerpt, cover_image, tags_json, created_at FROM posts WHERE published = 1 AND slug != ? ORDER BY created_at DESC LIMIT 20")
    .all(req.params.slug);
  const relatedPosts = allOtherRaw
    .map((p) => {
      const t = safeJsonParse(p.tags_json, []);
      return { ...p, tags: t, formattedDate: formatArabicDate(p.created_at), score: t.filter((tag) => post.tags.includes(tag)).length };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const siteUrl = absoluteUrl(req, "/");
  const postUrl = absoluteUrl(req, `/blog/${post.slug}`);
  const coverImageSrc = post.cover_image && !post.cover_image.startsWith("data:") ? post.cover_image : null;
  const coverImage = coverImageSrc ? absoluteUrl(req, coverImageSrc) : absoluteUrl(req, "/assets/solutions/smart-building.webp");

  const postSection = (post.tags && post.tags.length) ? post.tags[0] : "حلول إنترنت الأشياء";
  const postKeywords = (post.tags && post.tags.length) ? post.tags.join("، ") : "";

  // Approximate word count from stripped HTML for Article schema
  const wordCount = (post.content_html || "").replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "الرئيسية", "item": siteUrl },
          { "@type": "ListItem", "position": 2, "name": "المدونة", "item": absoluteUrl(req, "/blog") },
          { "@type": "ListItem", "position": 3, "name": post.title, "item": postUrl },
        ],
      },
      {
        "@type": "Article",
        "@id": `${postUrl}#article`,
        "mainEntityOfPage": { "@type": "WebPage", "@id": postUrl },
        "headline": post.title,
        "description": post.excerpt || "",
        "image": coverImage,
        "url": postUrl,
        "inLanguage": "ar-SA",
        "datePublished": post.isoPublished,
        "dateModified": post.isoModified,
        "author": { "@type": "Organization", "name": "أتكس", "url": siteUrl },
        "publisher": {
          "@type": "Organization",
          "name": "أتكس",
          "logo": { "@type": "ImageObject", "url": absoluteUrl(req, "/assets/ATEX-logo.svg") },
        },
        "isPartOf": { "@type": "Blog", "url": absoluteUrl(req, "/blog") },
        ...(post.tags.length ? { "keywords": post.tags.join(", ") } : {}),
        ...(wordCount > 0 ? { "wordCount": wordCount } : {}),
      },
    ],
  };

  res.render("blog-post", {
    post,
    relatedPosts,
    content,
    structuredData,
    ...baseRenderData(req),
    meta: withMeta(req, {
      title: `${post.title} | أتكس`,
      ogTitle: post.title,
      ogImageAlt: post.title,
      description: post.excerpt || "",
      keywords: postKeywords,
      author: "أتكس",
      ogType: "article",
      ogImage: coverImage,
      preloadImage: coverImageSrc || null,
      articlePublishedTime: post.isoPublished,
      articleModifiedTime: post.isoModified,
      articleAuthor: "أتكس",
      articleSection: postSection,
      articleTags: post.tags || [],
    }),
  });
});

// Solutions page
router.get("/solutions", (req, res) => {
  const solutions = getSolutions();
  const content = loadHomeContent();
  const siteUrl = absoluteUrl(req, "/");
  const pageUrl = absoluteUrl(req, "/solutions");

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "الرئيسية", "item": siteUrl },
          { "@type": "ListItem", "position": 2, "name": "الأنظمة والحلول", "item": pageUrl },
        ],
      },
      {
        "@type": "ItemList",
        "name": "حلول إنترنت الأشياء من أتكس",
        "description": "كتالوج شامل لحلول إنترنت الأشياء والأنظمة الذكية المقدمة من أتكس في السعودية.",
        "url": pageUrl,
        "numberOfItems": solutions.length,
        "itemListElement": solutions.map((s, idx) => ({
          "@type": "ListItem",
          "position": idx + 1,
          "name": s.title,
          "url": absoluteUrl(req, `/solutions/${s.slug}`),
          "description": s.summary,
          "image": absoluteUrl(req, s.primaryImage),
        })),
      },
    ],
  };

  return res.render("solutions", {
    content,
    pageSolutions: solutions,
    structuredData,
    ...baseRenderData(req),
    meta: withMeta(req, applyPageSeo("/solutions", {
      title: "أتكس | الأنظمة والحلول",
      description:
        "صفحة الأنظمة والحلول من أتكس: تفاصيل موسّعة لكل حل مع القدرات الأساسية، حالات الاستخدام، وصور داعمة للمشاريع داخل السعودية.",
      ogImage: absoluteUrl(req, "/assets/solutions/smart-building.webp"),
    })),
  });
});

// Single solution page
router.get("/solutions/:slug", (req, res) => {
  const solutions = getSolutions();
  const industries = getIndustries();
  const content = loadHomeContent();
  const slug = String(req.params.slug || "").toLowerCase();
  const solution = solutions.find((s) => s.slug === slug);

  if (!solution) {
    return res
      .status(404)
      .render("not-found", { content, ...baseRenderData(req), meta: { title: "أتكس | غير موجود", robots: "noindex, nofollow" } });
  }

  const relatedSolutions = solutions
    .filter((s) => s.slug !== solution.slug)
    .sort((a, b) => {
      const aScore = (a.industrySlugs || []).filter((i) => (solution.industrySlugs || []).includes(i)).length;
      const bScore = (b.industrySlugs || []).filter((i) => (solution.industrySlugs || []).includes(i)).length;
      return bScore - aScore;
    })
    .slice(0, 3);
  const relatedIndustries = industries.filter((i) => (solution.industrySlugs || []).includes(i.slug)).slice(0, 3);

  const siteUrl = absoluteUrl(req, "/");
  const pageUrl = absoluteUrl(req, `/solutions/${solution.slug}`);
  const solutionImage = absoluteUrl(req, solution.primaryImage);

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "الرئيسية", "item": siteUrl },
          { "@type": "ListItem", "position": 2, "name": "الأنظمة والحلول", "item": absoluteUrl(req, "/solutions") },
          { "@type": "ListItem", "position": 3, "name": solution.title, "item": pageUrl },
        ],
      },
      {
        "@type": "Service",
        "@id": `${pageUrl}#service`,
        "name": solution.title,
        "description": solution.details || solution.summary,
        "url": pageUrl,
        "image": solutionImage,
        "provider": {
          "@type": "Organization",
          "name": "ATEX",
          "url": siteUrl,
        },
        "areaServed": {
          "@type": "Country",
          "name": "Saudi Arabia",
        },
        "hasOfferCatalog": {
          "@type": "OfferCatalog",
          "name": solution.title,
          "itemListElement": (solution.features || []).map((f, idx) => ({
            "@type": "Offer",
            "itemOffered": {
              "@type": "Service",
              "name": f,
            },
          })),
        },
      },
      ...(solution.faqs && solution.faqs.length ? [{
        "@type": "FAQPage",
        "mainEntity": solution.faqs.map((faq) => ({
          "@type": "Question",
          "name": faq.q,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": faq.a,
          },
        })),
      }] : []),
    ],
  };

  return res.render("solution-detail", {
    content,
    solution,
    relatedSolutions,
    relatedIndustries,
    structuredData,
    ...baseRenderData(req),
    meta: withMeta(req, {
      title: `أتكس | ${solution.title}`,
      description: solution.summary,
      ogTitle: solution.title,
      ogDescription: solution.summary,
      ogImage: solutionImage,
    }),
  });
});

router.get("/industries/:slug", (req, res) => {
  const industries = getIndustries();
  const solutions = getSolutions();
  const content = loadHomeContent();
  const slug = String(req.params.slug || "").toLowerCase();
  const industry = industries.find((s) => s.slug === slug);

  if (!industry) {
    return res
      .status(404)
      .render("not-found", { content, ...baseRenderData(req), meta: { title: "أتكس | غير موجود", robots: "noindex, nofollow" } });
  }

  const relatedSolutions = solutions.filter((s) => (industry.solutionSlugs || []).includes(s.slug)).slice(0, 4);
  const relatedIndustries = industries
    .filter((i) => i.slug !== industry.slug)
    .sort((a, b) => {
      const aScore = (a.solutionSlugs || []).filter((s) => (industry.solutionSlugs || []).includes(s)).length;
      const bScore = (b.solutionSlugs || []).filter((s) => (industry.solutionSlugs || []).includes(s)).length;
      return bScore - aScore;
    })
    .slice(0, 3);

  const siteUrl = absoluteUrl(req, "/");
  const pageUrl = absoluteUrl(req, `/industries/${industry.slug}`);
  const industryImage = absoluteUrl(req, industry.image);

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "الرئيسية", "item": siteUrl },
          { "@type": "ListItem", "position": 2, "name": industry.title, "item": pageUrl },
        ],
      },
      {
        "@type": "CollectionPage",
        "@id": `${pageUrl}#page`,
        "name": industry.metaTitle || industry.title,
        "description": industry.metaDescription || industry.intro,
        "url": pageUrl,
        "image": industryImage,
        "isPartOf": { "@id": `${siteUrl}#website` },
        "about": {
          "@type": "Thing",
          "name": industry.title,
          "description": industry.intro,
        },
        "mainEntity": {
          "@type": "ItemList",
          "name": `حلول أتكس لـ ${industry.title}`,
          "itemListElement": relatedSolutions.map((s, idx) => ({
            "@type": "ListItem",
            "position": idx + 1,
            "name": s.title,
            "url": absoluteUrl(req, `/solutions/${s.slug}`),
          })),
        },
      },
      ...(industry.faqs && industry.faqs.length ? [{
        "@type": "FAQPage",
        "mainEntity": industry.faqs.map((faq) => ({
          "@type": "Question",
          "name": faq.q,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": faq.a,
          },
        })),
      }] : []),
    ],
  };

  return res.render("industry-detail", {
    content,
    industry,
    relatedSolutions,
    relatedIndustries,
    structuredData,
    ...baseRenderData(req),
    meta: withMeta(req, {
      title: `أتكس | ${industry.title}`,
      description: industry.metaDescription || industry.intro,
      ogTitle: industry.metaTitle || industry.title,
      ogDescription: industry.metaDescription || industry.intro,
      ogImage: industryImage,
    }),
  });
});

// Contact us page
router.get("/contact-us", (req, res) => {
  const content = loadHomeContent();
  const siteUrl = absoluteUrl(req, "/");
  const pageUrl = absoluteUrl(req, "/contact-us");

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "الرئيسية", "item": siteUrl },
          { "@type": "ListItem", "position": 2, "name": "تواصل معنا", "item": pageUrl },
        ],
      },
      {
        "@type": "ContactPage",
        "name": "تواصل مع أتكس",
        "description": "تواصل مع فريق أتكس للحصول على استشارة وحلول تقنية تناسب مشروعك.",
        "url": pageUrl,
        "mainEntity": {
          "@type": "Organization",
          "name": "ATEX",
          "url": siteUrl,
          "telephone": "+966580102121",
          "address": {
            "@type": "PostalAddress",
            "addressLocality": "جدة",
            "addressCountry": "SA",
          },
          "contactPoint": [
            {
              "@type": "ContactPoint",
              "telephone": "+966580102121",
              "contactType": "sales",
              "areaServed": "SA",
              "availableLanguage": ["Arabic", "English"],
            },
          ],
        },
      },
    ],
  };

  return res.render("contact-us", {
    content,
    structuredData,
    ...baseRenderData(req),
    meta: withMeta(req, applyPageSeo("/contact-us", {
      title: "ATEX | تواصل معنا",
      description: "تواصل مع فريق أتكس للحصول على استشارة وحلول تقنية تناسب مشروعك.",
    })),
  });
});

// Custom pages (public)
router.get("/rec/:slug", (req, res) => {
  const slug = String(req.params.slug || "");
  const db = getDb();
  const content = loadHomeContent();
  const row = isAdminSession(req)
    ? db.prepare("SELECT * FROM custom_pages WHERE slug = ?").get(slug)
    : db.prepare("SELECT * FROM custom_pages WHERE slug = ? AND published = 1").get(slug);
  if (!row)
    return res
      .status(404)
      .render("not-found", { content, ...baseRenderData(req), meta: { title: "أتكس | غير موجود", robots: "noindex, nofollow" } });

  const page = {
    id: row.id,
    title: row.title,
    slug: row.slug,
    html_code: sanitizePageHtml(row.html_code || ""),
    // Defense-in-depth: re-sanitize css_code at render time for legacy/tampered DB rows.
    css_code: sanitizeCssCode(row.css_code || ""),
    // JS is only allowed when unsafe_js is enabled for that page.
    js_code: row.unsafe_js ? String(row.js_code || "") : "",
    unsafe_js: !!row.unsafe_js,
    published: !!row.published,
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
  res.status(404).render("not-found", { content, ...baseRenderData(req), meta: { title: "أتكس | غير موجود", robots: "noindex, nofollow" } });
});

module.exports = router;
