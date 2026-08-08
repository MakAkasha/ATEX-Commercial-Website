const path = require("path");
const express = require("express");

const { requireAdminPage, isAdminSession } = require("../auth");
const { getDb } = require("../db");
const { normalizeHomeContent } = require("../homeSchema");
const { sanitizePageHtml, sanitizeCssCode } = require("./customPages");
const { sanitizePostHtml } = require("./posts");
const { loadAnalyticsSettings, loadPageSeoSettings } = require("./settings");
const { getSolutions, getIndustries, getRecLandings } = require("../data/contentRegistry");
const { CATEGORIES, getCatalog } = require("../data/productsPage");
const { getTestimonials } = require("../data/testimonials");
const { getBlogRedirectTarget } = require("../data/blogRedirects");
const { safeJsonParse } = require("../utils/safe");
const { extractFaqFromHtml } = require("../utils/articleFaq");
const { memoize } = require("../utils/ttlCache");
const { IMAGE_SIZES } = require("../utils/responsiveImage");

const router = express.Router();
const ROOT_DIR = path.resolve(__dirname, "..", "..");
const HOME_CONTENT_TTL_MS = 60_000;

function loadHomeContentRaw() {
  const db = getDb();
  const row = db.prepare("SELECT content_json FROM home_content WHERE id = 1").get();
  try {
    return normalizeHomeContent(row ? JSON.parse(row.content_json) : null);
  } catch {
    return normalizeHomeContent(null);
  }
}

// 60s in-process TTL cache. Home content is global (not request-specific).
// Admin edits become visible within HOME_CONTENT_TTL_MS at the latest.
const loadHomeContent = memoize(loadHomeContentRaw, HOME_CONTENT_TTL_MS);

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

// Demote in-content <h1> to <h2> so the page title (.subpage__title) stays the sole H1.
function demoteContentH1(html) {
  return (html || "").replace(/<(\/?)h1(\s[^>]*)?>/gi, "<$1h2$2>");
}

