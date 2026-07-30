"use strict";

/**
 * Guards the local SVG icon sprite that replaced Font Awesome.
 *
 * The public site used to pull the whole Font Awesome 6.5.0 stylesheet from
 * cdnjs.cloudflare.com — ~102 KB of CSS, which then fetched up to three woff2
 * files (~300 KB) — in order to draw 22 glyphs. Those glyphs now live in
 * assets/icons/sprite.svg and are rendered by the icon() helper.
 *
 * Four things can silently break that, and none of them throws:
 *
 *   1. A template asks for a name the sprite does not define. `<use>` resolves
 *      to nothing, paints nothing and logs nothing — a typo becomes an
 *      invisible hole in the page that no smoke test would notice.
 *   2. The sprite stops being well-formed XML. An SVG document with one
 *      unbalanced tag fails to parse *as a whole*, so a bad edit to one symbol
 *      takes out every icon on every page at once.
 *   3. The sprite stops being served. Same blast radius as (2), and the HTML
 *      still renders perfectly, so only a browser would show it.
 *   4. Someone re-adds a Font Awesome <link> or a cdnjs reference — a
 *      copy-paste from an old template, or an edit restoring the "familiar"
 *      head block. cdnjs is now absent from the CSP entirely, so the request
 *      would be blocked and the icons would be missing rather than duplicated.
 *
 * The licence assertion is not bookkeeping: the icons are Font Awesome Free
 * under CC BY 4.0, which requires attribution to be *kept with* the work.
 * Stripping the sprite's header comment is a licence violation, so it is a
 * test failure.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it, before, after } = require("node:test");

const { startServer, REPO_ROOT } = require("./helpers/server");
const { createIconHelper } = require("../server/utils/icon");

const SPRITE_PATH = path.join(REPO_ROOT, "assets", "icons", "sprite.svg");
const SPRITE_URL = "/assets/icons/sprite.svg";
const VIEWS_DIR = path.join(REPO_ROOT, "views");

/** Origins/vendors that must not appear in anything the server sends out. */
const BANNED_REFERENCES = ["cdnjs.cloudflare.com", "font-awesome", "fontawesome"];

/**
 * Everything the server sends to a browser. Mirrors the list in
 * fonts.selfhosted.test.js, and excludes tools/ for the same reason: those
 * emit standalone files opened from disk, never served by this app.
 */
function servedSources() {
  return [
    ...walkFiles(VIEWS_DIR, new Set([".ejs"])),
    ...walkFiles(path.join(REPO_ROOT, "admin"), new Set([".html", ".css", ".js"])),
    ...walkFiles(path.join(REPO_ROOT, "assets", "css"), new Set([".css"])),
    ...walkFiles(path.join(REPO_ROOT, "assets", "js"), new Set([".js"])),
  ];
}

function walkFiles(dir, exts, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(full, exts, out);
    else if (exts.has(path.extname(e.name))) out.push(full);
  }
  return out;
}

function rel(p) {
  return path.relative(REPO_ROOT, p).replace(/\\/g, "/");
}

/** Symbol ids defined by the sprite, without the "icon-" prefix. */
function spriteNames(source) {
  return new Set([...source.matchAll(/<symbol\s+id="icon-([a-z0-9-]+)"/g)].map((m) => m[1]));
}

/** Every icon('name') call in the templates, with the file it came from. */
function templateIconCalls() {
  const calls = [];
  for (const file of walkFiles(VIEWS_DIR, new Set([".ejs"]))) {
    const source = fs.readFileSync(file, "utf8");
    for (const m of source.matchAll(/\bicon\(\s*'([^']*)'/g)) {
      calls.push({ file: rel(file), name: m[1] });
    }
  }
  return calls;
}

/**
 * Minimal XML well-formedness check: every element is closed, in order, and no
 * bare "&" survives. Node ships no XML parser, and pulling one in for a single
 * assertion is not worth a production dependency — but tag balance and entity
 * escaping are exactly the two ways a hand-edited sprite stops parsing.
 * Returns an error string, or null when the document is well-formed.
 */
