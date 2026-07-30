"use strict";

/**
 * Emits an <svg><use> reference into the site icon sprite.
 *
 * This replaces the Font Awesome 6.5.0 webfont, which the site used to pull as
 * a whole stylesheet from cdnjs.cloudflare.com (~102 KB of CSS plus up to three
 * woff2 files, ~300 KB) in order to render 22 glyphs. assets/icons/sprite.svg
 * carries exactly those 22 and nothing else.
 *
 * THE INVARIANT THIS MODULE EXISTS TO ENFORCE
 *
 *   A rendered <use> never names a symbol that is not in the sprite.
 *
 * A dangling <use href="#icon-nope"> is the worst possible failure here: it
 * throws nothing, logs nothing, and paints nothing, so a typo'd icon name would
 * reach production as a silent hole in the page. The registry is therefore not
 * a hand-maintained list that could drift from the sprite — it is parsed out of
 * the sprite itself at boot. If a name is not in that file, icon() returns the
 * empty string and the markup simply has no icon in it.
 *
 * WHY RETURNING NOTHING IS THE RIGHT DEGRADATION
 *
 * Icon names can arrive from outside the templates. server/homeSchema.js stores
 * an `iconClass` on solution/why cards, defaults it to "fa-solid fa-circle",
 * and the admin panel lets an editor type any string into that field, so the
 * database can hold arbitrary Font Awesome class names. (Nothing renders those
 * values today — see the note in homeSchema.js — but the field exists and the
 * data is real.) Such a value is not a name this sprite knows, and there is no
 * safe glyph to substitute: every icon on this site is decorative, sitting
 * beside text that already carries the meaning, so a wrong-but-visible glyph
 * would be worse than none. Rendering nothing cannot look broken.
 *
 * ACCESSIBILITY
 *
 * Decorative is the default, because every usage on the site is decorative:
 * each icon sits next to text, or inside a link that carries its own
 * aria-label. Those get aria-hidden="true" and no accessible name, which is
 * what the markup already asserted with `<i ... aria-hidden="true">`. Passing
 * `label` opts into the other case — role="img" plus an aria-label — for an
 * icon that is the only carrier of its meaning.
 */

const fs = require("fs");

const SYMBOL_RE = /<symbol\s+id="icon-([a-z0-9-]+)"\s+viewBox="([^"]+)"/g;

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {object} options
 * @param {string} options.spritePath Absolute path to the sprite on disk.
 * @param {string} options.spriteUrl  Public URL the <use> should point at.
 */
function createIconHelper({ spritePath, spriteUrl }) {
  // Read once at boot. The sprite is a committed static asset, so it cannot
  // change under a running process the way an uploaded image can.
  //
  // The viewBox is captured per icon because the rendered <svg> has to carry it
  // too, not just the <symbol>. An <svg> is not an <img>: CSS `width: auto`
  // does not fall back to an intrinsic aspect ratio, it falls back to the SVG
  // default of 100%, so a viewBox-less host with `height: 1em` renders one em
  // tall and as wide as its container. With the viewBox present the element has
  // a real intrinsic ratio and `height: 1em; width: auto` reproduces the
  // glyph's proportions exactly — which is why the sprite keeps Font Awesome's
  // original per-icon viewBox instead of normalising them all to a square.
  const viewBoxes = new Map();
  const sprite = fs.readFileSync(spritePath, "utf8");
  for (const match of sprite.matchAll(SYMBOL_RE)) {
    viewBoxes.set(match[1], match[2]);
  }
  if (viewBoxes.size === 0) {
    throw new Error(`Icon sprite at ${spritePath} defines no <symbol id="icon-*" viewBox="...">`);
  }

  /**
   * @param {string} name    Icon name, e.g. "bolt". Unknown names render nothing.
   * @param {object} [opts]
   * @param {string} [opts.className] Extra classes, appended after "icon".
   * @param {string} [opts.label]     Accessible name. Omit for decorative icons.
   * @returns {string} HTML, or "" when the name is not in the sprite.
   */
  function icon(name, opts = {}) {
    if (typeof name !== "string" || !viewBoxes.has(name)) return "";

    const className = opts.className ? `icon ${opts.className}` : "icon";
    const a11y = opts.label ? ` role="img" aria-label="${escapeAttr(opts.label)}"` : ` aria-hidden="true"`;

    return (
      `<svg class="${escapeAttr(className)}" viewBox="${escapeAttr(viewBoxes.get(name))}"${a11y}>` +
      `<use href="${escapeAttr(spriteUrl)}#icon-${name}"></use>` +
      `</svg>`
    );
  }

  icon.has = (name) => typeof name === "string" && viewBoxes.has(name);
  icon.names = () => [...viewBoxes.keys()].sort();

  return icon;
}

module.exports = { createIconHelper };
