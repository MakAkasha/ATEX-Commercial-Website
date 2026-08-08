#!/usr/bin/env node
"use strict";

/**
 * Renders the two /rec campaign landing pages as custom-page rows.
 *
 * WHY THIS EXISTS
 *
 * The proper version of these pages is code — server/routes/pages.js plus
 * views/partials/rec/*. But production is pinned to an older base than main and
 * deliberately so (it deliberately excludes the backlog on main), and the coded
 * pages need two helpers that base does not have: the responsive-image helper
 * and the icon sprite. Deploying them therefore means shipping the whole
 * backlog, which is not wanted.
 *
 * The custom-pages CMS is the way in that needs no code deploy at all: two rows
 * in `custom_pages`, served by the existing /rec/:slug route. The printed QR
 * codes start working today, and the coded version supersedes these rows
 * whenever the site is next brought up to date.
 *
 * WHAT THE CMS ALLOWS, MEASURED
 *
 * sanitizePageHtml() (server/routes/customPages.js) keeps: div, section, ul, li,
 * h2, h3, p, img, a[href,target,rel], strong, bdi, figure, dl, dt, dd, and
 * class/id on anything. It STRIPS: <video>, <form>, <input>, <button>,
 * <details>, <script>, `style=`, `data-*`, `dir=`, and tel: hrefs.
 *
 * So this build makes three substitutions, each losing something real:
 *
 *   video   -> the poster still as a CSS background. No motion.
 *   form    -> a WhatsApp deep link as the primary action, plus a link to
 *              /contact-us so a lead that prefers a form is still recorded.
 *   filter  -> dropped. All seven systems are listed; nothing to press.
 *   details -> dropped. Every FAQ answer renders open.
 *
 * Direction is handled in CSS (`unicode-bidi`) rather than `dir=`, since the
 * attribute does not survive.
 *
 * Copy comes from server/data/recLandings, so it stays single-sourced with the
 * coded pages and this can be regenerated after any copy edit.
 *
 * Usage:
 *   node tools/build-rec-custom-pages.js            # write payloads to disk
 *   node tools/build-rec-custom-pages.js --print    # also print a summary
 */

const fs = require("fs");
const path = require("path");

const { getRecLandings } = require("../server/data/recLandings");
const { sanitizePageHtml, sanitizeCssCode } = require("../server/routes/customPages");

const OUT_DIR = path.resolve(__dirname, "..", "content-src", "rec-custom-pages");

/** HTML-escape everything interpolated from the data modules. */
function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A wa.me deep link with the message pre-typed. */
function wa(page, text) {
  return `https://wa.me/${page.wa.number}?text=${encodeURIComponent(text)}`;
}

/** withEmphasis() parts -> escaped HTML with the figure in <strong>. */
function emph(body) {
  const before = esc(body.before);
  const after = esc(body.after);
  if (!body.em) return before;
  return `${before}<strong class="rec-em"><bdi>${esc(body.em)}</bdi></strong>${after}`;
}

function heroSection(page) {
  const cta = wa(page, page.primaryCta.waText);
  return `
<section class="rec-hero">
  <div class="rec-hero__veil"></div>
  <div class="rec-hero__inner">
    <p class="rec-badge">${esc(page.hero.badge)}</p>
    <h2 class="rec-hero__title">${esc(page.hero.h1)}</h2>
    <p class="rec-hero__lede">${esc(page.hero.lede)}</p>
    <p class="rec-actions">
      <a class="rec-cta" href="${cta}" target="_blank" rel="noopener noreferrer">${esc(page.primaryCta.label)}</a>
      <a class="rec-cta-alt" href="/contact-us">أو اترك بياناتك</a>
    </p>
    <dl class="rec-stats">
      ${page.hero.stats
        .map(
          (s) => `<div class="rec-stat">
        <dt class="rec-stat__v"><bdi>${esc(s.value)}</bdi></dt>
        <dd class="rec-stat__l">${esc(s.label)}</dd>
      </div>`
        )
        .join("\n      ")}
    </dl>
  </div>
</section>`;
}

