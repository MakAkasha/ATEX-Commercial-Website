"use strict";

/**
 * The /rec campaign landing pages.
 *
 * These two URLs are printed on brochures and QR codes already in the field, so
 * the cost of breaking them is not a 404 in a log — it is physical material
 * pointing at nothing, which is exactly what happened once already when the
 * site was rebuilt. Hence the coverage here leans on the two failure modes that
 * would be invisible in a browser check:
 *
 *   the canonical must not absorb the ?utm_* a QR code appends, or every scan
 *   mints a distinct canonical URL and the page fragments in the index; and
 *
 *   the hardcoded routes must not have swallowed the admin-managed
 *   /rec/:slug custom-pages route that lives behind them.
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");

const { startServer } = require("./helpers/server");
const { getRecLandings } = require("../server/data/contentRegistry");

const LANDINGS = getRecLandings();

describe("/rec campaign landing pages", () => {
  let srv;

  before(async () => {
    srv = await startServer({ label: "rec" });
  });

  after(async () => {
    await srv.stop();
  });

  for (const page of LANDINGS) {
    const path = `/rec/${page.slug}`;

    it(`GET ${path} renders as Arabic RTL HTML`, async () => {
      const res = await srv.get(path);
      assert.equal(res.status, 200);
      assert.match(String(res.headers.get("content-type") || ""), /text\/html/);

      const body = await res.text();
      assert.ok(body.includes('lang="ar"'), "expected lang=ar");
      assert.ok(body.includes('dir="rtl"'), "expected dir=rtl");

      // The H1 is not a single text node: hero.ejs wraps `h1Highlight` in a
      // <span> so the promise word can carry the brand colour. Compare the
      // element's text, tags stripped and whitespace collapsed.
      const h1 = /<h1[^>]*class="recHero__title"[^>]*>([\s\S]*?)<\/h1>/.exec(body);
      assert.ok(h1, "expected the hero H1 element");
      const h1Text = h1[1]
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
      assert.equal(h1Text, page.hero.h1, "expected the hero H1 copy");
      assert.ok(
        body.includes(`<span class="recHero__mark">${page.hero.h1Highlight}</span>`),
        "expected the highlighted promise word to be marked up"
      );
    });

    it(`GET ${path} is indexable`, async () => {
      const body = await (await srv.get(path)).text();
      const robots = /<meta name="robots" content="([^"]*)"/.exec(body);
      assert.ok(robots, "expected a robots meta tag");
      assert.doesNotMatch(robots[1], /noindex/, "campaign pages must stay indexable");
    });

    it(`GET ${path} keeps the canonical free of the QR tracking query`, async () => {
      const res = await srv.get(`${path}?utm_source=qr&utm_campaign=brochure`);
      assert.equal(res.status, 200);
      const body = await res.text();

      const canonical = /<link rel="canonical" href="([^"]+)"/.exec(body);
      assert.ok(canonical, "expected a canonical link");
      assert.ok(canonical[1].endsWith(path), `canonical should end with ${path}, got ${canonical[1]}`);
      assert.ok(!canonical[1].includes("utm_"), "canonical must not carry the tracking query");
    });

    it(`GET ${path} emits breadcrumb, service and FAQ structured data`, async () => {
      const body = await (await srv.get(path)).text();
      const block = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(body);
      assert.ok(block, "expected a JSON-LD block");

      const data = JSON.parse(block[1]);
      const types = data["@graph"].map((node) => node["@type"]);
      assert.deepEqual(types, ["BreadcrumbList", "WebPage", "Service", "FAQPage"]);

      const faq = data["@graph"].find((node) => node["@type"] === "FAQPage");
      assert.equal(faq.mainEntity.length, page.faq.items.length);
    });

    it(`GET ${path} offers the WhatsApp path and the quote form`, async () => {
      const body = await (await srv.get(path)).text();
      assert.ok(body.includes(`https://wa.me/${page.wa.number}`), "expected the sales WhatsApp link");
      assert.ok(body.includes('id="recQuoteForm"'), "expected the quote form");
      // Not "contactForm": initContactForm() in assets/js/main.js binds that id
      // on every page and would double-handle the submit.
      assert.ok(!body.includes('id="contactForm"'), "the quote form must not reuse the site contact form id");
    });
  }

  it("renders each audience's own call to action", async () => {
    for (const page of LANDINGS) {
      const body = await (await srv.get(`/rec/${page.slug}`)).text();
      assert.ok(body.includes(page.primaryCta.label), `expected ${page.slug} CTA copy`);
    }
  });

  it("still falls through to the custom-pages 404 for an unknown /rec slug", async () => {
    const res = await srv.get("/rec/definitely-not-a-landing-page");
    assert.equal(res.status, 404);
    const body = await res.text();
    assert.match(body, /noindex, nofollow/, "the CMS 404 should stay noindex");
  });

  it("lists both landing pages in the sitemap", async () => {
    const body = await (await srv.get("/sitemap.xml")).text();
    for (const page of LANDINGS) {
      assert.ok(body.includes(`/rec/${page.slug}</loc>`), `expected /rec/${page.slug} in the sitemap`);
    }
  });

  it("leaves the near-miss /solutions/smart-home page alone", async () => {
    const res = await srv.get("/solutions/smart-home");
    assert.equal(res.status, 200);
  });

  it("links into each landing page from an existing indexed page", async () => {
    // These two links are the pages' only crawlable inbound path — they carry
    // no nav entry, and a sitemap entry alone leaves a page orphaned.
    const solution = await (await srv.get("/solutions/smart-home")).text();
    assert.ok(solution.includes('href="/rec/smart-home"'), "expected an inbound link from the solution page");

    const industry = await (await srv.get("/industries/residential")).text();
    assert.ok(
      industry.includes('href="/rec/smart-villa"'),
      "expected an inbound link from the industry page"
    );
  });
});
