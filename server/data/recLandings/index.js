"use strict";

/**
 * The /rec campaign landing pages.
 *
 * These two URLs are printed on physical brochures and QR codes that are
 * already in the field, so the slugs are fixed contract, not a naming choice:
 *
 *   /rec/smart-home   real-estate developers
 *   /rec/smart-villa  villa owners
 *
 * Both 404'd from the ground-up site rebuild until this module existed, which
 * means every scan since then hit a dead end. That history is the reason for
 * RESERVED_SLUGS below: /rec/:slug is otherwise the admin-managed custom-pages
 * route (server/routes/pages.js), and a custom page created at one of these
 * slugs would be silently unreachable forever, because the hardcoded route
 * matches first. server/routes/customPages.js rejects those slugs on create and
 * update rather than letting an admin build a page that never renders.
 */

const landings = [require("./smart-home"), require("./smart-villa")];

const bySlug = new Map(landings.map((page) => [page.slug, page]));

/** Slugs the custom-pages CMS must refuse, because these routes shadow them. */
const RESERVED_SLUGS = Object.freeze(landings.map((page) => page.slug));

/** @returns {Array<object>} every landing page, in sitemap order. */
function getRecLandings() {
  return landings;
}

/**
 * @param {string} slug
 * @returns {object|null} the landing record, or null when the slug is not one.
 */
function getRecLanding(slug) {
  return bySlug.get(String(slug || "").toLowerCase()) || null;
}

/** @param {string} slug @returns {boolean} */
function isReservedSlug(slug) {
  return bySlug.has(String(slug || "").toLowerCase());
}

module.exports = {
  RESERVED_SLUGS,
  getRecLanding,
  getRecLandings,
  isReservedSlug,
};
