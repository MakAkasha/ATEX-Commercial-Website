"use strict";

/**
 * Hand-written SEO metadata, end to end.
 *
 * The blog seed files carry `meta_description`, `open_graph.og_title`,
 * `open_graph.og_description` and `featured_image_alt`. tools/import-blog-seeds.js
 * used to parse those and throw them away, so the page fell back to `excerpt`
 * and `title` and none of that copy ever reached a crawler. This file pins the
 * whole chain:
 *
 *   1. the front-matter parser reads the nested `open_graph:` block at all,
 *   2. a row carrying the metadata renders it in the meta tags and the JSON-LD,
 *   3. a row without it (every admin-authored post, and every row written before
 *      the columns existed) renders exactly what it rendered before,
 *   4. the values are escaped in both destinations.
 *
 * Rows are written straight into the harness DB rather than through the admin
 * API because the admin API deliberately does not accept these fields — see the
 * note in server/routes/posts.js's neighbourhood in the change that added them.
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");

const Database = require("better-sqlite3");

const { parseFrontmatter } = require("../tools/import-blog-seeds");
const { startServer } = require("./helpers/server");

const ADMIN_USERNAME = "test-admin";
const ADMIN_PASSWORD = "test-admin-password-9f2c";

const sameOrigin = (srv, extra = {}) => ({ ...extra, headers: { origin: srv.origin } });

const COVER = "/assets/solutions/smart-building.webp";

// Deliberately hostile copy: quotes would end the attribute, `<` would open a
// tag, `&` would start an entity, and `</script>` would close the JSON-LD block.
const RICH = {
  slug: "seo-rich-post",
  title: "عنوان المقال الكامل",
  excerpt: "مقدمة الصفحة الظاهرة للقارئ.",
  meta_description: 'وصف "البحث" & <script>alert(1)</script> نهاية',
  og_title: 'عنوان & "اجتماعي" <b>',
  og_description: "وصف اجتماعي مختلف تماماً عن وصف البحث.",
  cover_image_alt: 'صورة "الغلاف" & <img>',
};

const PLAIN = {
  slug: "seo-plain-post",
  title: "مقال بلا بيانات وصفية",
  excerpt: "ملخص المقال الوحيد المتاح.",
};

/** All values EJS's escapeXML produces, so a raw one can never slip through. */
const ejsEscape = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&#34;")
    .replace(/'/g, "&#39;");

/** What server/utils/responsiveImage.js's escapeAttr produces (differs on `"`). */
const attrEscape = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Read a single meta tag's raw (still-escaped) content attribute. */
function metaContent(html, selector) {
  const match = html.match(new RegExp(`<meta ${selector} content="([^"]*)"`));
  assert.ok(match, `no <meta ${selector}> in the rendered page`);
  return match[1];
}

function readGraph(html) {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match, "no application/ld+json block was rendered");
  const parsed = JSON.parse(match[1]);
  assert.ok(Array.isArray(parsed["@graph"]), "structured data has no @graph array");
  return parsed["@graph"];
}

const nodeOfType = (graph, type) => graph.find((n) => n["@type"] === type);

// ---------------------------------------------------------------------------
// 1. Front matter
// ---------------------------------------------------------------------------

describe("seed front matter", () => {
  const SAMPLE = [
    "---",
    'title: "عنوان"',
    'slug: "some-slug"',
    'meta_description: "وصف البحث"',
    'featured_image_alt: "نص بديل للصورة"',
    "tags:",
    "  - أول",
    "  - ثاني",
    "open_graph:",
    '  og_title: "عنوان اجتماعي"',
    '  og_description: "وصف اجتماعي"',
    '  og_type: "article"',
    "---",
    "# النص",
  ].join("\n");

  it("reads the nested open_graph block instead of dropping it", () => {
    const { meta } = parseFrontmatter(SAMPLE);
    assert.deepEqual(meta.open_graph, {
      og_title: "عنوان اجتماعي",
      og_description: "وصف اجتماعي",
      og_type: "article",
    });
  });

  it("still reads flat keys and list blocks alongside it", () => {
    const { meta, body } = parseFrontmatter(SAMPLE);
    assert.equal(meta.meta_description, "وصف البحث");
    assert.equal(meta.featured_image_alt, "نص بديل للصورة");
    assert.deepEqual(meta.tags, ["أول", "ثاني"]);
    assert.equal(body.trim(), "# النص");
  });
});

// ---------------------------------------------------------------------------
// 2..4. Rendering
// ---------------------------------------------------------------------------

