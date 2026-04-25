const fs = require("fs");

const base = String(process.env.SMOKE_BASE || "http://127.0.0.1:5173").replace(/\/+$/, "");
const sessionCookieName = String(process.env.SESSION_NAME || "atex.sid").trim() || "atex.sid";

function parseNetscapeCookieJar(path) {
  try {
    const raw = fs.readFileSync(path, "utf8");
    const line = raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find((s) => s && !s.startsWith("#") && s.includes(`\t${sessionCookieName}\t`));
    if (!line) return "";
    const parts = line.split("\t");
    const value = parts[parts.length - 1] || "";
    return value ? `${sessionCookieName}=${value}` : "";
  } catch {
    return "";
  }
}

function getCookie() {
  const candidates = [
    () => parseNetscapeCookieJar(".tmp_admin_cookiejar.txt"),
    () => {
      try {
        return fs.readFileSync(".tmp_cookie.txt", "utf8").trim();
      } catch {
        return "";
      }
    },
    () => parseNetscapeCookieJar(".tmp_cookies.txt"),
  ];

  for (const read of candidates) {
    const v = read();
    if (v && v.startsWith(`${sessionCookieName}=`)) return v;
  }
  return "";
}

async function call(path, { method = "GET", body, cookie } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";

  const res = await fetch(base + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ignore non-json
  }
  return { ok: res.ok, status: res.status, json, text };
}

async function loginAndGetCookie(username, password) {
  if (!username || !password) return "";
  const res = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const getSetCookie = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie.bind(res.headers) : null;
  const setCookieRaw = getSetCookie ? (getSetCookie()[0] || "") : res.headers.get("set-cookie") || "";
  const cookie = (setCookieRaw.split(";")[0] || "").trim();
  if (!res.ok || !cookie.startsWith(`${sessionCookieName}=`)) return "";
  return cookie;
}

function push(checks, name, pass, detail = "") {
  checks.push({ name, pass, detail });
}

async function main() {
  const checks = [];
  const fromLogin = await loginAndGetCookie(process.env.SMOKE_USER, process.env.SMOKE_PASS);
  const cookie = fromLogin || getCookie();
  if (!cookie) {
    throw new Error("No valid auth cookie. Set SMOKE_USER/SMOKE_PASS or provide a fresh cookie file.");
  }

  // Home
  const home = await call("/api/content/home", { cookie });
  push(checks, "home:get", home.ok && !!home.json?.content, `status=${home.status}`);

  // Blog CRUD
  const posts = await call("/api/posts", { cookie });
  push(checks, "posts:list", posts.ok && Array.isArray(posts.json?.posts), `status=${posts.status}`);

  const postSlug = `smoke-${Date.now()}`;
  const postCreate = await call("/api/posts", {
    method: "POST",
    cookie,
    body: {
      slug: postSlug,
      title: "Smoke Post",
      excerpt: "smoke",
      cover_image: "",
      content_html: "<p>smoke</p>",
      tags: [],
      published: false,
    },
  });
  const postId = postCreate.json?.id;
  push(checks, "posts:create", postCreate.ok && !!postId, `status=${postCreate.status}`);

  if (postId) {
    const postUpdate = await call(`/api/posts/${postId}`, {
      method: "PUT",
      cookie,
      body: {
        slug: `${postSlug}-u`,
        title: "Smoke Post Updated",
        excerpt: "smoke2",
        cover_image: "",
        content_html: "<p>smoke2</p>",
        tags: [],
        published: true,
      },
    });
    push(checks, "posts:update", postUpdate.ok, `status=${postUpdate.status}`);

    const postDelete = await call(`/api/posts/${postId}`, { method: "DELETE", cookie });
    push(checks, "posts:delete", postDelete.ok, `status=${postDelete.status}`);
  }

  // Analytics
  const analyticsGet = await call("/api/settings/analytics", { cookie });
  push(checks, "analytics:get", analyticsGet.ok && !!analyticsGet.json?.settings, `status=${analyticsGet.status}`);

  const original = analyticsGet.json?.settings || { enabled: false, gaMeasurementId: "", gtmContainerId: "" };
  const analyticsPut = await call("/api/settings/analytics", {
    method: "PUT",
    cookie,
    body: {
      enabled: !!original.enabled,
      gaMeasurementId: original.gaMeasurementId || "",
      gtmContainerId: original.gtmContainerId || "",
    },
  });
  push(checks, "analytics:put", analyticsPut.ok, `status=${analyticsPut.status}`);

  // Custom pages CRUD
  const customList = await call("/api/custom-pages", { cookie });
  push(checks, "custom:list", customList.ok && Array.isArray(customList.json?.pages), `status=${customList.status}`);

  const customSlug = `smoke-page-${Date.now()}`;
  const customCreate = await call("/api/custom-pages", {
    method: "POST",
    cookie,
    body: {
      title: "Smoke Page",
      slug: customSlug,
      html_code: "<h1>Smoke</h1>",
      css_code: "h1{color:red}",
      js_code: "console.log('smoke')",
      published: false,
      unsafe_js: false,
    },
  });
  const customId = customCreate.json?.id;
  push(checks, "custom:create", customCreate.ok && !!customId, `status=${customCreate.status}`);

  if (customId) {
    const customGet = await call(`/api/custom-pages/${customId}`, { cookie });
    push(checks, "custom:get", customGet.ok && !!customGet.json?.page, `status=${customGet.status}`);

    const customUpdate = await call(`/api/custom-pages/${customId}`, {
      method: "PUT",
      cookie,
      body: {
        title: "Smoke Page Updated",
        slug: `${customSlug}-u`,
        html_code: "<h1>Updated</h1>",
        css_code: "",
        js_code: "",
        published: true,
        unsafe_js: true,
      },
    });
    push(checks, "custom:update", customUpdate.ok, `status=${customUpdate.status}`);

    const customDelete = await call(`/api/custom-pages/${customId}`, { method: "DELETE", cookie });
    push(checks, "custom:delete", customDelete.ok, `status=${customDelete.status}`);
  }

  // Tracking + stats
  const trackEvent = await call("/api/track/event", {
    method: "POST",
    body: { name: "admin_smoke_event" },
    cookie,
  });
  push(checks, "track:event", trackEvent.ok, `status=${trackEvent.status}`);

  const statsSummary = await call("/api/track/stats/summary?range=7", { cookie });
  push(checks, "track:summary", statsSummary.ok && typeof statsSummary.json?.total === "number", `status=${statsSummary.status}`);

  const statsTop = await call("/api/track/stats/top?range=7", { cookie });
  push(checks, "track:top", statsTop.ok && Array.isArray(statsTop.json?.top), `status=${statsTop.status}`);

  const statsDaily = await call("/api/track/stats/daily?range=7", { cookie });
  push(checks, "track:daily", statsDaily.ok && Array.isArray(statsDaily.json?.series), `status=${statsDaily.status}`);

  const failed = checks.filter((c) => !c.pass);
  console.log(JSON.stringify({ checks, failedCount: failed.length, failed }, null, 2));
  if (failed.length) process.exit(2);
}

main().catch((err) => {
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
