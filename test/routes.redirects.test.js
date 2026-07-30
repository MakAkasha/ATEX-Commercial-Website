"use strict";

/**
 * Blog slug 301s. CRITICAL and previously unguarded.
 *
 * Four posts were published with machine-generated slugs and later renamed.
 * server/data/blogRedirects.js keeps the old URLs alive. If that map, or the
 * redirect branch at the top of `router.get("/blog/:slug")`, is ever refactored
 * away, the only visible symptom is a slow loss of search traffic — nothing
 * fails, nothing logs. These tests are the tripwire.
 *
 * The map is read from the source module, so adding a redirect automatically
 * adds test coverage for it.
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");

const { startServer } = require("./helpers/server");
const { RAW_REDIRECTS, REDIRECT_MAP } = require("../server/data/blogRedirects");

const PAIRS = Object.entries(RAW_REDIRECTS);

describe("blog slug redirects", () => {
  let srv;

  before(async () => {
    srv = await startServer({ label: "redirects" });
  });

  after(async () => {
    await srv.stop();
  });

  it("the redirect map is non-empty (guards against a silent config wipe)", () => {
    assert.ok(PAIRS.length > 0, "server/data/blogRedirects.js declares no redirects");
    assert.equal(REDIRECT_MAP.size, PAIRS.length, "some redirects were dropped by the loop guard");
  });

  for (const [oldSlug, newSlug] of PAIRS) {
    it(`GET /blog/${oldSlug} -> 301 /blog/${newSlug}`, async () => {
      const res = await srv.get(`/blog/${oldSlug}`, { redirect: "manual" });
      assert.equal(res.status, 301, `expected a permanent 301 for /blog/${oldSlug}`);
      const location = String(res.headers.get("location") || "");
      assert.ok(
        location.endsWith(`/blog/${newSlug}`),
        `expected location to end with /blog/${newSlug}, got "${location}"`
      );
    });

    it(`GET /blog/${oldSlug.toLowerCase()} (lowercase) also 301s to /blog/${newSlug}`, async () => {
      const res = await srv.get(`/blog/${oldSlug.toLowerCase()}`, { redirect: "manual" });
      assert.equal(res.status, 301, `expected a 301 for the lowercase variant of ${oldSlug}`);
      const location = String(res.headers.get("location") || "");
      assert.ok(
        location.endsWith(`/blog/${newSlug}`),
        `expected location to end with /blog/${newSlug}, got "${location}"`
      );
    });

    it(`GET /blog/${oldSlug}?utm_source=x preserves the query string`, async () => {
      const res = await srv.get(`/blog/${oldSlug}?utm_source=x&utm_medium=y`, { redirect: "manual" });
      assert.equal(res.status, 301);
      const location = String(res.headers.get("location") || "");
      assert.ok(location.includes("utm_source=x"), `query string dropped: "${location}"`);
      assert.ok(location.includes("utm_medium=y"), `query string truncated: "${location}"`);
      assert.ok(
        location.startsWith(`/blog/${newSlug}?`),
        `expected /blog/${newSlug}?<query>, got "${location}"`
      );
    });

    it(`the target /blog/${newSlug} does not itself redirect (no loops)`, async () => {
      const res = await srv.get(`/blog/${newSlug}`, { redirect: "manual" });
      assert.ok(
        res.status < 300 || res.status >= 400,
        `redirect target /blog/${newSlug} returned ${res.status} — that is a redirect chain or loop`
      );
      // The harness DB has no posts, so 404 here is expected and fine. What
      // matters is that the target is never itself a redirect source.
    });
  }
});