function productsSection(page) {
  return `
<section class="rec-band rec-band--muted rec-products">
  <div class="rec-wrap">
    <p class="rec-kicker">${esc(page.productsSection.kicker)}</p>
    <h2 class="rec-h2">${esc(page.productsSection.title)}</h2>
    <ul class="rec-cards">
      ${page.products
        .map(
          (p) => `<li class="rec-card">
        <figure class="rec-card__media"><img src="${esc(p.image)}" alt="${esc(p.imageAlt)}" width="900" height="561" loading="lazy" /></figure>
        <div class="rec-card__body">
          <p class="rec-card__tag"><bdi>${esc(p.tag)}</bdi></p>
          <h3 class="rec-card__title">${esc(p.title)}</h3>
          <p class="rec-card__desc">${esc(p.desc)}</p>
          <ul class="rec-ticks">${p.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
        </div>
      </li>`
        )
        .join("\n      ")}
    </ul>
  </div>
</section>`;
}

function proofSection(page) {
  const quotes = (page.proof.testimonials || [])
    .map(
      (t) => `<li class="rec-quote">
        <p class="rec-quote__text">${esc(t.quote)}</p>
        <p class="rec-quote__who">${esc(t.person)}</p>
        <p class="rec-quote__role">${esc(t.role)}</p>
      </li>`
    )
    .join("\n      ");

  const logos = page.proof.logos
    .map(
      (l) =>
        `<li class="rec-logo"><img src="${esc(l.image)}" alt="${esc(l.name)}" width="300" height="300" loading="lazy" /></li>`
    )
    .join("\n      ");

  return `
<section class="rec-band rec-proof">
  <div class="rec-wrap">
    <p class="rec-kicker">${esc(page.proof.kicker)}</p>
    <h2 class="rec-h2">${esc(page.proof.title)}</h2>
    ${page.proof.lede ? `<p class="rec-lede">${esc(page.proof.lede)}</p>` : ""}
    ${quotes ? `<ul class="rec-quotes">\n      ${quotes}\n    </ul>` : ""}
    <ul class="rec-logos">
      ${logos}
    </ul>
  </div>
</section>`;
}

function journeySection(page) {
  return `
<section class="rec-band rec-journey">
  <div class="rec-wrap">
    <p class="rec-kicker">${esc(page.journey.kicker)}</p>
    <h2 class="rec-h2">${esc(page.journey.title)}</h2>
    <ul class="rec-steps">
      ${page.journey.steps
        .map(
          (s) => `<li class="rec-step">
        <p class="rec-step__n"><bdi>${esc(s.n)}</bdi></p>
        <h3 class="rec-step__t">${esc(s.title)}</h3>
        <p class="rec-step__b">${emph(s.body)}</p>
      </li>`
        )
        .join("\n      ")}
    </ul>
  </div>
</section>`;
}

function roiSection(page) {
  return `
<section class="rec-band rec-band--muted rec-roi">
  <div class="rec-wrap">
    <p class="rec-kicker">${esc(page.roi.kicker)}</p>
    <h2 class="rec-h2">${esc(page.roi.title)}</h2>
    <ul class="rec-tiles">
      ${page.roi.cards
        .map(
          (c) => `<li class="rec-tile">
        <h3 class="rec-tile__t">${esc(c.title)}</h3>
        <p class="rec-tile__b">${emph(c.body)}</p>
      </li>`
        )
        .join("\n      ")}
    </ul>
    <p class="rec-actions rec-actions--mid">
      <a class="rec-cta" href="${wa(page, page.primaryCta.waText)}" target="_blank" rel="noopener noreferrer">${esc(page.primaryCta.label)}</a>
    </p>
  </div>
</section>`;
}

function sustainSection(page) {
  return `
<section class="rec-band rec-band--navy rec-sustain">
  <div class="rec-wrap">
    <p class="rec-kicker rec-kicker--on-navy">${esc(page.sustainability.kicker)}</p>
    <h2 class="rec-h2">${esc(page.sustainability.title)}</h2>
    <ul class="rec-rows">
      ${page.sustainability.items
        .map(
          (i) => `<li class="rec-row">
        <h3 class="rec-row__t">${esc(i.title)}</h3>
        <p class="rec-row__b">${emph(i.body)}</p>
      </li>`
        )
        .join("\n      ")}
    </ul>
  </div>
</section>`;
}

function stackSection(page) {
  return `
<section class="rec-band rec-stack">
  <div class="rec-wrap">
    <p class="rec-kicker"><bdi>${esc(page.integration.kicker)}</bdi></p>
    <h2 class="rec-h2">${esc(page.integration.title)}</h2>
    <p class="rec-lede">${esc(page.integration.lede)}</p>
    <ul class="rec-layers">
      ${page.integration.layers
        .map(
          (l) => `<li class="rec-layer">
        <p class="rec-layer__n">${esc(l.name)}</p>
        <h3 class="rec-layer__t">${esc(l.title)}</h3>
        <p class="rec-layer__b">${esc(l.body)}</p>
        ${(l.bullets || []).length ? `<ul class="rec-ticks">${l.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
        ${
          (l.platforms || []).length
            ? `<ul class="rec-pills">${l.platforms.map((pl) => `<li><bdi>${esc(pl)}</bdi></li>`).join("")}</ul>`
            : ""
        }
      </li>`
        )
        .join("\n      ")}
    </ul>
  </div>
</section>`;
}

function faqSection(page) {
  return `
<section class="rec-band rec-band--muted rec-faq">
  <div class="rec-wrap">
    <h2 class="rec-h2">${esc(page.faq.title)}</h2>
    <dl class="rec-faq__list">
      ${page.faq.items
        .map((f) => `<dt class="rec-faq__q">${esc(f.q)}</dt>\n      <dd class="rec-faq__a">${esc(f.a)}</dd>`)
        .join("\n      ")}
    </dl>
  </div>
</section>`;
}

function closeSection(page) {
  return `
<section class="rec-band rec-band--navy rec-close">
  <div class="rec-wrap">
    <h2 class="rec-h2">${esc(page.quote.title)}</h2>
    <p class="rec-lede">${esc(page.quote.desc)}</p>
    <p class="rec-actions">
      <a class="rec-cta" href="${wa(page, page.primaryCta.waText)}" target="_blank" rel="noopener noreferrer">${esc(page.primaryCta.label)}</a>
      <a class="rec-cta-alt rec-cta-alt--on-navy" href="/contact-us">أو اترك بياناتك في نموذج التواصل</a>
    </p>
  </div>
</section>`;
}

const SECTIONS = {
  hero: heroSection,
  products: productsSection,
  proof: proofSection,
  journey: journeySection,
  roi: roiSection,
  sustainability: sustainSection,
  integration: stackSection,
  faq: faqSection,
  quote: closeSection,
};

function buildHtml(page) {
  return page.sections.map((key) => SECTIONS[key](page)).join("\n");
}

function buildCss(page) {
  const poster = page.hero.video.poster;
  return `
/* /rec/${page.slug} — generated by tools/build-rec-custom-pages.js. Do not hand-edit. */

/* The custom-page template wraps html_code in .subpage__panel, a padded white
   card inside .container. These pages are full-bleed, so the panel and the
   container's gutters are neutralised and each band breaks out to 100vw. */
.customPageBody {
  padding: 0 !important;
  border: 0 !important;
  background: none !important;
  box-shadow: none !important;
  max-width: none !important;
}
.subpage__head { display: none; }
.subpage > .container { width: 100% !important; max-width: none !important; padding: 0 !important; }
.subpage { padding-block: 0 !important; }

.customPageBody .rec-wrap {
  width: min(986px, 100% - 34px);
  margin-inline: auto;
}
.customPageBody .rec-band { padding-block: var(--s-7); }
.customPageBody .rec-band--muted { background: var(--surface-muted); }
.customPageBody .rec-band--navy { background: var(--navy); color: #fff; }
.customPageBody .rec-band--navy .rec-h2,
.customPageBody .rec-band--navy .rec-row__t { color: #fff; }
.customPageBody .rec-band--navy p { color: rgba(255, 255, 255, 0.86); }
.customPageBody .rec-band--navy .rec-em { color: var(--primary-2, #ffc285); }

/* Type is not multiplied by --font-scale: at 0.85 Arabic body copy lands at
   12.75px and the headings collapse into each other on a phone. */
.customPageBody .rec-h2 {
  margin: 0 0 var(--s-4);
  font-size: clamp(24px, 5.6vw, 36px);
  line-height: 1.4;
  color: var(--navy);
  text-wrap: balance;
}
.customPageBody h3 { font-size: clamp(19px, 4.4vw, 23px); line-height: 1.5; margin: 0 0 var(--s-2); }
.customPageBody .rec-band p,
.customPageBody .rec-band li { font-size: clamp(16px, 3.9vw, 17px); line-height: 1.9; }
.customPageBody .rec-lede { max-width: 26em; color: var(--muted); }

.customPageBody .rec-kicker {
  display: inline-block;
  margin: 0 0 var(--s-2);
  padding: var(--s-1) var(--s-3);
  border: 1px solid var(--primary-35);
  border-radius: var(--radius-pill);
  background: #fff6ec;
  color: var(--accent-text-deep);
  font-size: 13px;
  font-weight: 700;
}
.customPageBody .rec-kicker--on-navy {
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(255, 255, 255, 0.38);
  color: #fff;
}

/* ---- hero: the poster as the ground, under a warm veil ---- */
.customPageBody .rec-hero {
  position: relative;
  isolation: isolate;
  padding-block: var(--s-6) var(--s-7);
  background: #f2ece3 url("${poster}") center / cover no-repeat;
}
.customPageBody .rec-hero__veil {
  position: absolute;
  inset: 0;
  z-index: -1;
  background:
    radial-gradient(72% 60% at 12% 4%, rgba(255, 153, 51, 0.22), transparent 72%),
    linear-gradient(180deg, rgba(251,247,241,0.58) 0px, rgba(251,247,241,0.72) 18px, rgba(251,247,241,0.9) 40px, rgba(251,247,241,0.95) 150px, rgba(251,247,241,0.97) 100%);
}
.customPageBody .rec-hero__inner {
  position: relative;
  width: min(986px, 100% - 34px);
  margin-inline: auto;
  display: grid;
  gap: var(--s-4);
  justify-items: start;
}
.customPageBody .rec-hero__title {
  margin: 0;
  max-width: 30em;
  font-size: clamp(30px, 7.2vw, 52px);
  font-weight: 800;
  line-height: 1.35;
  color: var(--navy);
  text-wrap: balance;
}
.customPageBody .rec-hero__lede { margin: 0; max-width: 26em; color: var(--muted); font-size: clamp(17px, 4vw, 20px); }
.customPageBody .rec-badge {
  margin: 0;
  padding: var(--s-1) var(--s-3);
  border: 1px solid var(--primary-35);
  border-radius: var(--radius-pill);
  background: #fff6ec;
  color: var(--accent-text-deep);
  font-size: 14px;
  font-weight: 700;
}

/* ---- actions ---- */
.customPageBody .rec-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-4);
  margin: var(--s-2) 0 0;
  width: 100%;
}
.customPageBody .rec-cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 56px;
  flex: 1 1 100%;
  padding-inline: var(--s-6);
  border-radius: var(--radius-sm);
  background: linear-gradient(135deg, var(--primary), #f5811f);
  color: #fff;
  font-weight: 800;
  font-size: 17px;
  text-decoration: none;
}
.customPageBody .rec-cta-alt {
  min-height: 48px;
  display: inline-flex;
  align-items: center;
  color: var(--accent-text-deep);
  font-weight: 700;
}
.customPageBody .rec-cta-alt--on-navy { color: var(--primary-2, #ffc285); }
@media (min-width: 560px) {
  .customPageBody .rec-cta { flex: 0 0 auto; }
}

/* ---- stats: three across, always ---- */
.customPageBody .rec-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--s-2);
  margin: var(--s-2) 0 0;
  width: 100%;
}
.customPageBody .rec-stat {
  padding: var(--s-3) var(--s-1);
  border: 1px solid var(--primary-22);
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.92);
  text-align: center;
}
.customPageBody .rec-stat__v {
  font-size: clamp(26px, 8vw, 44px);
  font-weight: 800;
  line-height: 1.15;
  color: var(--accent-text);
  font-variant-numeric: tabular-nums;
  /* plaintext, not dir="ltr" — the attribute does not survive the sanitizer,
     and "5 دقائق" needs its own direction, not a forced LTR base. */
  unicode-bidi: plaintext;
}
.customPageBody .rec-stat__l { margin: 0; font-size: 13px; color: var(--muted); line-height: 1.5; }

/* ---- product cards: photo, scrim, type over it ---- */
.customPageBody .rec-cards,
.customPageBody .rec-quotes,
.customPageBody .rec-steps,
.customPageBody .rec-tiles,
.customPageBody .rec-rows,
.customPageBody .rec-layers,
.customPageBody .rec-logos,
.customPageBody .rec-ticks,
.customPageBody .rec-pills {
  list-style: none;
  margin: 0;
  padding: 0;
}
.customPageBody .rec-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--s-4);
  margin-top: var(--s-5);
}
.customPageBody .rec-card {
  display: flex;
  flex-direction: column;
  border-radius: var(--radius);
  background: #fff;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(0, 27, 44, 0.05), 0 10px 24px rgba(0, 27, 44, 0.07);
}
.customPageBody .rec-card__media { position: relative; margin: 0; aspect-ratio: 4 / 3; background: var(--navy-05); }
.customPageBody .rec-card__media img { width: 100%; height: 100%; object-fit: cover; display: block; }
.customPageBody .rec-card__body { padding: var(--s-4); display: grid; gap: var(--s-2); }
.customPageBody .rec-card__tag {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--accent-text-deep);
  unicode-bidi: isolate;
}
.customPageBody .rec-card__title { margin: 0; color: var(--navy); }
.customPageBody .rec-card__desc { margin: 0; color: var(--muted); font-size: 15px; }
.customPageBody .rec-ticks { display: grid; gap: var(--s-2); }
.customPageBody .rec-ticks li {
  position: relative;
  padding-inline-start: var(--s-5);
  font-size: 15px;
  color: var(--muted);
}
.customPageBody .rec-ticks li::before {
  content: "";
  position: absolute;
  inset-inline-start: 0;
  top: 0.65em;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--primary);
}

