"use strict";

/**
 * Extract FAQ pairs out of an already-sanitized blog post body so the blog post
 * route can emit a schema.org FAQPage node (server/routes/pages.js).
 *
 * MARKUP CONTRACT (what an article author must write)
 *
 *     <section class="artFaq" id="faq">
 *       <h2>الأسئلة الشائعة</h2>
 *       <div class="artFaq__item">
 *         <h3 class="artFaq__q">سؤال؟</h3>
 *         <div class="artFaq__a"><p>جواب…</p></div>
 *       </div>
 *       …
 *     </section>
 *
 * Only two things are load-bearing for extraction:
 *   - an element carrying the class `artFaq__q` — its text is the question;
 *   - the FIRST element carrying the class `artFaq__a` that starts after that
 *     question's closing tag — its text is the answer.
 * The `<section class="artFaq">` wrapper, the `artFaq__item` wrapper, the `id`
 * and the heading levels are for CSS/anchors only; extraction ignores them. Tag
 * names are free (h3/p/div/strong…), extra classes are allowed, and the two
 * classes may appear in any element that survives sanitizePostHtml.
 *
 * WHY REGEX AND NOT A PARSER
 * The project has no direct HTML-parser dependency (package.json ships
 * `sanitize-html`, whose htmlparser2 is transitive and must not be reached into).
 * The input is not arbitrary web HTML: it has already been through
 * sanitizePostHtml, which normalises tags and drops anything exotic. A scoped
 * scanner over two distinctive class names is enough, so no dependency is added.
 *
 * GUARANTEES
 *  - Never throws. Anything malformed yields fewer pairs, or [].
 *  - Answers are returned as plain text: tags stripped, entities decoded,
 *    whitespace collapsed.
 *  - At most MAX_FAQ_ITEMS pairs, so a pathological body cannot blow up the
 *    JSON-LD or the render.
 */

// Google ignores FAQPage entries beyond a couple of dozen anyway; the cap exists
// to bound work and output size on hostile or accidental input.
const MAX_FAQ_ITEMS = 20;

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * Decode the entity set sanitize-html can emit, in a single pass so that an
 * encoded entity (`&amp;lt;`) decodes once to `&lt;` and not twice to `<`.
 */
function decodeEntities(text) {
  return text.replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? match : named;
  });
}

/** Inner HTML -> plain text. Tags go first so `&lt;b&gt;` survives as text. */
function htmlToText(html) {
  return decodeEntities(String(html).replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * From just past an opening tag, return the inner HTML up to its matching close
 * tag, counting nested same-name tags. Returns null when the element is never
 * closed (unbalanced markup) so the caller can drop that item.
 */
function readInnerHtml(html, tagName, contentStart) {
  const scanner = new RegExp(`<(/?)${tagName}\\b([^>]*)>`, "gi");
  scanner.lastIndex = contentStart;
  let depth = 1;
  let match;
  while ((match = scanner.exec(html)) !== null) {
    const isClosing = match[1] === "/";
    const isSelfClosing = !isClosing && /\/\s*$/.test(match[2]);
    if (isSelfClosing) continue;
    depth += isClosing ? -1 : 1;
    if (depth === 0) return html.slice(contentStart, match.index);
  }
  return null;
}

/**
 * Every element whose class list contains `marker`, in document order, as
 * `{ start, end, inner }` offsets. Elements that are never closed are skipped.
 */
function findMarkedElements(html, marker, limit) {
  const opener = new RegExp(
    `<([a-z][a-z0-9]*)\\b[^>]*\\sclass\\s*=\\s*("|')([^"']*\\b${marker}\\b[^"']*)\\2[^>]*>`,
    "gi"
  );
  const found = [];
  let match;
  while (found.length < limit && (match = opener.exec(html)) !== null) {
    const contentStart = match.index + match[0].length;
    const inner = readInnerHtml(html, match[1], contentStart);
    if (inner === null) continue;
    found.push({ start: match.index, end: contentStart + inner.length, inner });
  }
  return found;
}

/**
 * @param {string} html Sanitized post body.
 * @returns {Array<{question: string, answer: string}>} Empty when there is no
 *   usable FAQ block — the caller then omits the FAQPage node entirely.
 */
function extractFaqFromHtml(html) {
  if (typeof html !== "string" || !html.includes("artFaq__q")) return [];

  try {
    const questions = findMarkedElements(html, "artFaq__q", MAX_FAQ_ITEMS);
    const answers = findMarkedElements(html, "artFaq__a", MAX_FAQ_ITEMS);

    const pairs = [];
    let answerIndex = 0;
    for (const question of questions) {
      // An answer belongs to a question only if it starts after it closes; that
      // single rule survives missing items, stray markers and reordering.
      while (answerIndex < answers.length && answers[answerIndex].start < question.end) answerIndex++;
      if (answerIndex >= answers.length) break;

      const q = htmlToText(question.inner);
      const a = htmlToText(answers[answerIndex].inner);
      answerIndex++;
      if (q && a) pairs.push({ question: q, answer: a });
    }
    return pairs;
  } catch {
    return [];
  }
}

module.exports = {
  extractFaqFromHtml,
  MAX_FAQ_ITEMS,
};
