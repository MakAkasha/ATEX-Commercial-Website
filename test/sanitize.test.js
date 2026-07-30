"use strict";

/**
 * Pure-function tests for the two sanitizers. No server, no database.
 *
 * DB_PATH is pointed at a throwaway temp path before requiring the route modules
 * purely as belt-and-braces: server/db.js reads DB_PATH at module load, and
 * although it opens nothing until getDb() is called, nothing in this file should
 * ever be one refactor away from touching the real database.
 */

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { makeTempDbPath } = require("./helpers/server");

process.env.DB_PATH = makeTempDbPath("sanitize");

const { sanitizePostHtml } = require("../server/routes/posts");
const { sanitizeCssCode } = require("../server/routes/customPages");

describe("sanitizePostHtml", () => {
  it("strips <script> tags and their contents", () => {
    const out = sanitizePostHtml('<p>مرحبا</p><script>alert("xss")</script>');
    assert.ok(!/<script/i.test(out), `script tag survived: ${out}`);
    assert.ok(!out.includes("alert("), `script body survived: ${out}`);
    assert.ok(out.includes("مرحبا"), "legitimate text was dropped");
  });

  it("strips inline event handlers such as onerror=", () => {
    const out = sanitizePostHtml('<img src="/assets/x.webp" onerror="alert(1)">');
    assert.ok(!/onerror/i.test(out), `onerror survived: ${out}`);
  });

  it("strips javascript: hrefs", () => {
    const out = sanitizePostHtml('<a href="javascript:alert(1)">click</a>');
    assert.ok(!/javascript:/i.test(out), `javascript: scheme survived: ${out}`);
  });

  it("keeps <img src>, <h2> and <strong>", () => {
    const out = sanitizePostHtml(
      '<h2>عنوان</h2><p><strong>مهم</strong></p><img src="/assets/products/items/ix-41.webp" alt="ix-41">'
    );
    assert.ok(out.includes("<h2>"), `h2 was dropped: ${out}`);
    assert.ok(out.includes("<strong>"), `strong was dropped: ${out}`);
    assert.ok(out.includes('src="/assets/products/items/ix-41.webp"'), `img src was dropped: ${out}`);
  });

  it("keeps https hrefs", () => {
    const out = sanitizePostHtml('<a href="https://atex.sa">أتكس</a>');
    assert.ok(out.includes('href="https://atex.sa"'), `https href was dropped: ${out}`);
  });
});

describe("sanitizeCssCode", () => {
  it("strips a closing </style tag (style-block breakout)", () => {
    const out = sanitizeCssCode("body{color:red}</style><script>alert(1)</script>");
    assert.ok(!/<\/style/i.test(out), `</style survived: ${out}`);
    assert.ok(!/<script/i.test(out), `<script survived: ${out}`);
  });

  it("strips @import (SSRF / exfiltration vector)", () => {
    const out = sanitizeCssCode('@import url("https://evil.example/x.css");');
    assert.ok(!/@import/i.test(out), `@import survived: ${out}`);
  });

  it("strips expression( (legacy IE CSS XSS)", () => {
    const out = sanitizeCssCode("width: expression(alert(1));");
    assert.ok(!/expression\s*\(/i.test(out), `expression( survived: ${out}`);
  });

  it("strips javascript: URIs", () => {
    const out = sanitizeCssCode("background: url(javascript:alert(1));");
    assert.ok(!/javascript\s*:/i.test(out), `javascript: survived: ${out}`);
  });

  it("leaves benign CSS untouched", () => {
    const css = ".card { color: #123456; margin-inline-start: 1rem; }";
    assert.equal(sanitizeCssCode(css), css);
  });
});
