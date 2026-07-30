"use strict";

/**
 * Admin authentication and API gating.
 *
 * The admin is seeded by server/db.js's opt-in DEFAULT_ADMIN_ENABLED path, which
 * runs inside migrate() at boot against this file's throwaway DB. That keeps the
 * credentials out of the repo's real database entirely.
 *
 * The subtests run in declaration order and share one cookie jar, so the login
 * -> authorised -> logout sequence at the bottom is deliberately ordered.
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");

const { startServer, REPO_ROOT_HAS_DOT_SEGMENT, SENDFILE_SKIP_REASON } = require("./helpers/server");

// /admin-login and the authenticated /admin both answer with res.sendFile(), which
// cannot work from a checkout path containing a dot-segment. See the comment on
// REPO_ROOT_HAS_DOT_SEGMENT in test/helpers/server.js.
const skipSendFile = REPO_ROOT_HAS_DOT_SEGMENT ? SENDFILE_SKIP_REASON : false;

const ADMIN_USERNAME = "test-admin";
const ADMIN_PASSWORD = "test-admin-password-9f2c";

/**
 * Every POST here must present a same-origin `Origin`, which is what a real
 * browser sends for the admin panel's fetch() calls. The /api CSRF guard
 * (server/middleware/csrf.js) rejects a state-changing request that presents no
 * origin at all, so omitting it would 403 before auth runs and this file would
 * test the guard instead of authentication. The guard itself is covered in
 * test/api.csrf.test.js.
 */
const sameOrigin = (srv, extra = {}) => ({ ...extra, headers: { origin: srv.origin } });

// Every admin API endpoint must refuse an anonymous caller with 401.
const ADMIN_API_ENDPOINTS = [
  "/api/posts",
  "/api/custom-pages",
  "/api/settings/analytics",
  "/api/settings/general",
  "/api/settings/page-seo",
  "/api/uploads/videos",
  "/api/track/stats/summary",
];

describe("admin auth", () => {
  let srv;

  before(async () => {
    srv = await startServer({
      label: "adminauth",
      env: {
        DEFAULT_ADMIN_ENABLED: "true",
        DEFAULT_ADMIN_USERNAME: ADMIN_USERNAME,
        DEFAULT_ADMIN_PASSWORD: ADMIN_PASSWORD,
      },
    });
  });

  after(async () => {
    await srv.stop();
  });

  it("GET /admin unauthenticated redirects (302) to /admin-login", async () => {
    const res = await srv.get("/admin", { redirect: "manual" });
    assert.equal(res.status, 302);
    assert.equal(String(res.headers.get("location") || ""), "/admin-login");
  });

  it("GET /admin-login returns 200", { skip: skipSendFile }, async () => {
    const res = await srv.get("/admin-login");
    assert.equal(res.status, 200);
  });

  it("GET /api/auth/me unauthenticated returns 200 { admin: null }", async () => {
    const res = await srv.get("/api/auth/me");
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { admin: null });
  });

  it("POST /api/auth/login with wrong credentials returns 401 INVALID_CREDENTIALS", async () => {
    const res = await srv.post(
      "/api/auth/login",
      { username: ADMIN_USERNAME, password: "wrong-password" },
      sameOrigin(srv)
    );
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: "INVALID_CREDENTIALS" });
  });

  it("POST /api/auth/login with missing fields returns 400 MISSING_FIELDS", async () => {
    const res = await srv.post("/api/auth/login", { username: ADMIN_USERNAME }, sameOrigin(srv));
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "MISSING_FIELDS" });
  });

  for (const endpoint of ADMIN_API_ENDPOINTS) {
    it(`GET ${endpoint} unauthenticated returns 401 UNAUTHORIZED`, async () => {
      const res = await srv.get(endpoint);
      assert.equal(res.status, 401, `expected ${endpoint} to be admin-gated`);
      assert.deepEqual(await res.json(), { error: "UNAUTHORIZED" });
    });
  }

  it("POST /api/auth/login with valid credentials returns { ok: true } and sets a session cookie", async () => {
    const res = await srv.post(
      "/api/auth/login",
      { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
      sameOrigin(srv, { jar: true })
    );
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.admin.username, ADMIN_USERNAME);

    // express-session's default cookie name here is atex.sid (server/config.js).
    assert.ok(srv.jar.has("atex.sid"), `expected an atex.sid session cookie, jar = ${[...srv.jar.keys()]}`);
  });

  it("GET /admin with the session cookie returns 200", { skip: skipSendFile }, async () => {
    const res = await srv.get("/admin", { jar: true, redirect: "manual" });
    assert.equal(res.status, 200);
  });

  it("GET /api/posts with the session cookie returns 200 (not 401)", async () => {
    const res = await srv.get("/api/posts", { jar: true });
    assert.equal(res.status, 200);
  });

  it("after POST /api/auth/logout, GET /admin redirects again", async () => {
    const logout = await srv.post("/api/auth/logout", {}, sameOrigin(srv, { jar: true }));
    assert.equal(logout.status, 200);
    assert.deepEqual(await logout.json(), { ok: true });

    const res = await srv.get("/admin", { jar: true, redirect: "manual" });
    assert.equal(res.status, 302);
    assert.equal(String(res.headers.get("location") || ""), "/admin-login");
  });
});
