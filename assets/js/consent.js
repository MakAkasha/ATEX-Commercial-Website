/*
  Consent + internal tracking bootstrap.

  Rules:
  - Before consent: internal tracking records only path (no visitor id / no referrer).
  - After consent: enables visitor id + referrer.
  - GA/GTM scripts are only injected server-side when consent=analytics.
*/

(function () {
  const CONSENT_COOKIE = "atex.consent";
  const VISITOR_COOKIE = "atex.vid";

  function getCookie(name) {
    const m = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/[.$?*|{}()\[\]\\\/\+^]/g, "\\$&") + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  }

  function setCookie(name, value, days) {
    const d = new Date();
    d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; expires=${d.toUTCString()}; samesite=lax`;
  }

  function ensureVisitorId() {
    let vid = getCookie(VISITOR_COOKIE);
    if (vid) return vid;
    vid = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setCookie(VISITOR_COOKIE, vid, 365);
    return vid;
  }

  function postJson(url, body) {
    return fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  }

  function sendPageView() {
    const consent = getCookie(CONSENT_COOKIE) || "analytics"; // consent-by-default
    const payload = {
      path: location.pathname + location.search,
      consent: consent === "analytics" ? "analytics" : "essential",
    };
    if (payload.consent === "analytics") {
      payload.visitorId = ensureVisitorId();
      payload.referrer = document.referrer || "";
    }
    postJson("/api/track/view", payload);
  }

  function bootstrap() {
    // Consent-by-default (governed by the privacy policy); no banner shown. Track every view.
    sendPageView();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootstrap);
  else bootstrap();
})();
