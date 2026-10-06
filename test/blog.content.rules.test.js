"use strict";

/**
 * Content rules for every blog seed file, run on each CI build and push.
 *
 * These are the mistakes that publish silently: a link to a post that does not
 * exist, a leftover placeholder, an image with no alt text, a comparison table
 * that overflows a phone. Nothing else in the suite looks at article content.
 *
 * LEGACY allow-lists name the posts that predate a rule. They are a debt list,
 * not an exemption for new posts: a new article must pass every rule outright.
 * Remove a slug from a list once the live post is fixed.
 *
 * DB_PATH is pointed at a throwaway path before the importer is required, for
 * the same reason as test/blog.seed.html.test.js.
 */

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { makeTempDbPath } = require("./helpers/server");

process.env.DB_PATH = makeTempDbPath("blogrules");

const { buildPosts } = require("../tools/import-blog-seeds");
const { getBlogRedirectTarget } = require("../server/data/blogRedirects");

/** Posts written in the admin panel with no cover alt text. Fix in the admin, then remove here. */
const LEGACY_NO_COVER_ALT = new Set([
  "hotel-automation-guest-experience",
  "dali-smart-lighting-control",
  "ev-chargers-real-estate-projects",
]);

/** Posts whose comparison table is not wrapped in .artTableWrap, so it does not become cards on phones. */
const LEGACY_BARE_TABLE = new Set(["dali-smart-lighting-control", "smart-home-wired-vs-wireless-saudi-arabia"]);

const { posts } = buildPosts();
const slugs = new Set(posts.map((post) => post.slug));

const stripTags = (html) => html.replace(/<[^>]+>/g, " ");

describe("blog seed content rules", () => {
  it("finds the seed posts", () => {
    assert.ok(posts.length >= 8, `only ${posts.length} seed posts parsed`);
  });

  it("gives every post a unique, lowercase, ASCII slug", () => {
    assert.equal(slugs.size, posts.length, "two seed files share a slug");
    for (const { slug } of posts) {
      assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, `slug "${slug}" is not lowercase-kebab ASCII`);
    }
  });

  for (const post of posts) {
    describe(post.slug, () => {
      it("has a title, an excerpt of a sensible length, and at least one tag", () => {
        assert.ok(post.title.length >= 10 && post.title.length <= 120, `title is ${post.title.length} chars`);
        assert.ok(
          post.excerpt.length >= 60 && post.excerpt.length <= 400,
          `excerpt is ${post.excerpt.length} chars (60-400)`
        );
        assert.ok(post.tags.length >= 1, "no tags");
      });

      it("keeps meta_description within search-result length when it has one", () => {
        if (!post.meta_description) return;
        assert.ok(
          post.meta_description.length >= 70 && post.meta_description.length <= 180,
          `meta_description is ${post.meta_description.length} chars (70-180)`
        );
      });

      it("has no leftover placeholder text", () => {
        const text = stripTags(post.content_html);
        for (const pattern of [/REPLACE_WITH_/, /\bTODO\b/, /\bFIXME\b/, /lorem ipsum/i, /\[\s*insert\b/i]) {
          assert.doesNotMatch(text, pattern, `found ${pattern} in the body`);
        }
      });

      it("links only to blog posts that exist (or redirect to one)", () => {
        const links = [...post.content_html.matchAll(/href="\/blog\/([^"#?/]+)/g)].map((m) => m[1]);
        for (const target of links) {
          const resolved = getBlogRedirectTarget(target) || target;
          assert.ok(slugs.has(resolved), `links to /blog/${target}, which no seed file defines`);
        }
      });

      it("has no <img> missing its alt attribute, and no inline script", () => {
        for (const tag of post.content_html.match(/<img\b[^>]*>/gi) || []) {
          // alt="" is valid for a decorative icon; a missing attribute is not.
          assert.match(tag, /\balt="/, `image without an alt attribute: ${tag.slice(0, 100)}`);
        }
        assert.doesNotMatch(post.content_html, /<script\b/i, "inline <script> in the body");
      });

      it("gives a cover image alt text and a site-hosted path", () => {
        if (!post.cover_image) return;
        assert.match(post.cover_image, /^\/(uploads|assets)\//, `cover "${post.cover_image}" is not site-hosted`);
        if (LEGACY_NO_COVER_ALT.has(post.slug)) return;
        assert.ok(post.cover_image_alt.trim().length >= 10, "cover image has no alt text");
      });

      it("wraps comparison tables in .artTableWrap so they become cards on phones", () => {
        if (LEGACY_BARE_TABLE.has(post.slug)) return;
        const tables = (post.content_html.match(/<table\b/gi) || []).length;
        const wrapped = (post.content_html.match(/class="artTableWrap\b/g) || []).length;
        assert.equal(wrapped, tables, `${tables} table(s) but ${wrapped} .artTableWrap wrapper(s)`);
      });
    });
  }
});
