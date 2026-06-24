"use strict";

/**
 * Tiny in-process TTL memoizer. No deps.
 *
 * Wraps a zero-arg (or argument-insensitive) loader so repeated calls within
 * `ttlMs` return the cached value instead of re-running the loader. Only use
 * for non-request-specific, globally shared data (e.g. content/settings loads,
 * sitemap build). Never cache per-user or request-scoped values here.
 *
 * @template T
 * @param {() => T} fn      Loader to memoize. Called with no arguments.
 * @param {number} ttlMs    Time-to-live in milliseconds.
 * @returns {(() => T) & { bust: () => void }}  Memoized loader; `.bust()` clears cache.
 */
function memoize(fn, ttlMs) {
  let cachedValue;
  let cachedAt = 0;
  let hasValue = false;

  const wrapped = function memoized() {
    const now = Date.now();
    if (hasValue && now - cachedAt < ttlMs) {
      return cachedValue;
    }
    cachedValue = fn();
    cachedAt = now;
    hasValue = true;
    return cachedValue;
  };

  // Manual invalidation (e.g. after an admin write updates the underlying data).
  wrapped.bust = function bust() {
    hasValue = false;
    cachedValue = undefined;
    cachedAt = 0;
  };

  return wrapped;
}

module.exports = { memoize };
