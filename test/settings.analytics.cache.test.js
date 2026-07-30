"use strict";

/**
 * Regression gate for the analytics settings TTL cache.
 *
 * `loadAnalyticsSettings()` in server/routes/settings.js is memoized with a 60s
 * TTL because `baseRenderData()` calls it on every single page render. A cache
 * without invalidation would mean an admin saving analytics settings sees no
 * effect for up to a minute — and, worse, the site keeps emitting the OLD
 * tracking tags in that window.
 *
 * These tests pin the invalidation contract:
 *   1. The cache is warm before the write (both the admin read and a page
 *      render are exercised first, so a stale entry definitely exists).
 *   2. A PUT via the admin API must be visible on the very next read.
 *   3. It must be visible to the *page render* path too, not just to the API
 *      route that performed the write.
 *
 * The env-override branch of loadAnalyticsSettings() is deliberately disabled
 * here (all analytics env vars blanked), so this exercises the DB path that the
 * cache actually guards.
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");

const { startServer } = require("./helpers/server");

const ADMIN_USERNAME = "test-admin";
const ADMIN_PASSWORD = "test-admin-password-9f2c";

// Valid per ANALYTICS_FORMATS.gaMeasurementId (/^G-[A-Z0-9]+$/i) in settings.js.
const FIRST_GA_ID = "G-CACHEWARM01";
const SECOND_GA_ID = "G-CACHEBUST02";

describe("analytics settings cache invalidation", () => {
  let srv;

  before(async () => {
    srv = await startServer({
      label: "analyticscache",
      env: {
        DEFAULT_ADMIN_ENABLED: "true",
        DEFAULT_ADMIN_USERNAME: ADMIN_USERNAME,
        DEFAULT_ADMIN_PASSWORD: ADMIN_PASSWORD,
        // Blank every analytics env var so envAnalyticsOverride() returns null
        // and loadAnalyticsSettings() reads purely from SQLite — the path the
        // TTL cache sits in front of.
        ANALYTICS_ENABLED: "",
        GA_MEASUREMENT_ID: "",
        GTM_CONTAINER_ID: "",
        METRICOOL_HASH: "",
        TIKTOK_PIXEL_ID: "",
      },
    });

    const login = await srv.post(
      "/api/auth/login",
      { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
      { headers: { origin: srv.origin }, jar: true }
    );
    assert.equal(login.status, 200, `admin login failed: ${await login.text()}`);
  });

  after(async () => {
    await srv.stop();
  });

  /** PUT with the session cookie + same-origin header (the harness only has get/post). */
  async function putAnalytics(body) {
    const cookie = [...srv.jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    return fetch(`${srv.origin}/api/settings/analytics`, {
      method: "PUT",
      headers: { "content-type": "application/json", origin: srv.origin, cookie },
      body: JSON.stringify(body),
      redirect: "manual",
    });
  }

  async function readAnalytics() {
    const res = await srv.get("/api/settings/analytics", { jar: true });
    // Read the body exactly once — a template-literal assert message would
    // consume it before the JSON parse below ever runs.
    const raw = await res.text();
    assert.equal(res.status, 200, `admin analytics read failed: ${raw}`);
    return JSON.parse(raw).settings;
  }

  it("a saved measurement id is visible on the very next admin read", async () => {
    // Warm the cache with the pre-write value.
    const before = await readAnalytics();
    assert.equal(before.source, "db", "expected the DB path, not the env override");
    assert.notEqual(before.gaMeasurementId, FIRST_GA_ID);

    const put = await putAnalytics({ enabled: true, gaMeasurementId: FIRST_GA_ID });
    assert.equal(put.status, 200, `PUT failed: ${await put.text()}`);

    // No sleep: if saveAnalyticsSettings() forgot .bust(), this read would still
    // return the pre-write value for the rest of the 60s TTL.
    const after = await readAnalytics();
    assert.equal(after.gaMeasurementId, FIRST_GA_ID);
    assert.equal(after.enabled, true);
  });

  it("a saved measurement id is visible to the page-render path immediately", async () => {
    // Warm the render-path cache entry with FIRST_GA_ID from the test above.
    const warm = await srv.get("/");
    assert.equal(warm.status, 200);
    const warmHtml = await warm.text();
    assert.ok(
      warmHtml.includes(FIRST_GA_ID),
      "expected the homepage to emit the currently-saved GA id before the second write"
    );

    const put = await putAnalytics({ enabled: true, gaMeasurementId: SECOND_GA_ID });
    assert.equal(put.status, 200, `PUT failed: ${await put.text()}`);

    const res = await srv.get("/");
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes(SECOND_GA_ID), "page render served a stale analytics id after save");
    assert.ok(!html.includes(FIRST_GA_ID), "page render still emits the superseded analytics id");
  });

  it("the public analytics read does not corrupt the cached object", async () => {
    // GET /api/settings/public/analytics strips `source` before responding. If it
    // stripped it from the memoized object itself, every later admin read would
    // silently lose the field.
    const pub = await srv.get("/api/settings/public/analytics");
    assert.equal(pub.status, 200);
    const pubSettings = JSON.parse(await pub.text()).settings;
    assert.equal(pubSettings.source, undefined, "public endpoint must not expose `source`");

    const admin = await readAnalytics();
    assert.equal(admin.source, "db", "`source` was deleted from the shared cache entry");
  });
});
