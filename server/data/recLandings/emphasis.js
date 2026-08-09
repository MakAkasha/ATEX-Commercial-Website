"use strict";

/**
 * Splits a sentence around the one phrase that should render bold.
 *
 * The source landing pages carried inline <strong> inside body copy ("تباع
 * أسرع بنسبة <strong>20%</strong>"). Storing that as raw HTML in a data module
 * would mean rendering it with EJS's unescaped `<%- %>`, which is a habit worth
 * not starting in a file that is edited for copy rather than for code.
 *
 * So the data stores plain text plus the substring to emphasise, and this turns
 * it into three escapable pieces. The partial renders each with `<%= %>`.
 *
 * A needle that is absent (or empty) yields the whole string as `before`, so a
 * copy edit that drops the emphasised phrase degrades to unemphasised text
 * rather than throwing or silently losing the sentence.
 *
 * @param {string} text
 * @param {string} [needle]
 * @returns {{before: string, em: string, after: string}}
 */
function withEmphasis(text, needle) {
  const full = String(text || "");
  const phrase = String(needle || "");
  if (!phrase) return { before: full, em: "", after: "" };

  const at = full.indexOf(phrase);
  if (at === -1) return { before: full, em: "", after: "" };

  return {
    before: full.slice(0, at),
    em: phrase,
    after: full.slice(at + phrase.length),
  };
}

module.exports = { withEmphasis };
