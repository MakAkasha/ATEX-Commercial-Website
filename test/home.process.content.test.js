"use strict";

/**
 * Regression tests for the "كيف نعمل" section (#process on the home page).
 *
 * Two defects shipped together and hid each other:
 *
 *   1. views/home.ejs declared its own step array and hardcoded the heading and
 *      subheading, so it never read content.process at all.
 *   2. normalizeHomeContent() copied process.heading and process.subheading but
 *      silently dropped process.steps, so anything an admin saved was reset to
 *      the defaults on the next normalise pass.
 *
 * Because (1) meant nothing rendered stored steps, (2) was invisible. Both are
 * covered here: the schema half as a pure function, the render half against the
 * template.
 */

const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { describe, it } = require("node:test");

const ejs = require("ejs");

const { makeTempDbPath } = require("./helpers/server");

process.env.DB_PATH = makeTempDbPath("homeprocess");

const { getDefaultHomeContent, normalizeHomeContent } = require("../server/homeSchema");

const HOME_EJS = path.join(__dirname, "..", "views", "home.ejs");

/** Renders just the #process section out of views/home.ejs against `content`. */
function renderProcessSection(content) {
  const source = fs.readFileSync(HOME_EJS, "utf8");
  const open = source.indexOf('<section class="section" id="process">');
  assert.ok(open !== -1, "could not find the #process section in views/home.ejs");
  const close = source.indexOf("</section>", open);
  const fragment = source.slice(open, close + "</section>".length);
  return ejs.render(fragment, { content });
}

describe("home #process — stored content reaches the page", () => {
  it("renders the stored heading and subheading, not a hardcoded pair", () => {
    const html = renderProcessSection({
      process: { heading: "طريقة عملنا", subheading: "من الزيارة إلى الضمان." },
    });
    assert.match(html, /طريقة عملنا/);
    assert.match(html, /من الزيارة إلى الضمان\./);
    assert.doesNotMatch(html, /كيف نعمل/);
  });

  it("renders the stored steps, in order", () => {
    const html = renderProcessSection({
      process: {
        steps: [
          { title: "خطوة أولى", desc: "وصف أول" },
          { title: "خطوة ثانية", desc: "وصف ثانٍ" },
        ],
      },
    });
    assert.match(html, /خطوة أولى/);
    assert.match(html, /وصف ثانٍ/);
    assert.ok(
      html.indexOf("خطوة أولى") < html.indexOf("خطوة ثانية"),
      "steps rendered out of order",
    );
    // The defaults must not leak in alongside the stored steps.
    assert.doesNotMatch(html, /زيارة الموقع ودراسة المخططات/);
  });

  it("falls back to the schema defaults when nothing is stored", () => {
    const html = renderProcessSection({});
    const defaults = getDefaultHomeContent().process;
    assert.match(html, new RegExp(defaults.steps[0].title));
    assert.match(html, new RegExp(defaults.heading));
  });

  it("does not render a hardcoded arrow glyph", () => {
    // `←` was a literal character in a dir="rtl" document; the amber rail
    // replaced it.
    const html = renderProcessSection({});
    assert.ok(!html.includes("←"), "the hardcoded arrow is back");
  });
});

describe("normalizeHomeContent — process.steps", () => {
  it("keeps steps an admin saved", () => {
    const out = normalizeHomeContent({
      process: {
        heading: "طريقة عملنا",
        subheading: "مخصص.",
        steps: [{ title: "خطوة محررة", desc: "نص محرر" }],
      },
    });
    assert.deepEqual(out.process.steps, [{ title: "خطوة محررة", desc: "نص محرر" }]);
    assert.equal(out.process.heading, "طريقة عملنا");
  });

  it("drops blank steps and coerces missing fields", () => {
    const out = normalizeHomeContent({
      process: {
        heading: "طريقة عملنا",
        steps: [{ title: "عنوان" }, { title: "", desc: "" }, null, "nope"],
      },
    });
    assert.deepEqual(out.process.steps, [{ title: "عنوان", desc: "" }]);
  });

  it("moves an untouched v2 row forward to the current defaults", () => {
    const retired = {
      heading: "كيف نعمل",
      subheading: "خطوات واضحة من الفكرة إلى التشغيل ثم التحسين المستمر.",
      steps: [
        { title: "تحليل حالة الاستخدام", desc: "تعريف الهدف، المؤشرات، نطاق الأجهزة، ومتطلبات التكامل." },
        { title: "اختيار الأجهزة والاتصال", desc: "ترشيح الحساسات/الأجهزة والبروتوكولات المناسبة للبيئة." },
        { title: "التركيب والتهيئة", desc: "تركيب ميداني، إعداد تنبيهات أولية، واختبارات قبول." },
        { title: "لوحات وتقارير", desc: "لوحات تشغيلية وتقارير دورية للمديرين وفرق العمليات." },
        { title: "تحسين مستمر", desc: "تحسين القواعد، تقليل الإنذارات الخاطئة، وتوسيع النطاق." },
      ],
    };
    const out = normalizeHomeContent({ process: retired });
    assert.deepEqual(out.process, getDefaultHomeContent().process);
  });

  it("leaves a v2 row alone once any part of it has been edited", () => {
    const edited = {
      heading: "كيف نعمل",
      subheading: "خطوات واضحة من الفكرة إلى التشغيل ثم التحسين المستمر.",
      steps: [
        { title: "تحليل حالة الاستخدام", desc: "نص عدّله المسؤول." },
        { title: "اختيار الأجهزة والاتصال", desc: "ترشيح الحساسات/الأجهزة والبروتوكولات المناسبة للبيئة." },
        { title: "التركيب والتهيئة", desc: "تركيب ميداني، إعداد تنبيهات أولية، واختبارات قبول." },
        { title: "لوحات وتقارير", desc: "لوحات تشغيلية وتقارير دورية للمديرين وفرق العمليات." },
        { title: "تحسين مستمر", desc: "تحسين القواعد، تقليل الإنذارات الخاطئة، وتوسيع النطاق." },
      ],
    };
    const out = normalizeHomeContent({ process: edited });
    assert.equal(out.process.steps[0].desc, "نص عدّله المسؤول.");
  });
});
