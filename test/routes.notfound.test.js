"use strict";

/**
 * Unknown URLs must 404 *and* tell crawlers not to index the 404 page.
 * A 404 that renders with the default `index, follow` robots meta gets the
 * error page into search results, which is exactly what happened to sites that
 * only ever asserted the status code.
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");

const { startServer } = require("./helpers/server");

const MISSING_PATHS = [
  "/definitely-not-a-page",
  "/blog/no-such-post",
  "/solutions/no-such-solution",
  "/industries/no-such-industry",
];

describe("missing routes 404 with a noindex robots meta", () => {
  let srv;

  before(async () => {
    srv = await startServer({ label: "notfound" });
  });

  after(async () => {
    await srv.stop();
  });

  for (const urlPath of MISSING_PATHS) {
    it(`GET ${urlPath} returns 404 and noindex`, async () => {
      const res = await srv.get(urlPath);
      assert.equal(res.status, 404, `expected 404 for ${urlPath}`);

      const body = await res.text();
      assert.match(
        body,
        /<meta\s+name="robots"\s+content="noindex,\s*nofollow"/i,
        `expected a noindex robots meta on the 404 page for ${urlPath}`
      );
    });
  }
});
