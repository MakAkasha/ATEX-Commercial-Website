"use strict";

/**
 * Regression tests for the rest of the home page's admin-editable content.
 *
 * Same defect family as test/home.process.content.test.js: server/homeSchema.js
 * declared a field, admin/admin.js rendered an input for it, and no template
 * ever read it — so an admin edited, saved, and the page did not change.
 *
 * Audited across every home section. The ones that were broken and are wired
 * here:
 *
 *   - topbar.phone      (views/partials/site-header.ejs hardcoded the number)
 *   - topbar.ctaText    (the customer-portal link's label was hardcoded)
 *   - topbar.ctaHref    (its URL was hardcoded)
 *   - hero.kicker       (the video hero's eyebrow line was hardcoded)
 *   - hero.ctaPrimary   (the video hero's first button label was hardcoded)
 *   - hero.ctaSecondary (its second button label was hardcoded)
 *   - solutions.heading (views/home.ejs printed "حلول نقدمها" directly)
 *
 * Fields with no render target at all — solutions.cards, sections.productsEnabled
 * and contact.backToTopText — had their admin inputs removed instead; there is
 * nothing on the page for them to drive. Stored values are still normalised, so
 * no saved data is destroyed.
 *
 * Six of the seven defaults above also had their wording changed to match what
 * the page already showed, which means stored rows still carrying the v3 text
 * must be moved forward rather than winning. That is the forwardField() half.
 */

const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { describe, it } = require("node:test");

const ejs = require("ejs");

const { makeTempDbPath } = require("./helpers/server");

process.env.DB_PATH = makeTempDbPath("homewiring");

const { HOME_SCHEMA_VERSION, getDefaultHomeContent, normalizeHomeContent } = require("../server/homeSchema");

const VIEWS = path.join(__dirname, "..", "views");
const HOME_EJS = path.join(VIEWS, "home.ejs");
const HEADER_EJS = path.join(VIEWS, "partials", "site-header.ejs");

/** Slices a fragment out of a template between two literal anchors. */
function fragment(file, startAnchor, endAnchor) {
  const source = fs.readFileSync(file, "utf8");
  const open = source.indexOf(startAnchor);
  assert.ok(open !== -1, `could not find ${startAnchor} in ${file}`);
  const close = source.indexOf(endAnchor, open);
  assert.ok(close !== -1, `could not find ${endAnchor} after ${startAnchor} in ${file}`);
  return source.slice(open, close + endAnchor.length);
}

/** Renders the video hero's kicker and its two buttons. */
function renderHeroCopy(content) {
  return ejs.render(fragment(HOME_EJS, '<p class="heroVideo__kicker"', "</div>"), { content });
}

/** Renders the #solutions section heading. */
function renderSolutionsHead(content) {
  return ejs.render(fragment(HOME_EJS, '<section class="section" id="solutions">', "</div>"), { content });
}

/** Renders the whole header partial — it includes nothing and needs no helpers. */
function renderHeader(content) {
  return ejs.render(fs.readFileSync(HEADER_EJS, "utf8"), { content });
}

describe("home hero — stored content reaches the page", () => {
  it("renders the stored kicker, not a hardcoded line", () => {
    const html = renderHeroCopy({ hero: { kicker: "إنترنت الأشياء — جدة" } });
    assert.match(html, /إنترنت الأشياء — جدة/);
    assert.doesNotMatch(html, /IoT Solutions/);
  });

  it("renders both stored button labels", () => {
    const html = renderHeroCopy({ hero: { ctaPrimary: "احجز زيارة", ctaSecondary: "شاهد الأنظمة" } });
    assert.match(html, /احجز زيارة/);
    assert.match(html, /شاهد الأنظمة/);
    assert.doesNotMatch(html, /ابدأ مشروعك الآن/);
    assert.doesNotMatch(html, /استكشف الحلول/);
  });

  it("falls back to the shipped copy when nothing is stored", () => {
    const html = renderHeroCopy({});
    assert.match(html, /IoT Solutions/);
    assert.match(html, /ابدأ مشروعك الآن/);
    assert.match(html, /استكشف الحلول/);
  });
});

describe("home #solutions — stored heading reaches the page", () => {
  it("renders the stored heading", () => {
    const html = renderSolutionsHead({ solutions: { heading: "أنظمتنا" } });
    assert.match(html, /أنظمتنا/);
    assert.doesNotMatch(html, /حلول نقدمها/);
  });

  it("falls back to the shipped heading", () => {
    assert.match(renderSolutionsHead({}), /حلول نقدمها/);
  });
});

