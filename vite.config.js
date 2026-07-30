"use strict";

/**
 * Vite — asset build tool ONLY.
 *
 * This project is an Express + EJS server that renders its own HTML. Vite is
 * here to hash and minify three static files and nothing else: no framework,
 * no dev server, no middleware mode. `npm start` stays exactly
 * `node server/app.js`, one process, and the app boots and serves correctly
 * whether or not this build has ever been run (server/utils/assets.js falls
 * back to the unhashed /assets/... ?v= paths when there is no manifest).
 *
 * Written in CommonJS because package.json declares "type": "commonjs".
 * Nothing is imported from "vite" — defineConfig is a types-only convenience —
 * which keeps this file loadable no matter how Vite ships its own entry point,
 * and lets test/assets.build.test.js require() it and override outDir.
 *
 * Contract with the server (server/utils/assets.js):
 *   - output lands in assets/build/
 *   - the manifest lands in assets/build/.vite/manifest.json
 *   - manifest keys are the source paths listed under `input`, POSIX-relative
 *     to this file
 *   - the helper prepends BUILD_BASE ("/assets/build/") to manifest `file`
 *     values; see the `base` note below for why the helper does that and not
 *     Vite.
 */

const path = require("node:path");

const ROOT = __dirname;
const r = (p) => path.resolve(ROOT, p);

/** POSIX-normalised absolute path, for comparing against Rollup module ids. */
const norm = (p) => path.resolve(p).split(path.sep).join("/");

/**
 * The two JS entries, normalised for identity comparison in the plugin below.
 */
const JS_ENTRY_IDS = new Set([norm(r("assets/js/main.js")), norm(r("assets/js/consent.js"))]);

/**
 * Marks the two script entries as ES modules.
 *
 * Why this is needed, and why it is not cosmetic:
 *
 * package.json says "type": "commonjs" (the server is CJS), so Rolldown
 * classifies every ambiguous .js file under this root as CommonJS. It then
 * wraps each entry in a lazy CJS initialiser and hoists the shared helper into
 * a `rolldown-runtime-<hash>.js` chunk, which each entry pulls in with a real
 * `import` statement. That is fatal for consent.js: it is loaded as a CLASSIC
 * `defer` script, and a classic script containing `import` is an immediate
 * SyntaxError — the page-view beacon would simply stop firing, silently, in
 * built mode only.
 *
 * Appending `export {};` makes the two files unambiguously ESM. Neither
 * exports anything, so Rolldown drops the empty export from the emitted chunk:
 * the output is the bare IIFE/statement list, with no import and no export,
 * which is valid BOTH as a classic script and as a module. That is what lets
 * consent.js keep `defer` and main.js keep `type="module"`.
 *
 * The text is appended at the very end, so every original character keeps its
 * original line/column and the sourcemap Rolldown generates stays accurate.
 */
function markEntriesAsEsm() {
  return {
    name: "atex-mark-entries-as-esm",
    transform(code, id) {
      if (!JS_ENTRY_IDS.has(norm(id.split("?")[0]))) return null;
      return { code: `${code}\nexport {};\n`, map: null };
    },
  };
}

module.exports = {
  root: ROOT,

  /**
   * base MUST stay "/" — do not set it to "/assets/build/".
   *
   * Verified empirically against vite 8.2.0 (see test/assets.build.test.js,
   * "font url() paths survive the build unrewritten"):
   *
   *   - With base "/assets/build/", Vite rewrites every root-absolute url() in
   *     the stylesheet to "/assets/build/assets/fonts/cairo/...woff2", which
   *     404s. Every Arabic glyph on the site would silently fall back to a
   *     system font.
   *   - With publicDir unset (false), it is worse: Vite treats
   *     /assets/fonts/*.woff2 as buildable assets, copies all nine woff2 files
   *     plus the hero poster into assets/build/ under hashed names, and
   *     rewrites the url()s to point at the copies. The fonts would still
   *     render, but they would be duplicated, they would lose the 1y-immutable
   *     /assets/fonts mount, and the <link rel="preload"> for the Cairo Arabic
   *     subset in views/partials/head.ejs would preload a file the stylesheet
   *     no longer requests — a wasted download on every first paint.
   *
   * publicDir: ROOT tells Vite that a leading "/" already means "a URL this
   * server serves", so it leaves those url()s exactly as written; base "/"
   * then leaves them un-prefixed. The /assets/build/ prefix for the emitted
   * files is applied by server/utils/assets.js, which is the one place that
   * already maps manifest entries to URLs.
   */
  base: "/",

  /**
   * The repo root doubles as Vite's publicDir purely so root-absolute url()s
   * resolve as public URLs (see above). copyPublicDir: false stops Vite from
   * copying the whole checkout into assets/build/.
   */
  publicDir: ROOT,

  plugins: [markEntriesAsEsm()],

  /**
   * No Vite dev server anywhere in this project. The Express app already
   * listens on 5173 by default (server/config.js), which is also Vite's
   * default port. `npm run build:watch` uses `vite build --watch` instead.
   */
  build: {
    outDir: "assets/build",
    // Flat output: /assets/build/main-<hash>.js, not /assets/build/assets/...
    assetsDir: ".",
    copyPublicDir: false,
    emptyOutDir: true,
    manifest: true,
    sourcemap: true,

    /**
     * CRITICAL — do not raise this.
     *
     * The default (4096) lets Vite inline small emitted assets as data: URIs.
     * The CSP in server/config.js has font-src 'self' https://cdn.jsdelivr.net
     * with no `data:`, so an inlined font would be blocked outright. Zero
     * means nothing is ever inlined and no CSP directive has to move.
     */
    assetsInlineLimit: 0,

    rollupOptions: {
      input: {
        // Keys become [name] in the output filenames.
        styles: r("assets/css/styles.css"),
        main: r("assets/js/main.js"),

        /**
         * consent.js is a SEPARATE entry, deliberately.
         *
         * It is a self-contained IIFE that posts the page-view beacon, loaded
         * today as a classic `defer` script ahead of main.js. Folding it into
         * main.js would couple analytics delivery to a 19 KB UI bundle (one
         * parse error in the UI code and tracking stops), and would move its
         * execution slot relative to the inline footer script. As its own
         * entry it keeps its own tag, its own attributes and its own place in
         * document order, so built mode is indistinguishable from source mode.
         */
        consent: r("assets/js/consent.js"),
      },
      output: {
        entryFileNames: "[name]-[hash].js",
        chunkFileNames: "[name]-[hash].js",
        assetFileNames: "[name]-[hash][extname]",
      },
    },
  },

  /**
   * Nothing here imports a bare specifier — main.js and consent.js import
   * nothing at all — so there is no dependency graph to pre-bundle.
   */
  optimizeDeps: {
    noDiscovery: true,
    include: [],
  },
};