/* ---- proof ---- */
.customPageBody .rec-quotes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--s-4);
  margin-top: var(--s-5);
}
.customPageBody .rec-quote {
  padding: var(--s-5);
  border-inline-start: 4px solid var(--primary);
  border-start-end-radius: var(--radius);
  border-end-end-radius: var(--radius);
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 27, 44, 0.05), 0 10px 24px rgba(0, 27, 44, 0.07);
}
.customPageBody .rec-quote__text { margin: 0 0 var(--s-3); color: var(--ink); }
.customPageBody .rec-quote__text::before { content: "\\00AB\\2009"; }
.customPageBody .rec-quote__text::after { content: "\\2009\\00BB"; }
.customPageBody .rec-quote__who { margin: 0; font-weight: 700; color: var(--navy); font-size: 15px; }
.customPageBody .rec-quote__role { margin: 0; color: var(--muted); font-size: 15px; }

.customPageBody .rec-logos {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-4);
  margin-top: var(--s-6);
  padding-top: var(--s-5);
  border-top: 1px solid var(--navy-08);
}
/* 4.47% is the corner radius drawn in the supplied artwork: a 99.61-unit corner
   on a 2229.4-unit card, identical across all nineteen files. */
.customPageBody .rec-logo img { height: 112px; width: auto; border-radius: 4.47%; display: block; }
@media (min-width: 760px) {
  .customPageBody .rec-logo img { height: 143px; }
}

