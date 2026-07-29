/**
 * Permanent (301) blog slug redirects — file-based config, no admin UI.
 *
 * Four posts were published with machine-generated slugs ("P422904", ...).
 * tools/rename-blog-slugs.js renames the DB rows to readable slugs; this map
 * keeps the OLD URLs alive so existing inbound links and search rankings
 * transfer to the new URL instead of hitting a 404.
 *
 * The map is intentionally independent of the database: after the rename the
 * old row no longer exists, so the redirect must be served from code.
 *
 * HOW TO ADD A REDIRECT
 * ---------------------
 * Add `"old-slug": "new-slug"` below. Keys are matched case-insensitively.
 * Self-maps and chains (a -> b where b is itself a key) are rejected at load
 * time so a redirect can never loop.
 */

const RAW_REDIRECTS = {
  P422904: "smart-home-system-saudi-arabia-guide",
  P518098: "smart-building-systems-saudi-arabia",
  P389681: "smart-hotel-systems-saudi-arabia",
  P764852: "hotel-automation-guest-experience",
};

// Loop guard: drop any entry whose target is itself a redirect source.
// Keys normalized to lowercase so /blog/p422904 redirects like /blog/P422904.
function buildRedirectMap(raw) {
  const sources = new Set(Object.keys(raw).map((k) => k.toLowerCase()));
  const map = new Map();
  Object.entries(raw).forEach(([from, to]) => {
    const key = String(from || "").toLowerCase();
    const target = String(to || "");
    if (!key || !target) return;
    if (sources.has(target.toLowerCase())) {
      console.warn(`blogRedirects: skipping "${from}" -> "${to}" (target is itself a redirect source; would loop)`);
      return;
    }
    map.set(key, target);
  });
  return map;
}

const REDIRECT_MAP = buildRedirectMap(RAW_REDIRECTS);

/**
 * @param {string} slug requested blog slug
 * @returns {string|null} new slug to 301 to, or null when not a redirect
 */
function getBlogRedirectTarget(slug) {
  return REDIRECT_MAP.get(String(slug || "").toLowerCase()) || null;
}

module.exports = { RAW_REDIRECTS, REDIRECT_MAP, getBlogRedirectTarget };
