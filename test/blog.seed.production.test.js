"use strict";

/**
 * The three seed files that are backups, not drafts.
 *
 * blog_post_no6/no7/no8.md were written backwards: the articles were composed in
 * the admin panel and existed ONLY as rows in the production database (posts 21,
 * 22 and 23). The seed files were generated from those rows so the articles
 * survive a lost or badly restored database.
 *
 * That makes their contract different from every other seed. A normal seed file
 * is the source of truth and the database follows it. These three must instead
 * reproduce what is already live byte for byte — the moment they drift, running
 * tools/import-blog-seeds.js against production stops being a no-op and starts
 * silently rewriting a published article with whatever the file happens to say.
 *
 * So the checksums below are the checksums of the live rows, taken read-only from
 * the production database. They are not "whatever the file currently hashes to".
 * If one of these fails, the seed file has drifted from production; verify
 * against the live row before touching the expected value.
 *
 * The empty-SEO assertion matters for the same reason. The live rows have
 * meta_description, og_title, og_description and cover_image_alt empty. Adding
 * that copy to the front matter is a tempting improvement and it would make the
 * next import rewrite three live posts. Do it deliberately, in the admin panel or
 * in a change that expects the update.
 *
 * DB_PATH is pointed at a throwaway temp path for the same reason as
 * test/blog.seed.html.test.js — requiring the route module must never be one
 * refactor away from touching the real database.
 */

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const { makeTempDbPath, REPO_ROOT } = require("./helpers/server");

process.env.DB_PATH = makeTempDbPath("blogseedprod");

const { sanitizePostHtml } = require("../server/routes/posts");
const { buildPosts, looksLikeHtmlBody, parseFrontmatter } = require("../tools/import-blog-seeds");

const SEED_DIR = path.join(REPO_ROOT, "content-src", "blog-seed");

/**
 * Originally taken from the production database on 2026-08-04, read-only.
 * Re-pinned 2026-10-06 (owner-approved) for the facade-article link added to
 * posts 12 and 22. Earlier: 2026-09-26 after the stop-slop copy rewrite of
 * posts 21-23; live rows match again once that rewrite is imported. Check with:
 *   sqlite3 -readonly server/data.sqlite \
 *     "SELECT hex(content_html) FROM posts WHERE id = 21;" | tr -d '\n' | sha256sum
 * `sha256` here is over the UTF-8 bytes of content_html; `bytes` is its UTF-8
 * byte length. `endsWithNewline` records the trailing blank line the editor left
 * on two of the three — the importer preserves it on purpose.
 */
const PRODUCTION_BACKFILLS = [
  {
    file: "blog_post_no6.md",
    postId: 21,
    slug: "hotel-automation-guest-experience",
    sha256: "acdf8109bfb24eafe2437e29069e737776fd184dcc6d6e8bff7bbc1b6d55cf6b",
    bytes: 36771,
    cover_image: "/uploads/images/2026/05/1779002111863-62d1c9880fc4.png",
    tags: ["أنظمة الفنادق"],
    endsWithNewline: false,
  },
  {
    file: "blog_post_no7.md",
    postId: 22,
    slug: "dali-smart-lighting-control",
    sha256: "2bd77742fe92de6a9b5a0897c7fef71a40e4319c5a4defd902724b6019ad3332",
    bytes: 12076,
    cover_image: "/uploads/blog/dali-cover.jpg",
    tags: ["الإضاءة الذكية", "DALI", "KNX", "أتمتة المباني", "توفير الطاقة", "المباني الذكية", "جدة"],
    endsWithNewline: true,
  },
  {
    file: "blog_post_no8.md",
    postId: 23,
    slug: "ev-chargers-real-estate-projects",
    sha256: "060a8ed9b5d6ecc1fd9ad6efb5a64d282a9aaa57b9fefc5d2e409ec8784ccb51",
    bytes: 10826,
    cover_image: "/uploads/blog/ev-cover.webp?v=2",
    tags: [
      "شواحن السيارات الكهربائية",
      "البنية التحتية الكهربائية",
      "المشاريع العقارية",
      "إدارة الأحمال",
      "المدن الذكية",
      "الاستدامة",
      "جدة",
    ],
    endsWithNewline: true,
  },
];

const sha256 = (text) => crypto.createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");

const bySlug = new Map(buildPosts().posts.map((post) => [post.slug, post]));

