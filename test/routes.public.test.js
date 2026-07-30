"use strict";

/**
 * Every public page renders. This is the broadest cheap guard in the suite: a
 * bad EJS partial, a missing view local, or a renamed data field shows up here
 * as a 500 instead of reaching production.
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");

const { startServer } = require("./helpers/server");
const { getSolutions, getIndustries } = require("../server/data/contentRegistry");

const STATIC_PAGES = ["/", "/solutions", "/products", "/blog", "/contact-us", "/privacy", "/terms"];

const SOLUTION_PAGES = getSolutions().map((s) => `/solutions/${s.slug}`);
const INDUSTRY_PAGES = getIndustries().map((i) => `/industries/${i.slug}`);

describe("public routes render as Arabic RTL HTML", () => {
  let srv;

  before(async () => {
    srv = await startServer({ label: "public" });
  });

  after(async () => {
    await srv.stop();
  });

  const allPages = [...STATIC_PAGES, ...SOLUTION_PAGES, ...INDUSTRY_PAGES];

  for (const page of allPages) {
    it(`GET ${page} returns 200 HTML with lang="ar" dir="rtl"`, async () => {
      const res = await srv.get(page);
      assert.equal(res.status, 200, `expected 200 for ${page}`);
      assert.match(
        String(res.headers.get("content-type") || ""),
        /text\/html/,
        `expected an HTML content-type for ${page}`
      );

      const body = await res.text();
      assert.ok(body.includes("<html"), `expected an <html tag in ${page}`);
      assert.ok(body.includes('lang="ar"'), `expected lang="ar" in ${page}`);
      assert.ok(body.includes('dir="rtl"'), `expected dir="rtl" in ${page}`);
    });
  }

  it("covers every solution slug in server/data/solutions.js", () => {
    assert.ok(SOLUTION_PAGES.length > 0, "no solution slugs found — data module changed shape?");
    assert.equal(SOLUTION_PAGES.length, getSolutions().length);
  });

  it("covers every industry slug in server/data/industries.js", () => {
    assert.ok(INDUSTRY_PAGES.length > 0, "no industry slugs found — data module changed shape?");
    assert.equal(INDUSTRY_PAGES.length, getIndustries().length);
  });
});