describe("blog post SEO metadata", () => {
  let srv;
  let richPage;
  let plainPage;
  let listPage;

  before(async () => {
    srv = await startServer({
      label: "blogseo",
      env: {
        DEFAULT_ADMIN_ENABLED: "true",
        DEFAULT_ADMIN_USERNAME: ADMIN_USERNAME,
        DEFAULT_ADMIN_PASSWORD: ADMIN_PASSWORD,
      },
    });

    const login = await srv.post(
      "/api/auth/login",
      { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
      sameOrigin(srv, { jar: true })
    );
    assert.equal(login.status, 200, "admin login failed — cannot seed posts");

    for (const post of [RICH, PLAIN]) {
      const res = await srv.post(
        "/api/posts",
        {
          slug: post.slug,
          title: post.title,
          excerpt: post.excerpt,
          cover_image: COVER,
          content_html: '<h2 id="intro">مقدمة</h2><p>فقرة.</p>',
          tags: ["أتمتة"],
          published: true,
        },
        sameOrigin(srv, { jar: true })
      );
      assert.equal(res.status, 200, `seeding ${post.slug} failed`);
    }

    // Stand in for what tools/import-blog-seeds.js writes.
    const db = new Database(srv.dbPath);
    try {
      db.prepare(
        "UPDATE posts SET meta_description = ?, og_title = ?, og_description = ?, cover_image_alt = ? WHERE slug = ?"
      ).run(RICH.meta_description, RICH.og_title, RICH.og_description, RICH.cover_image_alt, RICH.slug);
    } finally {
      db.close();
    }

    richPage = await (await srv.get(`/blog/${RICH.slug}`)).text();
    plainPage = await (await srv.get(`/blog/${PLAIN.slug}`)).text();
    listPage = await (await srv.get("/blog")).text();
  });

  after(async () => {
    await srv.stop();
  });

  describe("when the post carries hand-written metadata", () => {
    it("uses meta_description for the description, not the excerpt", () => {
      assert.equal(metaContent(richPage, 'name="description"'), ejsEscape(RICH.meta_description));
      assert.notEqual(metaContent(richPage, 'name="description"'), ejsEscape(RICH.excerpt));
    });

    it("uses og_title and og_description for the social cards", () => {
      assert.equal(metaContent(richPage, 'property="og:title"'), ejsEscape(RICH.og_title));
      assert.equal(metaContent(richPage, 'property="og:description"'), ejsEscape(RICH.og_description));
      assert.equal(metaContent(richPage, 'name="twitter:title"'), ejsEscape(RICH.og_title));
      assert.equal(metaContent(richPage, 'name="twitter:description"'), ejsEscape(RICH.og_description));
    });

    it("uses cover_image_alt for the cover image and og:image:alt", () => {
      assert.equal(metaContent(richPage, 'property="og:image:alt"'), ejsEscape(RICH.cover_image_alt));
      assert.ok(
        richPage.includes(`alt="${attrEscape(RICH.cover_image_alt)}"`),
        "the cover <img> is still using the title as its alt text"
      );
      assert.ok(!richPage.includes(`alt="${attrEscape(RICH.title)}"`), "the hardcoded title alt is still being emitted");
    });

    it("uses cover_image_alt on the blog listing card", () => {
      assert.ok(
        listPage.includes(`alt="${attrEscape(RICH.cover_image_alt)}"`),
        "the listing card image is still emitting an empty alt"
      );
    });

    it("uses meta_description as the BlogPosting description", () => {
      const posting = nodeOfType(readGraph(richPage), "BlogPosting");
      assert.equal(posting.description, RICH.meta_description);
      assert.equal(posting.headline, RICH.title, "headline must stay the real title, not the og_title");
    });
  });

  describe("when the post carries none (admin-authored, or written before the columns existed)", () => {
    it("falls back to the excerpt for the description", () => {
      assert.equal(metaContent(plainPage, 'name="description"'), ejsEscape(PLAIN.excerpt));
      assert.equal(metaContent(plainPage, 'property="og:description"'), ejsEscape(PLAIN.excerpt));
      assert.equal(metaContent(plainPage, 'name="twitter:description"'), ejsEscape(PLAIN.excerpt));
    });

    it("falls back to the title for og:title", () => {
      assert.equal(metaContent(plainPage, 'property="og:title"'), ejsEscape(PLAIN.title));
      assert.equal(metaContent(plainPage, 'name="twitter:title"'), ejsEscape(PLAIN.title));
    });

    it("falls back to the title for the cover alt, and to an empty alt on the card", () => {
      assert.equal(metaContent(plainPage, 'property="og:image:alt"'), ejsEscape(PLAIN.title));
      assert.ok(plainPage.includes(`alt="${attrEscape(PLAIN.title)}"`), "the cover alt fallback was lost");
      assert.ok(listPage.includes('alt=""'), "the listing card lost its empty-alt fallback");
    });

    it("falls back to the excerpt for the BlogPosting description", () => {
      const posting = nodeOfType(readGraph(plainPage), "BlogPosting");
      assert.equal(posting.description, PLAIN.excerpt);
    });
  });

  describe("escaping", () => {
    it("never emits the raw metadata into a meta tag attribute", () => {
      for (const raw of [RICH.meta_description, RICH.og_title, RICH.cover_image_alt]) {
        assert.ok(!richPage.includes(raw), `raw metadata reached the markup unescaped: ${raw}`);
      }
      // The specific characters that would break out of the attribute.
      assert.ok(!/content="[^"]*<script/.test(richPage), "a raw < opened a tag inside a meta attribute");
      assert.ok(richPage.includes("&lt;script&gt;alert(1)&lt;/script&gt;"), "the escaped form is missing");
    });

    it("never emits a raw < into the JSON-LD block", () => {
      const openTag = '<script type="application/ld+json">';
      const open = richPage.indexOf(openTag);
      assert.notEqual(open, -1, "no ld+json block was rendered");

      const start = open + openTag.length;
      const block = richPage.slice(start, richPage.indexOf("</script>", start));
      assert.ok(!block.includes("<"), `a raw < reached the JSON-LD block: ${block.slice(0, 400)}`);
      assert.ok(block.includes("\\u003c"), "the escaping that makes that safe is not being applied");
    });

    it("round-trips the JSON-LD description back to the author's own characters", () => {
      const posting = nodeOfType(readGraph(richPage), "BlogPosting");
      assert.equal(posting.description, RICH.meta_description);
      assert.ok(posting.description.includes("</script>"), "the escaping mangled the author's text");
    });
  });
});
