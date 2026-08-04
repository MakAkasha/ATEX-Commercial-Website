"use strict";

/**
 * The HTML-passthrough path of tools/import-blog-seeds.js, run against the real
 * seed files.
 *
 * Why this exists: the two long-form articles ship as final HTML, not markdown.
 * `looksLikeHtmlBody` is the only thing standing between them and
 * `markdownToHtml`, which wraps every line in a stray `<p>` — `<div …>` becomes
 * `<p><div …></p>` and a 40 KB article is silently destroyed. Nothing else in
 * the suite would notice, so the guard is pinned here against the actual files.
 *
 * The same test doubles as a sanitizer-allowlist guard: it runs the seed bodies
 * through sanitizePostHtml and requires `<section>`, `<span>` and every in-body
 * `id` to survive. Dropping any of them from the allowlist in
 * server/routes/posts.js would strip the article's FAQ block, its inline markup
 * and every anchor the table of contents links to.
 *
 * DB_PATH is pointed at a throwaway temp path for the same belt-and-braces
 * reason as test/sanitize.test.js — requiring the route module must never be one
 * refactor away from touching the real database.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const { makeTempDbPath, REPO_ROOT } = require("./helpers/server");

process.env.DB_PATH = makeTempDbPath("blogseed");

const { sanitizePostHtml } = require("../server/routes/posts");
const { bodyToHtml, looksLikeHtmlBody, parseFrontmatter } = require("../tools/import-blog-seeds");

const SEED_DIR = path.join(REPO_ROOT, "content-src", "blog-seed");

/**
 * The seed files that ship as final HTML. `idCount` is the number of `id`
 * attributes the file currently carries; editing an article's anchors is a
 * legitimate reason for this to change, and the assertion says so when it fails.
 */
const HTML_SEEDS = [
  { file: "blog_post_no4.md", idCount: 19 },
  { file: "blog_post_no5.md", idCount: 46 },
];

const idsIn = (html) => (html.match(/\sid="[^"]*"/g) || []).map((s) => s.slice(5, -1));

function readSeedBody(file) {
  return parseFrontmatter(fs.readFileSync(path.join(SEED_DIR, file), "utf8")).body;
}

describe("looksLikeHtmlBody", () => {
  it("accepts a body opening with a block element", () => {
    assert.equal(looksLikeHtmlBody('<div class="artTldr">x</div>'), true);
  });

  it("accepts a body opening with an inline element", () => {
    // A fixed block-element list used to reject these and destroy the article.
    assert.equal(looksLikeHtmlBody("<span>مقدمة</span>"), true);
    assert.equal(looksLikeHtmlBody("<strong>مقدمة</strong>"), true);
  });

  it("accepts a body opening with an HTML comment", () => {
    assert.equal(looksLikeHtmlBody("<!-- section 1 -->\n<p>مقدمة</p>"), true);
  });

  it("skips leading blank lines before deciding", () => {
    assert.equal(looksLikeHtmlBody("\n\n   \n<p>مقدمة</p>"), true);
  });

  it("rejects markdown so it still goes through the converter", () => {
    assert.equal(looksLikeHtmlBody("# عنوان\n\nفقرة."), false);
    assert.equal(looksLikeHtmlBody("![alt](/x.jpg)"), false);
    assert.equal(looksLikeHtmlBody("نص عادي يبدأ بكلمة."), false);
    assert.equal(looksLikeHtmlBody("- عنصر\n- عنصر"), false);
  });

  it("rejects an empty body", () => {
    assert.equal(looksLikeHtmlBody(""), false);
    assert.equal(looksLikeHtmlBody(null), false);
  });
});

describe("HTML blog seeds survive import and sanitizing", () => {
  for (const { file, idCount } of HTML_SEEDS) {
    describe(file, () => {
      const body = readSeedBody(file);
      const imported = bodyToHtml(body);
      const stored = sanitizePostHtml(imported);

      it("is passed through the importer untouched", () => {
        assert.equal(looksLikeHtmlBody(body), true, "guard rejected a final-HTML seed body");
        // The importer strips the blank line the frontmatter block leaves in
        // front of the body, and the file's terminating newline. Nothing else —
        // a trailing blank line beyond that terminator is content and is kept.
        // See trimSeedBodyEdges in the importer, and blog.seed.production.test.js
        // for the three seeds that depend on it.
        const expected = body.replace(/^\s+/, "").replace(/\r?\n$/, "");
        assert.equal(imported, expected, "importer rewrote a body that was already HTML");
      });

      it("gains no stray <p> wrappers from markdownToHtml", () => {
        for (const stray of ["<p><div", "<p><section", "<p><h2", "<p><table", "<p><ul"]) {
          assert.ok(!imported.includes(stray), `markdown converter mangled the body: found ${stray}`);
        }
      });

      it("keeps the FAQ block the FAQPage JSON-LD is built from", () => {
        assert.ok(stored.includes('<section class="artFaq"'), "the .artFaq section was stripped");
        assert.ok(stored.includes("artFaq__q"), "FAQ questions were stripped");
        assert.ok(stored.includes("artFaq__a"), "FAQ answers were stripped");
      });

      it("keeps every in-body id so the table of contents stays deep-linkable", () => {
        const before = idsIn(imported);
        assert.equal(before.length, idCount, "the seed file's id count changed — update HTML_SEEDS");
        assert.deepEqual(idsIn(stored), before, "sanitizePostHtml dropped or reordered in-body ids");
      });

      it("keeps <span> and <section>", () => {
        assert.ok(stored.includes("<span"), "<span> was stripped from the allowed tags");
        assert.ok(stored.includes("<section"), "<section> was stripped from the allowed tags");
      });
    });
  }
});
