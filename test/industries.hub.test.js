"use strict";

/**
 * /industries is the sector hub. Before it existed, the sector pages'
 * "back to sectors" button and the 404 page's quick link pointed at the
 * homepage anchor /#industries, and the sector breadcrumb skipped a level.
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");

const { startServer } = require("./helpers/server");
const { getIndustries } = require("../server/data/contentRegistry");

const INDUSTRIES = getIndustries();

describe("sector hub /industries", () => {
  let srv;

  before(async () => {
    srv = await startServer({ label: "industries-hub" });
  });

  after(async () => {
    await srv.stop();
  });

  it("renders with a descriptive title and links every sector page", async () => {
    const res = await srv.get("/industries");
    assert.equal(res.status, 200);
    const body = await res.text();

    const title = (body.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
    assert.ok(title.includes("أتكس"), `title should carry the brand: ${title}`);
    assert.ok(!title.startsWith("أتكس |"), `title should lead with the topic, not the brand: ${title}`);

    for (const industry of INDUSTRIES) {
      assert.ok(body.includes(`href="/industries/${industry.slug}"`), `hub missing link to ${industry.slug}`);
    }
    assert.ok(
      body.includes('"@type":"BreadcrumbList"') || body.includes('"@type": "BreadcrumbList"'),
      "hub needs breadcrumb schema"
    );
    // Only the homepage defers card photos; the hub keeps them inline.
    assert.match(body, /--industry-bg:url\(/, "hub cards should inline their photo");
    assert.ok(!body.includes("data-bg-src="), "hub should not defer card photos");
  });

  it("sector pages link back to the hub in the breadcrumb and back button", async () => {
    const body = await (await srv.get(`/industries/${INDUSTRIES[0].slug}`)).text();
    const crumbs = (body.match(/<nav class="breadcrumbs"[\s\S]*?<\/nav>/) || [])[0] || "";
    assert.ok(crumbs.includes('href="/industries"'), "breadcrumb must include the hub");
    assert.ok(!body.includes('href="/#industries"'), "no link should point at the old homepage anchor");
  });

  it("sector pages use their written SEO title", async () => {
    const withTitles = INDUSTRIES.filter((i) => i.metaTitle);
    assert.ok(withTitles.length > 0, "no sector has a metaTitle — data changed shape?");
    const decode = (s) =>
      s
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
    for (const industry of withTitles) {
      const body = await (await srv.get(`/industries/${industry.slug}`)).text();
      const title = (body.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
      assert.equal(decode(title.trim()), industry.metaTitle, `wrong title on ${industry.slug}`);
    }
  });

  it("the 404 page's sector link points at the hub", async () => {
    const res = await srv.get("/this-page-does-not-exist");
    assert.equal(res.status, 404);
    const body = await res.text();
    assert.ok(body.includes('href="/industries"'), "404 quick link should open the hub");
    assert.ok(!body.includes('href="/#industries"'), "404 should not use the homepage anchor");
  });
});
