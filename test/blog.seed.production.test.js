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
 * Taken from the production database on 2026-08-04, read-only:
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
    sha256: "ee91deb4b103f17e9bb1a4fa35ff2d528c7eaa18604ec1b8e1da5a269c9e97cc",
    bytes: 44734,
    cover_image: "/uploads/images/2026/05/1779002111863-62d1c9880fc4.png",
    tags: ["أنظمة الفنادق"],
    endsWithNewline: false,
  },
  {
    file: "blog_post_no7.md",
    postId: 22,
    slug: "dali-smart-lighting-control",
    sha256: "212278088b97650d24afff3dc79cd3462662e2f9e0539c35b51d7df596d335e1",
    bytes: 11237,
    cover_image: "/uploads/blog/dali-cover.jpg",
    tags: ["الإضاءة الذكية", "DALI", "KNX", "أتمتة المباني", "توفير الطاقة", "المباني الذكية", "جدة"],
    endsWithNewline: true,
  },
  {
    file: "blog_post_no8.md",
    postId: 23,
    slug: "ev-chargers-real-estate-projects",
    sha256: "dc6065bceb8c3aaab07826a4baeaa62c0b27d6f48204513d036fd98414275c92",
    bytes: 11824,
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
