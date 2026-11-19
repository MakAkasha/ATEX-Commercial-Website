"use strict";

/**
 * The homepage's solution and sector cards draw their photo through a CSS
 * custom property on ::before. Server-rendered inline, that made the browser
 * download all of them (~750 KB) on arrival, wherever they sat on the page.
 * On the homepage the URL is handed to main.js instead, which sets the
 * property once the grid nears the viewport. Other pages keep it inline.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it, before, after } = require("node:test");

const { startServer } = require("./helpers/server");

describe("homepage card photos load near the viewport", () => {
  let srv;

  before(async () => {
    srv = await startServer({ label: "home-lazy-cards" });
  });

  after(async () => {
    await srv.stop();
  });

  it("homepage cards carry no inline photo URL, only a deferred one", async () => {
    const body = await (await srv.get("/")).text();
    assert.ok(!/--(solution|industry)-bg:url\(/.test(body), "homepage must not inline card photo URLs");
    const deferred = body.match(/data-bg-src="[^"]+"/g) || [];
    assert.ok(deferred.length >= 10, `expected deferred card photos, found ${deferred.length}`);
    assert.ok(body.includes('data-bg-var="--solution-bg"'), "solution cards must name their property");
    assert.ok(body.includes('data-bg-var="--industry-bg"'), "sector cards must name their property");

    // Without JS, a <noscript> rule per card restores the photo.
    const fallback = (body.match(/<noscript><style>[\s\S]*?<\/style><\/noscript>/g) || []).join("");
    for (const src of deferred.map((d) => d.slice('data-bg-src="'.length, -1))) {
      assert.ok(fallback.includes(`[data-bg-src="${src}"]`), `no no-JS fallback for ${src}`);
    }
  });

  it("other pages still inline the photo", async () => {
    const body = await (await srv.get("/solutions")).text();
    assert.ok(/--solution-bg:url\(/.test(body), "/solutions cards should keep the inline photo");
    assert.ok(!body.includes("data-bg-src="), "/solutions should not defer");
  });

  // Wiring check only: the scroll behaviour itself (0 photos at load, all after
  // scrolling to each grid) was verified in headless Chrome, not here.
  it("main.js defines and boots the deferred-photo loader", () => {
    const js = fs.readFileSync(path.join(__dirname, "..", "assets", "js", "main.js"), "utf8");
    assert.match(js, /function initLazyCardBackgrounds\(/);
    assert.match(js, /initLazyCardBackgrounds\(\);/);
  });
});
