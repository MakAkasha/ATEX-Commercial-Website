"use strict";

/**
 * CSRF defence for state-changing /api requests.
 *
 * DEFENCE IN DEPTH, NOT THE ONLY PROTECTION. The session cookie is
 * `sameSite: lax` by default (server/config.js), which already stops a modern
 * browser from attaching it to a cross-site POST. This guard covers what
 * sameSite does not: older browsers, a deployment that sets SESSION_SAME_SITE
 * to `none`, and non-browser clients. Do not remove either one on the
 * assumption that the other suffices. There is still no CSRF token in this app.
 *
 * FAILS CLOSED. A state-changing request must present an `Origin` (or, failing
 * that, a `Referer`) that parses as a URL and resolves either to this server's
 * own host or to an explicit ALLOWED_ORIGINS entry. Presenting no origin
 * information at all is a rejection, not a pass — the previous version of this
 * guard treated a header-less request as trusted, which is exactly the shape an
 * attacker can produce in several contexts.
 *
 * HOST COMPARISON, NOT SCHEME. We compare `URL.host` (hostname + port), not the
 * full origin including scheme. `req.protocol` only reports "https" when
 * `trust proxy` is enabled AND Nginx forwards `x-forwarded-proto`; in
 * development `trust proxy` is off (server/config.js defaults it to
 * `isProduction`) and the browser legitimately sends `http://127.0.0.1:PORT`.
 * Comparing the scheme would therefore either break the local development flow
 * or make the check's strictness depend on proxy configuration. Host comparison
 * is exact, includes the port, and behaves identically in both environments.
 * An attacker able to serve plain http:// on our own hostname already has
 * network-level control, which no request-header check survives anyway.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Rejection logs echo back an attacker-supplied string. Cap it so a hostile
// client cannot use the log file as an unbounded write primitive.
const MAX_LOGGED_ORIGIN_CHARS = 120;

/**
 * @param {object} config Result of getConfig(); only `allowedOrigins` is read.
 * @returns {Function} Express middleware.
 */
function createCsrfGuard(config) {
  // Exact strings, as parsed from the comma-separated ALLOWED_ORIGINS env var.
  // Entries are matched against `new URL(presented).origin`, so they must be
  // scheme + host [+ port] with no trailing slash, e.g. "https://atex.sa".
  const allowedOrigins = new Set(config.allowedOrigins || []);

  return function csrfGuard(req, res, next) {
    if (SAFE_METHODS.has(req.method)) return next();

    const presented = req.get("origin") || req.get("referer") || "";

    let parsed = null;
    try {
      parsed = presented ? new URL(presented) : null;
    } catch {
      parsed = null;
    }

    if (parsed) {
      if (allowedOrigins.has(parsed.origin)) return next();

      const host = req.get("host");
      if (host && parsed.host.toLowerCase() === host.toLowerCase()) return next();
    }

    // Log the parsed origin (scheme + host + port) rather than the raw header:
    // a Referer carries a path and query string, which can hold reset tokens or
    // other credential-shaped values. Only an unparseable value is echoed as-is,
    // truncated, because there is nothing to normalise it to.
    const offending = parsed ? parsed.origin : presented.slice(0, MAX_LOGGED_ORIGIN_CHARS);
    console.warn(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "warn",
        type: "csrf_rejected",
        method: req.method,
        path: req.originalUrl,
        reason: !presented ? "NO_ORIGIN_OR_REFERER" : parsed ? "ORIGIN_HOST_MISMATCH" : "UNPARSEABLE_ORIGIN",
        origin: offending || null,
        ip: req.ip,
      })
    );
    return res.status(403).json({ error: "CSRF_REJECTED" });
  };
}

module.exports = { createCsrfGuard };
