"use strict";

/**
 * ATEX's published numbers (confirmed by the owner 2026-11-22):
 *   - Sales: 0509330008
 *   - Support and customer care: 0579880885
 *
 * The old customer-service number 0580102121 was retired. These tests keep it
 * from coming back through any template, default or schema, and check that a
 * number stored in local format ("05…") still produces a valid wa.me link.
 */

const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { describe, it } = require("node:test");

const ejs = require("ejs");

const ROOT = path.join(__dirname, "..");
const RETIRED = /0?580102121|58 010 2121/;
const SCANNED_DIRS = ["views", "server", "assets/js", "admin"];
const SCANNED_EXT = new Set([".ejs", ".js", ".html", ".json"]);

function listFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else if (SCANNED_EXT.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

function renderTopbar(content) {
  const source = fs.readFileSync(path.join(ROOT, "views", "partials", "site-header.ejs"), "utf8");
  const end = source.indexOf("<!-- Navbar -->");
  return ejs.render(source.slice(0, end), { content });
}

describe("contact numbers", () => {
  it("the retired customer-service number appears in no shipped source file", () => {
    const hits = SCANNED_DIRS.flatMap((d) => listFiles(path.join(ROOT, d)))
      .filter((f) => RETIRED.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(ROOT, f));
    assert.deepEqual(hits, []);
  });

  it("the topbar defaults to the support number and a 966-prefixed WhatsApp link", () => {
    const html = renderTopbar(null);
    assert.match(html, /0579880885/);
    assert.match(html, /https:\/\/wa\.me\/966579880885/);
    assert.match(html, /tel:0509330008/);
  });

  it("a stored local-format number still builds a valid wa.me link", () => {
    const html = renderTopbar({ topbar: { phone: "0511111111" } });
    assert.match(html, /https:\/\/wa\.me\/966511111111"/);
  });
});