function xmlWellFormednessError(source) {
  const body = source.replace(/<\?[\s\S]*?\?>/g, "").replace(/<!--[\s\S]*?-->/g, "");

  if (/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#[0-9]+|#x[0-9a-fA-F]+);)/.test(body)) {
    return "contains an unescaped '&'";
  }

  const stack = [];
  const tagRe = /<(\/)?([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/)?>/g;
  let match;
  let consumed = 0;
  while ((match = tagRe.exec(body))) {
    // Anything between tags must be text, never a stray "<".
    if (body.slice(consumed, match.index).includes("<")) {
      return `stray '<' before ${match[0].slice(0, 40)}`;
    }
    consumed = tagRe.lastIndex;

    const [, closing, name, attrs, selfClosing] = match;
    if (attrs.includes("<")) return `stray '<' inside the <${name}> tag`;
    if (closing) {
      const open = stack.pop();
      if (open !== name) return `</${name}> closes <${open ?? "nothing"}>`;
    } else if (!selfClosing) {
      stack.push(name);
    }
  }
  if (body.slice(consumed).includes("<")) return "stray '<' after the last tag";
  if (stack.length) return `unclosed <${stack[stack.length - 1]}>`;
  return null;
}

const spriteSource = fs.readFileSync(SPRITE_PATH, "utf8");
const names = spriteNames(spriteSource);
const icon = createIconHelper({ spritePath: SPRITE_PATH, spriteUrl: SPRITE_URL });

describe("icon sprite — file", () => {
  it("is well-formed XML", () => {
    assert.equal(xmlWellFormednessError(spriteSource), null, "sprite.svg is not well-formed XML");
  });

  it("defines at least one symbol, and every symbol keeps a viewBox", () => {
    assert.ok(names.size > 0, "sprite defines no symbols");
    const symbols = [...spriteSource.matchAll(/<symbol\s+[^>]*>/g)].map((m) => m[0]);
    assert.equal(symbols.length, names.size, "every <symbol> must have an id of the form icon-<name>");
    for (const tag of symbols) {
      assert.match(tag, /viewBox="0 0 \d+ \d+"/, `symbol is missing its Font Awesome viewBox: ${tag}`);
    }
  });

  it("every symbol inherits colour, so existing CSS keeps working", () => {
    const paths = [...spriteSource.matchAll(/<path\b[^>]*>/g)].map((m) => m[0]);
    assert.ok(paths.length >= names.size, "expected at least one <path> per symbol");
    for (const p of paths) {
      assert.match(p, /fill="currentColor"/, `path does not inherit colour: ${p.slice(0, 80)}`);
    }
  });

  it("carries the CC BY 4.0 attribution Font Awesome Free requires", () => {
    const header = spriteSource.slice(0, spriteSource.indexOf("<svg"));
    assert.match(header, /Font Awesome Free 6\.5\.0/, "sprite must name the icon source and version");
    assert.match(header, /CC BY 4\.0/, "sprite must name the licence");
    assert.match(header, /Fonticons, Inc\./, "sprite must carry the copyright line");
  });
});

describe("icon sprite — template references", () => {
  const calls = templateIconCalls();

  it("the templates actually use the helper", () => {
    assert.ok(calls.length > 0, "no icon() calls found in views/ — did the helper get renamed?");
  });

  it("every name a template asks for is defined in the sprite", () => {
    const missing = calls.filter((c) => !names.has(c.name));
    assert.deepEqual(
      missing,
      [],
      `templates reference icons the sprite does not define: ${missing
        .map((m) => `${m.name} (${m.file})`)
        .join(", ")}`
    );
  });

  it("the sprite carries no glyph the templates never ask for", () => {
    // Not tidiness: the sprite is on the critical path for every page, and a
    // glyph nobody renders is weight everyone pays for.
    const used = new Set(calls.map((c) => c.name));
    const orphans = [...names].filter((n) => !used.has(n)).sort();
    assert.deepEqual(orphans, [], `sprite defines unused symbols: ${orphans.join(", ")}`);
  });

  it("no Font Awesome <i> tag survives in the templates", () => {
    for (const file of walkFiles(VIEWS_DIR, new Set([".ejs"]))) {
      const source = fs.readFileSync(file, "utf8");
      assert.ok(!/class="fa-/.test(source), `${rel(file)} still renders a Font Awesome <i> tag`);
    }
  });
});

describe("icon sprite — helper", () => {
  it("renders a decorative icon by default", () => {
    const html = icon("bolt");
    assert.match(html, /^<svg class="icon" viewBox="0 0 448 512" aria-hidden="true">/);
    assert.match(html, /<use href="\/assets\/icons\/sprite\.svg#icon-bolt"><\/use>/);
    assert.ok(!html.includes('role="img"'), "decorative icons must not claim role=img");
  });

  // Without a viewBox on the rendered element, CSS `width: auto` resolves to
  // the SVG default of 100% rather than the glyph's aspect ratio, and every
  // icon stretches to the width of its container. Measured in Chrome: a bolt
  // that should be 14px wide came out 300px. So the viewBox is not decoration —
  // it is what makes the sizing rule in styles.css work.
  it("carries the symbol's viewBox onto the rendered element", () => {
    const expected = {
      bolt: "0 0 448 512",
      "location-dot": "0 0 384 512",
      "plug-circle-bolt": "0 0 576 512",
    };
    for (const [name, viewBox] of Object.entries(expected)) {
      assert.ok(
        icon(name).includes(`viewBox="${viewBox}"`),
        `${name} must render with viewBox="${viewBox}", got: ${icon(name)}`
      );
    }
    for (const name of icon.names()) {
      assert.match(
        icon(name),
        /<svg class="[^"]*" viewBox="0 0 \d+ \d+"/,
        `${name} rendered without a viewBox`
      );
    }
  });

  it("names an icon when it is the only carrier of meaning", () => {
    const html = icon("phone", { label: "اتصال" });
    assert.match(html, /role="img"/);
    assert.match(html, /aria-label="اتصال"/);
    assert.ok(!html.includes("aria-hidden"), "a named icon must not also be hidden");
  });

  it("appends extra classes after the base class", () => {
    assert.match(icon("bolt", { className: "myThing__icon" }), /class="icon myThing__icon"/);
  });

  it("escapes attribute values", () => {
    assert.match(icon("bolt", { label: 'a"b<c&d' }), /aria-label="a&quot;b&lt;c&amp;d"/);
  });

  // The degradation contract. An icon name can arrive from the database:
  // server/homeSchema.js stores an `iconClass` on solution/why cards, defaults
  // it to "fa-solid fa-circle", and the admin panel lets an editor type any
  // string in. None of those are sprite names, and a dangling <use> would paint
  // nothing while looking like working markup — so the helper emits no element
  // at all, which cannot render broken.
  it("renders nothing for an unknown or malformed name, and never throws", () => {
    const junk = [
      "fa-solid fa-circle", // the homeSchema.js default, verbatim
      "fa-solid fa-truck-fast", // a real stored value
      "circle", // a bare FA name the sprite does not carry
      "definitely-not-an-icon",
      "",
      "  ",
      "../../etc/passwd",
      '"><script>alert(1)</script>',
      null,
      undefined,
      42,
      {},
      [],
    ];
    for (const value of junk) {
      let html;
      assert.doesNotThrow(
        () => {
          html = icon(value);
        },
        `icon(${JSON.stringify(value)}) threw`
      );
      assert.equal(html, "", `icon(${JSON.stringify(value)}) should render nothing, got: ${html}`);
    }
  });

  it("reports which names it knows", () => {
    assert.equal(icon.has("bolt"), true);
    assert.equal(icon.has("fa-solid fa-circle"), false);
    assert.deepEqual(icon.names(), [...names].sort());
  });
});

describe("icon sprite — served", () => {
  let srv;
  before(async () => {
    srv = await startServer();
  });
  after(async () => {
    await srv.stop();
  });

  it("GET /assets/icons/sprite.svg returns 200 as SVG", async () => {
    // If this 404s, every icon on the site vanishes and nothing else breaks.
    const res = await srv.get(SPRITE_URL);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") || "", /image\/svg\+xml/);
    const body = await res.text();
    assert.ok(body.includes('id="icon-bolt"'), "served sprite is missing its symbols");
  });

  it("rendered pages reference the sprite and no CDN", async () => {
    for (const route of ["/", "/contact-us", "/this-route-does-not-exist"]) {
      const res = await srv.get(route);
      const html = await res.text();
      for (const banned of BANNED_REFERENCES) {
        assert.ok(!html.toLowerCase().includes(banned), `${route} still references ${banned}`);
      }
      assert.ok(
        html.includes("/assets/icons/sprite.svg"),
        `${route} renders no icons at all — expected at least one sprite reference`
      );
      assert.ok(!html.includes('class="fa-'), `${route} still emits a Font Awesome <i> tag`);
    }
  });

  it("no served source file references Font Awesome or cdnjs", () => {
    for (const file of servedSources()) {
      const source = fs.readFileSync(file, "utf8").toLowerCase();
      for (const banned of BANNED_REFERENCES) {
        assert.ok(!source.includes(banned), `${rel(file)} references ${banned}`);
      }
    }
  });
});
