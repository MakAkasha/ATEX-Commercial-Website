"use strict";

/**
 * The self-hosted TinyMCE mount.
 *
 * The admin blog editor used to load TinyMCE 6.8.2 from cdnjs.cloudflare.com —
 * a third-party script tag, with no Subresource Integrity, running inside an
 * authenticated admin session. Meanwhile package.json already declared
 * `tinymce` as a production dependency and server/app.js already served it at
 * /vendor/tinymce, and nothing used that mount.
 *
 * This file locks down the fix: the editor loads from our own origin, and every
 * asset TinyMCE fetches at runtime resolves through the mount. The main script
 * returning 200 is the easy half; the skin, theme, model, icon and plugin files
 * are fetched later, relative to the script's own location, and are how a
 * self-hosting change silently half-works — a toolbar-less, unstyled editor.
 *
 * The runtime paths below are not guesses. They come from
 * node_modules/tinymce/themes/silver/theme.js (`getSkinUrl` builds
 * `baseURL + '/skins/ui/' + skin`, and `determineCSSDecision` appends
 * `/${filenameBase}${suffix}.css`) and from the plugin/theme/model loader in
 * core, which resolve `<base_url>/<kind>/<name>/<file><suffix>.js`.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it, before, after } = require("node:test");

const { startServer, REPO_ROOT } = require("./helpers/server");

const ADMIN_HTML = path.join(REPO_ROOT, "admin", "admin.html");
const ADMIN_JS = path.join(REPO_ROOT, "admin", "admin.js");

const MOUNT = "/vendor/tinymce";

/**
 * Assets TinyMCE 8 requests after the main script runs, with `suffix: ".min"`
 * and the default `skin` (oxide), `content_css` (default), theme (silver),
 * model (dom) and icon pack (default).
 */
const RUNTIME_ASSETS = [
  { url: `${MOUNT}/tinymce.min.js`, type: /javascript/ },
  { url: `${MOUNT}/themes/silver/theme.min.js`, type: /javascript/ },
  { url: `${MOUNT}/models/dom/model.min.js`, type: /javascript/ },
  { url: `${MOUNT}/icons/default/icons.min.js`, type: /javascript/ },
  { url: `${MOUNT}/skins/ui/oxide/skin.min.css`, type: /text\/css/ },
  { url: `${MOUNT}/skins/ui/oxide/content.min.css`, type: /text\/css/ },
  { url: `${MOUNT}/skins/content/default/content.min.css`, type: /text\/css/ },
];

/**
 * Read the plugin list straight out of the editor config instead of hardcoding
 * it. If someone adds a plugin to admin.js and it is not in the npm package,
 * this test fails rather than the editor failing in the client's browser.
 */
function pluginsFromAdminJs() {
  const src = fs.readFileSync(ADMIN_JS, "utf8");
  const match = src.match(/plugins:\s*"([^"]+)"/);
  assert.ok(match, "could not find the TinyMCE `plugins:` list in admin/admin.js");
  return match[1].split(/\s+/).filter(Boolean);
}

describe("self-hosted TinyMCE (/vendor/tinymce)", () => {
  let srv;

  before(async () => {
    srv = await startServer({ label: "tinymce" });
  });

  after(async () => {
    await srv.stop();
  });

  // ---- the source of the change ------------------------------------------

  it("admin.html loads TinyMCE from /vendor/tinymce, not from a CDN", () => {
    const html = fs.readFileSync(ADMIN_HTML, "utf8");

    assert.ok(
      html.includes(`${MOUNT}/tinymce.min.js`),
      "admin.html must load the self-hosted TinyMCE build"
    );
    assert.ok(
      !/cdnjs\.cloudflare\.com/.test(html),
      "admin.html must not reference cdnjs — the whole point of this mount"
    );
    assert.ok(
      !/<script[^>]+src="https?:\/\/[^"]*tinymce/i.test(html),
      "no TinyMCE script may be loaded from any third-party origin"
    );
  });

  it("the editor config pins base_url to the mount", () => {
    const src = fs.readFileSync(ADMIN_JS, "utf8");
    assert.ok(
      new RegExp(`base_url:\\s*"${MOUNT}"`).test(src),
      `admin.js must set base_url: "${MOUNT}" so runtime assets resolve through the mount`
    );
    assert.ok(/suffix:\s*"\.min"/.test(src), 'admin.js must set suffix: ".min"');
  });

  // ---- the mount actually serves the bytes --------------------------------

  for (const asset of RUNTIME_ASSETS) {
    it(`GET ${asset.url} returns 200 with the right content-type`, async () => {
      const res = await srv.get(asset.url);
      assert.equal(res.status, 200, `${asset.url} did not resolve through the mount`);

      const contentType = String(res.headers.get("content-type") || "");
      assert.match(contentType, asset.type, `${asset.url} served as "${contentType}"`);

      const body = await res.text();
      assert.ok(body.length > 0, `${asset.url} served an empty body`);
    });
  }

  it("every plugin named in the editor config resolves through the mount", async () => {
    const plugins = pluginsFromAdminJs();
    assert.ok(plugins.length > 0, "expected at least one configured plugin");

    for (const plugin of plugins) {
      const url = `${MOUNT}/plugins/${plugin}/plugin.min.js`;
      const res = await srv.get(url);
      assert.equal(
        res.status,
        200,
        `plugin "${plugin}" is configured in admin.js but ${url} returned ${res.status}`
      );
      assert.match(String(res.headers.get("content-type") || ""), /javascript/);
    }
  });

  it("serves the version of TinyMCE that package.json depends on", async () => {
    const declared = require("../package.json").dependencies.tinymce;
    const installedMajor = require("tinymce/package.json").version.split(".")[0];

    assert.ok(
      declared.includes(installedMajor),
      `package.json depends on tinymce ${declared} but the served copy is ${installedMajor}.x`
    );

    const res = await srv.get(`${MOUNT}/package.json`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).version.split(".")[0], installedMajor);
  });

  // ---- auth posture -------------------------------------------------------

  /**
   * The mount sits ABOVE the requireAdminPage gate in server/app.js and under
   * its own /vendor prefix, so it is anonymous. That is deliberate and matches
   * what a CDN did before: TinyMCE is public GPL code with no session data in
   * it, and gating it would only add a session lookup to every editor asset.
   *
   * Asserted rather than assumed so that if someone later moves the mount
   * behind the gate, they do it knowingly — a gated editor asset would break
   * nothing today, but a *future* public page embedding the editor would fail.
   */
  it("is reachable without an admin session (same posture as the old CDN)", async () => {
    const res = await srv.get(`${MOUNT}/tinymce.min.js`, { redirect: "manual" });
    assert.equal(res.status, 200);
  });

  it("does not expose anything outside the tinymce package", async () => {
    for (const probe of [
      "/vendor/tinymce/../../server/config.js",
      "/vendor/tinymce/../express/package.json",
      "/vendor/tinymce/%2e%2e/express/package.json",
    ]) {
      const res = await srv.get(probe, { redirect: "manual" });
      assert.notEqual(res.status, 200, `${probe} escaped the mount root`);
    }
  });
});
