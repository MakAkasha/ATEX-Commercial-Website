"use strict";

/**
 * The custom-pages CMS must refuse the slugs the /rec landing routes own.
 *
 * server/routes/pages.js registers /rec/smart-home and /rec/smart-villa as
 * hardcoded routes ahead of the /rec/:slug custom-pages handler. Without this
 * guard an admin could create a custom page at one of those slugs, get an
 * `{ok:true}`, see it listed in the panel — and have the public URL keep
 * rendering the landing page. Forever, with nothing anywhere reporting a
 * problem. A 409 at save time is the whole fix.
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");

const { startServer } = require("./helpers/server");
const { getRecLandings } = require("../server/data/contentRegistry");

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "test-admin-password-9f2c";

const RESERVED = getRecLandings().map((page) => page.slug);

// The CSRF guard (server/middleware/csrf.js) fails closed on a missing Origin,
// so every state-changing call here has to present one.
const sameOrigin = (srv, extra = {}) => ({ ...extra, headers: { origin: srv.origin } });

describe("custom pages reject the /rec landing slugs", () => {
  let srv;

  // The shared helper has no put(), and this is the only test that needs one.
  async function put(urlPath, body) {
    const cookie = [...srv.jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    return fetch(`${srv.origin}${urlPath}`, {
      method: "PUT",
      headers: { "content-type": "application/json", origin: srv.origin, cookie },
      body: JSON.stringify(body),
      redirect: "manual",
    });
  }

  before(async () => {
    srv = await startServer({
      label: "reserved-slugs",
      env: {
        DEFAULT_ADMIN_ENABLED: "true",
        DEFAULT_ADMIN_USERNAME: ADMIN_USERNAME,
        DEFAULT_ADMIN_PASSWORD: ADMIN_PASSWORD,
      },
    });
    const res = await srv.post(
      "/api/auth/login",
      { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
      sameOrigin(srv, { jar: true })
    );
    assert.equal(res.status, 200, "test setup: admin login should succeed");
  });

  after(async () => {
    await srv.stop();
  });

  for (const slug of RESERVED) {
    it(`POST /api/custom-pages refuses slug "${slug}" with 409 SLUG_RESERVED`, async () => {
      const res = await srv.post(
        "/api/custom-pages",
        { title: "محاولة", slug, html_code: "<p>x</p>" },
        sameOrigin(srv, { jar: true })
      );
      assert.equal(res.status, 409);
      assert.equal((await res.json()).error, "SLUG_RESERVED");
    });
  }

  it("still accepts an ordinary slug", async () => {
    const res = await srv.post(
      "/api/custom-pages",
      { title: "صفحة عادية", slug: "an-ordinary-page", html_code: "<p>x</p>" },
      sameOrigin(srv, { jar: true })
    );
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, true);
  });

  it("PUT /api/custom-pages/:id refuses renaming an existing page onto a reserved slug", async () => {
    const created = await srv.post(
      "/api/custom-pages",
      { title: "قابلة للتعديل", slug: "renameable-page", html_code: "<p>x</p>" },
      sameOrigin(srv, { jar: true })
    );
    const { id } = await created.json();

    const res = await put(`/api/custom-pages/${id}`, {
      title: "قابلة للتعديل",
      slug: RESERVED[0],
      html_code: "<p>x</p>",
    });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error, "SLUG_RESERVED");
  });
});
