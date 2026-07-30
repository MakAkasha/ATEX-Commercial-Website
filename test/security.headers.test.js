"use strict";

/**
 * Security response headers, plus a CSP regression gate.
 *
 * The gate is the important half. `assert.deepEqual` against the snapshot below
 * means ANY change to the CSP allow-list — adding a CDN, a tracker, an iframe
 * host — fails this test. Tightening the policy also fails it, which is correct:
 * the snapshot is the reviewed record of what the site is allowed to load, so
 * every change to it should be a deliberate, visible line in a diff.
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");

const { startServer } = require("./helpers/server");
const { getConfig } = require("../server/config");

/**
 * Reviewed CSP allow-list as of this commit. Order matters (deepEqual on arrays).
 * To change it: change server/config.js AND this snapshot in the same commit,
 * and justify the new source in the commit message.
 */
const EXPECTED_CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  baseUri: ["'self'"],
  objectSrc: ["'none'"],
  frameAncestors: ["'self'"],
  imgSrc: ["'self'", "data:", "blob:", "https:"],
  // fontSrc dropped "https://fonts.gstatic.com" and styleSrc dropped
  // "https://fonts.googleapis.com" when Cairo and Tajawal moved from the Google
  // Fonts CDN to /assets/fonts. No template served by this app references either
  // origin any more (fonts.selfhosted.test.js is the guard that keeps it that
  // way). cdnjs stays for Font Awesome and jsdelivr for Tabler — both are still
  // CSS + webfonts. This is a tightening, never a widening.
  fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
  styleSrc: [
    "'self'",
    "'unsafe-inline'",
    "https://cdnjs.cloudflare.com",
    "https://cdn.jsdelivr.net",
  ],
  // scriptSrc dropped "https://cdnjs.cloudflare.com" when the admin TinyMCE
  // script moved from the CDN to the self-hosted /vendor/tinymce mount. cdnjs
  // remains in fontSrc/styleSrc for Font Awesome, which is CSS + webfonts only.
  // This is a tightening, never a widening.
  scriptSrc: [
    "'self'",
    "'unsafe-inline'",
    "https://cdn.jsdelivr.net",
    "https://www.googletagmanager.com",
    "https://www.google-analytics.com",
    "https://tracker.metricool.com",
    "https://analytics.tiktok.com",
  ],
  scriptSrcAttr: ["'unsafe-inline'"],
  connectSrc: [
    "'self'",
    "https://www.googletagmanager.com",
    "https://www.google-analytics.com",
    "https://tracker.metricool.com",
    "https://analytics.tiktok.com",
  ],
  frameSrc: [
    "'self'",
    "https://www.youtube-nocookie.com",
    "https://www.youtube.com",
    "https://www.google.com",
  ],
  mediaSrc: ["'self'", "https:", "blob:"],
};

describe("security headers", () => {
  let srv;
  let headers;

  before(async () => {
    srv = await startServer({ label: "headers" });
    const res = await srv.get("/");
    assert.equal(res.status, 200);
    headers = res.headers;
    await res.text();
  });

  after(async () => {
    await srv.stop();
  });

  it("sets a Content-Security-Policy", () => {
    assert.ok(headers.get("content-security-policy"), "missing content-security-policy header");
  });

  it("sets x-content-type-options: nosniff", () => {
    assert.equal(String(headers.get("x-content-type-options") || "").toLowerCase(), "nosniff");
  });

  it("blocks framing via x-frame-options or CSP frame-ancestors", () => {
    const xfo = headers.get("x-frame-options");
    const csp = String(headers.get("content-security-policy") || "");
    assert.ok(
      xfo || csp.includes("frame-ancestors"),
      "neither x-frame-options nor a CSP frame-ancestors directive is set"
    );
  });

  it("sets a Referrer-Policy", () => {
    assert.ok(headers.get("referrer-policy"), "missing referrer-policy header");
  });

  it("does not leak x-powered-by", () => {
    assert.equal(headers.get("x-powered-by"), null, "x-powered-by must be disabled");
  });

  it("the served CSP contains default-src 'self' and object-src 'none'", () => {
    const csp = String(headers.get("content-security-policy") || "");
    assert.ok(csp.includes("default-src 'self'"), `default-src 'self' missing from: ${csp}`);
    assert.ok(csp.includes("object-src 'none'"), `object-src 'none' missing from: ${csp}`);
  });

  it("CSP REGRESSION GATE: getConfig().cspDirectives matches the reviewed snapshot", () => {
    // Fails on any added source (the case we care about), any removed source,
    // and any new/removed directive. See the comment above the snapshot.
    assert.deepEqual(getConfig().cspDirectives, EXPECTED_CSP_DIRECTIVES);
  });

  it("CSP REGRESSION GATE: no directive silently allows everything", () => {
    const directives = getConfig().cspDirectives;
    for (const [name, sources] of Object.entries(directives)) {
      assert.ok(
        !sources.includes("*"),
        `${name} contains a bare "*" wildcard — the CSP may only be tightened`
      );
      assert.ok(
        !sources.includes("'unsafe-eval'"),
        `${name} allows 'unsafe-eval' — the CSP may only be tightened`
      );
      assert.ok(
        !sources.includes("http:"),
        `${name} allows plaintext http: — the CSP may only be tightened`
      );
    }
  });
});