function processPost(post) {
  return {
    ...post,
    content_html: demoteContentH1(post.content_html),
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
  // Empty until at least MIN_VISIBLE entries are free of bracketed placeholders.
  const testimonials = getTestimonials();
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
    testimonials,
    latestPosts,
    ...baseRenderData(req),
    structuredData,
    meta: withMeta(req, {
      ...applyPageSeo("/", {
      title: "أتكس | حلول إنترنت الأشياء - المنازل الذكية، الفنادق الذكية، المكاتب الذكية في السعودية",
      description:
        "أتكس مزود سعودي لحلول إنترنت الأشياء: المنازل الذكية، الفنادق الذكية، المكاتب الذكية، المباني الذكية، إضائة الواجهات الخارجية للمباني، نظام المكنسة المركزية، حلول شحن السيارات الكهربائية، الانظمة الامنية التقنية، انظمة تقنية المعلومات. Smart Homes, Smart Hotels, Smart Offices, Smart Buildings, Building Exterior Lighting, Central Vacuum System, Electric Vehicle Charging, Security Systems, IT Systems in Saudi Arabia.",
      ogImage: absoluteUrl(req, "/assets/solutions/smart-building.webp"),
      }),
      // Preload the hero poster (LCP element — CSS background on .heroVideo__media)
      preloadImage: "/assets/hero-video/video-keeper.webp",
    }),
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
      "SELECT id, slug, title, excerpt, cover_image, cover_image_alt, tags_json, created_at, updated_at, content_html FROM posts WHERE published = 1 ORDER BY created_at DESC"
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
  // Retired machine-generated slugs -> readable slugs. Checked before the DB
  // lookup so the redirect still fires once the old row has been renamed away.
  // One O(1) Map hit for every other slug.
  const redirectTo = getBlogRedirectTarget(req.params.slug);
  if (redirectTo) {
    const qsIndex = String(req.originalUrl || "").indexOf("?");
    const queryString = qsIndex === -1 ? "" : req.originalUrl.slice(qsIndex);
    return res.redirect(301, `/blog/${redirectTo}${queryString}`);
  }

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

  // Hand-written SEO copy (blog seed front matter, stored by
  // tools/import-blog-seeds.js). Empty means "not supplied" — an admin-authored
  // post, or any row written before those columns existed, keeps the previous
  // behaviour exactly. EJS escapes all of these at output; the JSON-LD block is
  // escaped in views/partials/structured-data.ejs.
  const postDescription = post.meta_description || post.excerpt || "";
  const postOgTitle = post.og_title || post.title;
  const postCoverAlt = post.cover_image_alt || post.title;

  // Approximate word count from stripped HTML for Article schema
  const wordCount = (post.content_html || "").replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;

  // Articles that carry an .artFaq block also get a FAQPage node. Not for Google
  // rich results — those were restricted to government/health sites in Aug 2023,
  // so atex.sa gets none. The node is for Bing, which still renders FAQ results,
  // and for LLM/AEO extraction, where an explicit Q/A graph is what answer
  // engines quote. Under two pairs there is nothing worth publishing.
  const articleFaqs = extractFaqFromHtml(post.content_html);

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
        "@type": "BlogPosting",
        "@id": `${postUrl}#article`,
        "mainEntityOfPage": { "@type": "WebPage", "@id": postUrl },
        "headline": post.title,
        // Empty strings are invalid for schema.org Text/Date — omit instead.
        ...(postDescription ? { "description": postDescription } : {}),
        "image": coverImage,
        "url": postUrl,
        "inLanguage": "ar-SA",
        ...(post.isoPublished ? { "datePublished": post.isoPublished } : {}),
        ...(post.isoModified ? { "dateModified": post.isoModified } : {}),
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
      ...(articleFaqs.length >= 2 ? [{
        "@type": "FAQPage",
        "@id": `${postUrl}#faq`,
        // Without this the node floats free of the article it came from.
        "isPartOf": { "@id": `${postUrl}#article` },
        "mainEntity": articleFaqs.map((faq) => ({
          "@type": "Question",
          "name": faq.question,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": faq.answer,
          },
        })),
      }] : []),
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
      ogTitle: postOgTitle,
      ogDescription: post.og_description || "",
      ogImageAlt: postCoverAlt,
      description: postDescription,
      keywords: postKeywords,
      author: "أتكس",
      ogType: "article",
      ogImage: coverImage,
      preloadImage: coverImageSrc || null,
      // Must match the sizes on the cover <picture> in blog-post.ejs, or the
      // preload hint and the markup can resolve to different candidates.
      preloadSizes: IMAGE_SIZES.blogPostCover,
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

// Products catalog page (SSR) — Q-System items, images-only, admin-managed.
router.get("/products", (req, res) => {
  const content = loadHomeContent();
  const db = getDb();
  const products = getCatalog(db);

  const siteUrl = absoluteUrl(req, "/");
  const pageUrl = absoluteUrl(req, "/products");

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "الرئيسية", "item": siteUrl },
          { "@type": "ListItem", "position": 2, "name": "المنتجات", "item": pageUrl },
        ],
      },
      {
        "@type": "ItemList",
        "name": "تشكيلة الأنظمة الذكية من أتكس",
        "description": "كتالوج منتجات أتكس: الأقفال الذكية، أنظمة الإنتركوم، مفاتيح التحكم، الشاشات، ولوحات الجرس.",
        "url": pageUrl,
        "numberOfItems": products.length,
        "itemListElement": products.map((p, idx) => ({
          "@type": "ListItem",
          "position": idx + 1,
          "name": p.title,
          "image": absoluteUrl(req, p.image),
        })),
      },
    ],
  };

  return res.render("products", {
    content,
    categories: CATEGORIES,
    products,
    structuredData,
    ...baseRenderData(req),
    meta: withMeta(req, applyPageSeo("/products", {
      title: "أتكس | المنتجات — الأنظمة الذكية",
      description:
        "تشكيلة منتجات أتكس للأنظمة الذكية: الأقفال الذكية، أنظمة الإنتركوم وعائلة بابكوم، مفاتيح التحكم الذكية، شاشات التحكم، ولوحات الجرس داخل المملكة العربية السعودية.",
      ogImage: absoluteUrl(req, "/assets/solutions/smart-building.webp"),
    })),
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

/**
 * Campaign landing pages, registered ABOVE the custom-pages handler below.
 *
 * /rec/smart-home and /rec/smart-villa are printed on brochures and QR codes
 * that are already in circulation, so the URLs are a fixed contract — they sit
 * under the CMS's /rec/ prefix only because that is where the pre-rebuild site
 * happened to publish them.
 *
 * Registered as two literal paths rather than one /rec/:slug + next(): with a
 * fixed pair of slugs there is nothing to look up, and a literal path cannot
 * accidentally shadow a custom page the way a param route could. The custom
 * pages handler is untouched and still owns every other slug, including its
 * own 404. server/routes/customPages.js separately refuses to create a row at
 * either of these slugs, since such a row would render this page instead and
 * never report an error.
 */
const RENDER_LANDING = (page) => (req, res) => {
  const content = loadHomeContent();
  const siteUrl = absoluteUrl(req, "/");
  // Built from the record's own slug, never req.originalUrl: QR traffic arrives
  // with ?utm_source=..., and withMeta() would otherwise mint a distinct
  // canonical (and og:url, and twitter:url) for every scan.
  const pageUrl = absoluteUrl(req, `/rec/${page.slug}`);
  const ogImage = absoluteUrl(req, page.ogImage);

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "الرئيسية", item: siteUrl },
          { "@type": "ListItem", position: 2, name: page.title, item: pageUrl },
        ],
      },
      {
        "@type": "WebPage",
        "@id": `${pageUrl}#page`,
        name: page.metaTitle,
        description: page.metaDescription,
        url: pageUrl,
        image: ogImage,
        inLanguage: "ar-SA",
        isPartOf: { "@id": `${siteUrl}#website` },
      },
      {
        "@type": "Service",
        "@id": `${pageUrl}#service`,
        name: page.title,
        description: page.metaDescription,
        serviceType: page.englishTitle,
        areaServed: "SA",
        audience: { "@type": "Audience", audienceType: page.audienceLabel },
        provider: {
          "@type": "Organization",
          name: "ATEX",
          url: siteUrl,
          telephone: `+${page.wa.number}`,
        },
        // No Product/Offer markup on the cards: these are custom-quote items
        // with no price rendered on the page, and Offer without a visible price
        // is a structured-data policy violation, not just an ineligible result.
        hasOfferCatalog: {
          "@type": "OfferCatalog",
          name: page.productsSection.title,
          itemListElement: page.products.map((product, idx) => ({
            "@type": "ListItem",
            position: idx + 1,
            name: product.title,
            description: product.desc,
          })),
        },
      },
      {
        "@type": "FAQPage",
        mainEntity: page.faq.items.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
    ],
  };

  return res.render("rec-landing", {
    content,
    page,
    structuredData,
    quoteFormId: "recQuoteForm",
    // Everything assets/js/rec-landing.js needs, as a JSON island. Field
    // descriptors travel too, so the message composer knows which inputs have
    // no column on /api/contact and must be folded into the message text.
    clientConfig: {
      slug: page.slug,
      formId: "recQuoteForm",
      pageTitle: page.title,
      waNumber: page.wa.number,
      waText: page.primaryCta.waText,
      fields: page.quote.fields.map((field) => ({
        name: field.name,
        apiField: field.apiField || null,
        messageLabel: field.messageLabel || null,
        required: !!field.required,
      })),
    },
    ...baseRenderData(req),
    meta: withMeta(req, {
      title: page.metaTitle,
      description: page.metaDescription,
      ogTitle: page.title,
      ogDescription: page.metaDescription,
      ogImage,
      canonical: pageUrl,
    }),
  });
};

getRecLandings().forEach((page) => {
  router.get(`/rec/${page.slug}`, RENDER_LANDING(page));
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