describe("admin-authored posts backfilled from production", () => {
  for (const expected of PRODUCTION_BACKFILLS) {
    describe(`${expected.file} (post ${expected.postId})`, () => {
      const post = bySlug.get(expected.slug);

      it("is in the importer's seed list", () => {
        assert.ok(
          post,
          `${expected.file} produced no post for slug ${expected.slug} — is it missing from buildPosts()?`
        );
      });

      it("reproduces the live content_html byte for byte", () => {
        assert.equal(
          Buffer.byteLength(post.content_html, "utf8"),
          expected.bytes,
          "content length drifted from the live row"
        );
        assert.equal(
          sha256(post.content_html),
          expected.sha256,
          `the seed no longer reproduces post ${expected.postId} as it is in production — ` +
            "an import would overwrite the live article with this file"
        );
      });

      it("keeps the trailing newline exactly as the database has it", () => {
        assert.equal(
          post.content_html.endsWith("\n"),
          expected.endsWithNewline,
          "the body's trailing newline was added or trimmed — that alone makes the import a rewrite"
        );
      });

      it("carries the live cover image and tags", () => {
        assert.equal(post.cover_image, expected.cover_image);
        assert.deepEqual(post.tags, expected.tags);
      });

      it("leaves the SEO columns empty, as the live rows have them", () => {
        for (const field of ["meta_description", "og_title", "og_description", "cover_image_alt"]) {
          assert.equal(
            post[field],
            "",
            `${field} was filled in — the live row has it empty, so the next import would rewrite the post`
          );
        }
      });

      it("is passed through the importer as final HTML, not run through the markdown converter", () => {
        const body = parseFrontmatter(fs.readFileSync(path.join(SEED_DIR, expected.file), "utf8")).body;
        assert.equal(looksLikeHtmlBody(body), true, "guard rejected a final-HTML seed body");
        for (const stray of ["<p><div", "<p><section", "<p><h2", "<p><table", "<p><ul"]) {
          assert.ok(!post.content_html.includes(stray), `markdown converter mangled the body: found ${stray}`);
        }
      });

      it("survives sanitizePostHtml untouched, so what is stored is what renders", () => {
        assert.equal(
          sanitizePostHtml(post.content_html),
          post.content_html,
          "the sanitizer would strip part of the live article"
        );
      });
    });
  }
});

/**
 * Posts 11-13 were seeded first and then edited in the admin panel. Their seed
 * files were re-synced from the live rows on 2026-10-06, so — like the backfills
 * above — they must reproduce production byte for byte. Unlike those, these
 * rows carry hand-written SEO copy, so only the body and cover are pinned here.
 */
const SYNCED_FROM_PRODUCTION = [
  {
    file: "blog_post_no1.md",
    postId: 11,
    slug: "smart-home-system-saudi-arabia-guide",
    sha256: "2b6a87c4aaad7e82d05c2835b818effe4a20632ed1b52de6504d427b91d85d15",
    bytes: 30224,
    cover_image: "/uploads/images/2026/04/1776930416319-81fb8e225c1e8.jpg",
  },
  {
    file: "blog_post_no2.md",
    postId: 12,
    slug: "smart-building-systems-saudi-arabia",
    sha256: "8b50182addb2071455149a790994de32b9311b0ff42c1658b67916f7755522e9",
    bytes: 48306,
    cover_image: "/uploads/images/2026/04/1776930541795-07db990896cff.webp",
  },
  {
    file: "blog_post_no3.md",
    postId: 13,
    slug: "smart-hotel-systems-saudi-arabia",
    sha256: "c9b4eb740f7d1d220251d72fb84a9d74187829e67ab87b08cab2cb52665dfc43",
    bytes: 293861,
    cover_image: "/uploads/images/2026/04/1776930888780-0968336e7ef7f.jpg",
  },
];

describe("seed files synced from production edits", () => {
  for (const expected of SYNCED_FROM_PRODUCTION) {
    it(`${expected.file} reproduces live post ${expected.postId} byte for byte`, () => {
      const post = bySlug.get(expected.slug);
      assert.ok(post, `${expected.file} produced no post for slug ${expected.slug}`);
      assert.equal(Buffer.byteLength(post.content_html, "utf8"), expected.bytes);
      assert.equal(sha256(post.content_html), expected.sha256);
      assert.equal(post.cover_image, expected.cover_image);
    });
  }
});