/* ---- journey: a rail with markers on it ---- */
.customPageBody .rec-steps { display: grid; gap: var(--s-5); margin-top: var(--s-5); }
.customPageBody .rec-step {
  position: relative;
  padding-inline-start: calc(58px * var(--font-scale));
}
.customPageBody .rec-step__n {
  position: absolute;
  inset-inline-start: 0;
  top: 0;
  margin: 0;
  display: grid;
  place-items: center;
  width: calc(38px * var(--font-scale));
  height: calc(38px * var(--font-scale));
  border-radius: 50%;
  background: var(--navy);
  box-shadow: 0 0 0 4px var(--primary-15);
  color: #fff;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.customPageBody .rec-step__t { color: var(--navy); }
.customPageBody .rec-step__b { margin: 0; color: var(--muted); max-width: 30em; }
@media (min-width: 560px) {
  .customPageBody .rec-steps { grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: var(--s-6); }
}
@media (min-width: 1024px) {
  .customPageBody .rec-steps { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}

/* ---- roi tiles: amber cap ---- */
.customPageBody .rec-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--s-4);
  margin-top: var(--s-5);
}
.customPageBody .rec-tile {
  padding: var(--s-5);
  border-top: 4px solid var(--primary);
  border-radius: 0 0 var(--radius) var(--radius);
  background: #fff;
}
.customPageBody .rec-tile__t { color: var(--navy); }
.customPageBody .rec-tile__b { margin: 0; color: var(--muted); }
.customPageBody .rec-em { color: var(--accent-text); font-variant-numeric: tabular-nums; }
.customPageBody .rec-actions--mid { margin-top: var(--s-6); }