describe("topbar — stored content reaches the header", () => {
  it("renders the stored phone number and builds its WhatsApp link from it", () => {
    const html = renderHeader({ topbar: { phone: "+966511111111" } });
    assert.match(html, /\+966511111111/);
    assert.match(html, /https:\/\/wa\.me\/966511111111/);
    assert.doesNotMatch(html, /\+966580102121/);
  });

  it("renders the stored portal label and URL in both header placements", () => {
    const html = renderHeader({ topbar: { ctaText: "بوابة الشركاء", ctaHref: "https://example.com/portal" } });
    assert.equal(html.match(/بوابة الشركاء/g).length, 4, "label appears as text and aria-label, twice over");
    assert.equal(html.match(/https:\/\/example\.com\/portal/g).length, 2);
    assert.doesNotMatch(html, /portal\.atex-ksa\.com/);
  });

  it("falls back to the shipped portal link", () => {
    const html = renderHeader({});
    assert.match(html, /portal\.atex-ksa\.com/);
    assert.match(html, /بوابة العملاء/);
  });
});

describe("schema v4 — retired defaults move forward, admin edits do not", () => {
  it("is at version 4", () => {
    assert.equal(HOME_SCHEMA_VERSION, 4);
    assert.equal(getDefaultHomeContent().version, 4);
  });

  const retired = {
    topbar: { ctaText: "اطلب عرضاً", ctaHref: "#contact" },
    hero: {
      kicker: "بيانات لحظية • تنبيهات ذكية • قرارات أسرع",
      ctaPrimary: "اطلب عرضاً",
      ctaSecondary: "استعرض المنصة",
    },
    solutions: { heading: "حلول ATEX" },
  };

  it("replaces a stored value that is still the retired v3 default", () => {
    const out = normalizeHomeContent(retired);
    const defaults = getDefaultHomeContent();
    assert.equal(out.topbar.ctaText, defaults.topbar.ctaText);
    assert.equal(out.topbar.ctaHref, defaults.topbar.ctaHref);
    assert.equal(out.hero.kicker, defaults.hero.kicker);
    assert.equal(out.hero.ctaPrimary, defaults.hero.ctaPrimary);
    assert.equal(out.hero.ctaSecondary, defaults.hero.ctaSecondary);
    assert.equal(out.solutions.heading, defaults.solutions.heading);
  });

  it("keeps a value an admin actually edited", () => {
    const out = normalizeHomeContent({
      topbar: { ctaText: "الدخول", ctaHref: "/login" },
      hero: { kicker: "كيكر مخصص", ctaPrimary: "زر أول", ctaSecondary: "زر ثانٍ" },
      solutions: { heading: "عنوان مخصص" },
    });
    assert.equal(out.topbar.ctaText, "الدخول");
    assert.equal(out.topbar.ctaHref, "/login");
    assert.equal(out.hero.kicker, "كيكر مخصص");
    assert.equal(out.hero.ctaPrimary, "زر أول");
    assert.equal(out.hero.ctaSecondary, "زر ثانٍ");
    assert.equal(out.solutions.heading, "عنوان مخصص");
  });

  it("leaves hero.title and hero.desc alone while forwarding the fields beside them", () => {
    const out = normalizeHomeContent({
      hero: { ...retired.hero, title: "عنوان حرره المدير", desc: "وصف حرره المدير" },
    });
    assert.equal(out.hero.title, "عنوان حرره المدير");
    assert.equal(out.hero.desc, "وصف حرره المدير");
    assert.equal(out.hero.kicker, getDefaultHomeContent().hero.kicker);
  });

  it("still normalises the fields whose admin inputs were removed", () => {
    const out = normalizeHomeContent({
      solutions: { cards: [{ iconClass: "fa-solid fa-star", title: "بطاقة", desc: "وصف" }] },
      sections: { productsEnabled: false },
      contact: { backToTopText: "للأعلى" },
    });
    assert.equal(out.solutions.cards.length, 1);
    assert.equal(out.solutions.cards[0].title, "بطاقة");
    assert.equal(out.sections.productsEnabled, false);
    assert.equal(out.contact.backToTopText, "للأعلى");
  });
});
