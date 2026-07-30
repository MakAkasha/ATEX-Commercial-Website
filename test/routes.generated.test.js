"use strict";

/**
 * The generated, machine-consumed endpoints: robots.txt, sitemap.xml, the blog
 * RSS feed, llms.txt, and the two health probes.
 *
 * None of these had any automated assertion before this file. They are all
 * string-built in server/app.js, so a typo in a template literal ships silently
 * — nothing renders them in a browser where a human would notice.
 *
 * Note: the harness DB is empty, so there are no published posts. Every
 * assertion below is therefore about the static/file-based parts of the output.
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");

const { startServer } = require("./helpers/server");
const { getSolutions, getIndustries } = require("../server/data/contentRegistry");

const SOLUTION_SLUGS = getSolutions().map((s) => s.slug);
const INDUSTRY_SLUGS = getIndustries().map((i) => i.slug);

// server/app.js builds exactly these seven static sitemap entries.
const STATIC_SITEMAP_PATHS = ["", "/solutions", "/products", "/contact-us", "/privacy", "/terms", "/blog"];

describe("generated endpoints", () => {
  let srv;

  before(async () => {
    srv = await startServer({ label: "generated" });
  });

  after(async () => {
    await srv.stop();
  });

  describe("GET /robots.txt", () => {
    it("returns 200 as text/plain", async () => {
      const res = await srv.get("/robots.txt");
      assert.equal(res.status, 200);
      assert.match(String(res.headers.get("content-type") || ""), /text\/plain/);
    });

    it("advertises the sitemap and blocks /admin", async () => {
      const body = await (await srv.get("/robots.txt")).text();
      assert.ok(body.includes("Sitemap:"), "robots.txt must advertise a Sitemap:");
      assert.ok(body.includes("Disallow: /admin"), "robots.txt must Disallow: /admin");
      assert.ok(body.includes(`Sitemap: ${srv.origin}/sitemap.xml`), "Sitemap: must be an absolute URL");
    });
  });

  describe("GET /sitemap.xml", () => {
    it("returns 200 as application/xml", async () => {
      const res = await srv.get("/sitemap.xml");
      assert.equal(res.status, 200);
      assert.match(String(res.headers.get("content-type") || ""), /application\/xml/);
    });

    it("is a well-formed urlset with one <loc> per expected URL", async () => {
      const body = await (await srv.get("/sitemap.xml")).text();
      assert.ok(body.startsWith('<?xml version="1.0"'), "must start with an XML declaration");
      assert.ok(body.includes("<urlset"), "must contain <urlset");
      assert.ok(body.includes("</urlset>"), "must close </urlset>");

      const locCount = (body.match(/<loc>/g) || []).length;
      const closingLocCount = (body.match(/<\/loc>/g) || []).length;
      assert.equal(locCount, closingLocCount, "every <loc> must be closed");

      // No published posts in the throwaway DB, so the expected total is the
      // static pages plus every file-based solution and industry.
      const expected = STATIC_SITEMAP_PATHS.length + SOLUTION_SLUGS.length + INDUSTRY_SLUGS.length;
      assert.equal(locCount, expected, `expected ${expected} <loc> entries`);
    });

    it("lists /blog, /solutions and every solution and industry slug", async () => {
      const body = await (await srv.get("/sitemap.xml")).text();
      assert.ok(body.includes(`<loc>${srv.origin}/blog</loc>`), "sitemap must list /blog");
      assert.ok(body.includes(`<loc>${srv.origin}/solutions</loc>`), "sitemap must list /solutions");

      for (const slug of SOLUTION_SLUGS) {
        assert.ok(
          body.includes(`<loc>${srv.origin}/solutions/${slug}</loc>`),
          `sitemap missing solution slug: ${slug}`
        );
      }
      for (const slug of INDUSTRY_SLUGS) {
        assert.ok(
          body.includes(`<loc>${srv.origin}/industries/${slug}</loc>`),
          `sitemap missing industry slug: ${slug}`
        );
      }
    });
  });

  describe("GET /blog/rss.xml", () => {
    it("returns 200 as application/rss+xml", async () => {
      const res = await srv.get("/blog/rss.xml");
      assert.equal(res.status, 200);
      assert.match(String(res.headers.get("content-type") || ""), /application\/rss\+xml/);
    });

    it("is an RSS 2.0 channel with a self-referencing atom:link", async () => {
      const body = await (await srv.get("/blog/rss.xml")).text();
      assert.ok(body.includes("<rss"), "must contain <rss");
      assert.ok(body.includes('version="2.0"'), "must declare RSS 2.0");
      assert.ok(body.includes("<channel>"), "must contain <channel>");
      assert.ok(body.includes("</channel>"), "must close </channel>");
      assert.ok(body.includes("<atom:link"), "must contain <atom:link");
      assert.ok(
        body.includes(`href="${srv.origin}/blog/rss.xml"`),
        "the atom:link must point back at the feed URL"
      );
    });
  });

  describe("GET /llms.txt", () => {
    it("returns 200 as text/plain and starts with the ATEX heading", async () => {
      const res = await srv.get("/llms.txt");
      assert.equal(res.status, 200);
      assert.match(String(res.headers.get("content-type") || ""), /text\/plain/);

      const body = await res.text();
      assert.ok(body.includes("# ATEX"), "llms.txt must contain the '# ATEX' heading");
    });
  });

  describe("health probes", () => {
    it("GET /healthz returns 200 { ok: true }", async () => {
      const res = await srv.get("/healthz");
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true });
    });

    it("GET /readyz returns 200 with db: true", async () => {
      const res = await srv.get("/readyz");
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.db, true);
    });
  });
});