/* ---- sustainability rows on navy ---- */
.customPageBody .rec-rows { display: grid; gap: var(--s-5); margin-top: var(--s-5); }
.customPageBody .rec-row { padding-top: var(--s-4); border-top: 1px solid rgba(255, 255, 255, 0.32); }
.customPageBody .rec-row__b { margin: 0; max-width: 30em; }
@media (min-width: 560px) {
  .customPageBody .rec-rows { grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: var(--s-6); }
}

/* ---- integration: an amber spine ---- */
.customPageBody .rec-layers { display: grid; gap: var(--s-5); margin-top: var(--s-5); }
.customPageBody .rec-layer { padding-inline-start: var(--s-4); border-inline-start: 4px solid var(--primary-35); }
.customPageBody .rec-layer__n { margin: 0; font-size: 15px; font-weight: 700; color: var(--accent-text-deep); }
.customPageBody .rec-layer__t { color: var(--navy); margin: var(--s-1) 0 var(--s-2); }
.customPageBody .rec-layer__b { margin: 0 0 var(--s-3); color: var(--muted); max-width: 30em; }
.customPageBody .rec-pills { display: flex; flex-wrap: wrap; gap: var(--s-2); margin-top: var(--s-3); }
.customPageBody .rec-pills li {
  padding: var(--s-1) var(--s-3);
  border-radius: var(--radius-pill);
  background: var(--navy-05);
  color: var(--navy);
  font-size: 13px;
  font-weight: 700;
  unicode-bidi: isolate;
}

