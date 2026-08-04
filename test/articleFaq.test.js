"use strict";

/**
 * Pure-function tests for the FAQ extractor that feeds the blog post FAQPage
 * JSON-LD node. No server, no database.
 *
 * The markup contract under test is documented in server/utils/articleFaq.js.
 */

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { extractFaqFromHtml, MAX_FAQ_ITEMS } = require("../server/utils/articleFaq");

/** Build the canonical article FAQ block from [question, answerHtml] pairs. */
function faqSection(pairs) {
  const items = pairs
    .map(
      ([q, a]) =>
        `<div class="artFaq__item"><h3 class="artFaq__q">${q}</h3><div class="artFaq__a">${a}</div></div>`
    )
    .join("");
  return `<section class="artFaq" id="faq"><h2>الأسئلة الشائعة</h2>${items}</section>`;
}

describe("extractFaqFromHtml", () => {
  it("extracts three question/answer pairs in document order", () => {
    const html =
      "<h2>مقدمة</h2><p>نص</p>" +
      faqSection([
        ["ما هو النظام الذكي؟", "<p>منظومة متكاملة.</p>"],
        ["كم تكلفة التركيب؟", "<p>تعتمد على المساحة.</p>"],
        ["هل يعمل بدون إنترنت؟", "<p>نعم، محلياً.</p>"],
      ]);

    assert.deepEqual(extractFaqFromHtml(html), [
      { question: "ما هو النظام الذكي؟", answer: "منظومة متكاملة." },
      { question: "كم تكلفة التركيب؟", answer: "تعتمد على المساحة." },
      { question: "هل يعمل بدون إنترنت؟", answer: "نعم، محلياً." },
    ]);
  });

  it("returns [] when the body has no FAQ block", () => {
    const html = "<h2>عنوان</h2><p>فقرة</p><ul><li>عنصر</li></ul>";
    assert.deepEqual(extractFaqFromHtml(html), []);
  });

  it("returns [] for an empty string and for non-string input", () => {
    assert.deepEqual(extractFaqFromHtml(""), []);
    assert.deepEqual(extractFaqFromHtml(null), []);
    assert.deepEqual(extractFaqFromHtml(undefined), []);
    assert.deepEqual(extractFaqFromHtml(42), []);
    assert.deepEqual(extractFaqFromHtml({ artFaq__q: true }), []);
  });

  it("drops items whose question or answer element is never closed", () => {
    const html =
      '<section class="artFaq">' +
      '<div class="artFaq__item"><h3 class="artFaq__q">سؤال سليم؟</h3><div class="artFaq__a"><p>جواب سليم.</p></div></div>' +
      '<div class="artFaq__item"><h3 class="artFaq__q">سؤال بلا إغلاق؟<div class="artFaq__a"><p>جواب معلق.</p>';

    assert.deepEqual(extractFaqFromHtml(html), [{ question: "سؤال سليم؟", answer: "جواب سليم." }]);
  });

  it("returns [] when every marker is malformed", () => {
    assert.deepEqual(extractFaqFromHtml('<h3 class="artFaq__q">سؤال معلق؟'), []);
  });

  it("strips HTML inside answers down to plain text and collapses whitespace", () => {
    const html = faqSection([
      [
        "ما المكونات؟",
        '<p>لوحة <strong>تحكم</strong> و<a href="https://atex.sa">حساسات</a></p>\n  <ul>\n    <li>مفاتيح</li>\n    <li>كاميرات</li>\n  </ul>',
      ],
    ]);

    assert.deepEqual(extractFaqFromHtml(html), [
      { question: "ما المكونات؟", answer: "لوحة تحكم و حساسات مفاتيح كاميرات" },
    ]);
  });

  it("keeps a nested same-tag wrapper inside an answer intact", () => {
    const html = faqSection([["سؤال؟", "<div><div>جواب متداخل.</div></div>"]]);
    assert.deepEqual(extractFaqFromHtml(html), [{ question: "سؤال؟", answer: "جواب متداخل." }]);
  });

  it("decodes HTML entities in questions and answers", () => {
    const html = faqSection([
      [
        "&quot;ATEX&quot; &amp; KNX?",
        "<p>&lt;b&gt;bold&lt;/b&gt; &#1593;&#1585;&#1576;&#1610; &#x26; more&nbsp;text</p>",
      ],
    ]);

    assert.deepEqual(extractFaqFromHtml(html), [
      { question: '"ATEX" & KNX?', answer: "<b>bold</b> عربي & more text" },
    ]);
  });

  it("caps the number of extracted pairs at MAX_FAQ_ITEMS", () => {
    const pairs = Array.from({ length: MAX_FAQ_ITEMS + 5 }, (_, i) => [`سؤال ${i}؟`, `<p>جواب ${i}.</p>`]);
    const out = extractFaqFromHtml(faqSection(pairs));

    assert.equal(out.length, MAX_FAQ_ITEMS);
    assert.deepEqual(out[0], { question: "سؤال 0؟", answer: "جواب 0." });
  });

  it("pairs each question with the first answer that starts after it", () => {
    // A stray answer that precedes every question is never consumed. A question
    // with no answer of its own falls through to the next available answer,
    // which cannot happen when the documented one-q-one-a contract is followed.
    const html =
      '<div class="artFaq__a"><p>يتيم.</p></div>' +
      '<h3 class="artFaq__q">أول؟</h3>' +
      '<h3 class="artFaq__q">ثانٍ؟</h3><div class="artFaq__a"><p>جواب ثانٍ.</p></div>';

    assert.deepEqual(extractFaqFromHtml(html), [{ question: "أول؟", answer: "جواب ثانٍ." }]);
  });

  it("ignores class names that merely start with a marker", () => {
    const html =
      '<h3 class="artFaq__question">ليس سؤالاً؟</h3><div class="artFaq__answer"><p>ليس جواباً.</p></div>';
    assert.deepEqual(extractFaqFromHtml(html), []);
  });

  it("accepts extra classes and any tag name on the markers", () => {
    const html =
      '<p class="lead artFaq__q is-open">سؤال؟</p><section class="artFaq__a boxed"><p>جواب.</p></section>';
    assert.deepEqual(extractFaqFromHtml(html), [{ question: "سؤال؟", answer: "جواب." }]);
  });
});
