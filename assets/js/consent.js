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
    const consent = getCookie(CONSENT_COOKIE) || "essential";
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

  function mountBanner() {
    const existing = document.getElementById("consentBanner");
    if (existing) return;

    const el = document.createElement("div");
    el.id = "consentBanner";
    el.style.cssText =
      "position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;background:rgba(255,255,255,0.96);border:1px solid rgba(0,0,0,0.12);border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,0.14);padding:14px;font-family:Cairo,system-ui;";

    el.innerHTML = `
      <div style="display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap">
        <div style="min-width:220px;max-width:760px">
          <div style="font-weight:900;color:#002b44">إعدادات الخصوصية</div>
          <div style="margin-top:4px;color:rgba(11,31,42,0.80);font-weight:700;line-height:1.7">
            نستخدم ملفات تعريف الارتباط لتحسين التجربة وقياس الأداء. يمكنك قبول التحليلات أو الاكتفاء بالأساسي.
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button id="consentEssential" style="min-height:44px;padding:12px 18px;border-radius:999px;border:1px solid rgba(0,0,0,0.12);background:#fff;font-weight:900;cursor:pointer">أساسي فقط</button>
          <button id="consentAccept" style="min-height:44px;padding:12px 18px;border-radius:999px;border:1px solid transparent;background:#ff9933;font-weight:900;cursor:pointer">قبول التحليلات</button>
        </div>
      </div>
    `;

    document.body.appendChild(el);
    document.body.classList.add("consent-open");

    const close = () => {
      el.remove();
      document.body.classList.remove("consent-open");
    };
    document.getElementById("consentEssential").addEventListener("click", () => {
      setCookie(CONSENT_COOKIE, "essential", 365);
      close();
      sendPageView();
    });
    document.getElementById("consentAccept").addEventListener("click", () => {
      setCookie(CONSENT_COOKIE, "analytics", 365);
      ensureVisitorId();
      close();
      // After accepting, the next full page load will include GA/GTM; track now too.
      sendPageView();
    });
  }

  function bootstrap() {
    const consent = getCookie(CONSENT_COOKIE);
    // Always do minimal tracking.
    sendPageView();
    if (!consent) mountBanner();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootstrap);
  else bootstrap();
})();