/* ---- faq: every answer open, since <details> does not survive ---- */
.customPageBody .rec-faq__list { margin: var(--s-5) 0 0; }
.customPageBody .rec-faq__q {
  padding-top: var(--s-4);
  border-top: 1px solid var(--navy-12);
  font-weight: 800;
  font-size: clamp(17px, 4vw, 19px);
  color: var(--navy);
}
.customPageBody .rec-faq__a { margin: var(--s-2) 0 var(--s-4); color: var(--muted); max-width: 40em; }

.customPageBody .rec-close { border-bottom: 4px solid var(--primary); }
`;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const summary = [];

  for (const page of getRecLandings()) {
    const rawHtml = buildHtml(page);
    const html = sanitizePageHtml(rawHtml);
    const css = sanitizeCssCode(buildCss(page));

    // The sanitizer is the gate this build has to survive, so measure the loss
    // rather than trusting it: a large drop means a tag was silently discarded.
    const kept = ((html.length / rawHtml.length) * 100).toFixed(1);

    fs.writeFileSync(path.join(OUT_DIR, `${page.slug}.html`), html, "utf8");
    fs.writeFileSync(path.join(OUT_DIR, `${page.slug}.css`), css, "utf8");
    fs.writeFileSync(
      path.join(OUT_DIR, `${page.slug}.json`),
      JSON.stringify({ title: page.title, slug: page.slug, published: 1, unsafe_js: 0 }, null, 2),
      "utf8"
    );

    summary.push({ slug: page.slug, htmlBytes: html.length, cssBytes: css.length, keptPct: `${kept}%` });
  }

  console.table(summary);
  console.log(`\nWrote payloads to ${path.relative(process.cwd(), OUT_DIR)}`);
}

main();
