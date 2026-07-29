/**
 * Homepage testimonials (social proof) — file-based config, no admin UI.
 *
 * HOW TO ADD A REAL TESTIMONIAL
 * -----------------------------
 * Edit an entry below and replace every bracketed placeholder with real text.
 * An entry is only published once NONE of its fields contain square brackets.
 * Entries that still hold a placeholder are skipped, and the whole social-proof
 * section is hidden when fewer than MIN_VISIBLE entries are publishable — so a
 * half-finished entry can never leak onto the live site.
 *
 * Fields:
 *   quote   (required) the testimonial text
 *   name    person's name — leave "" to stay anonymous
 *   role    job title / position
 *   company company name
 *   sector  short tag shown as a pill (e.g. الضيافة)
 *   rating  1..5 stars (defaults to 5)
 *   photo   optional image path, e.g. "/assets/testimonials/name.webp"
 *   project optional project reference line
 */

// Hide the entire section (heading included) below this many publishable entries.
const MIN_VISIBLE = 2;

const TESTIMONIALS = [
  {
    quote: '"تنفيذ احترافي وسرعة استجابة ممتازة"',
    name: "",
    role: "مدير مشروع – قطاع الضيافة",
    company: "",
    sector: "الضيافة",
    rating: 5,
    photo: "",
    project: "",
  },
  {
    quote: '"تحسن واضح في كفاءة التشغيل بعد التكامل"',
    name: "",
    role: "مدير تشغيل – قطاع العقارات",
    company: "",
    sector: "العقارات",
    rating: 5,
    photo: "",
    project: "",
  },
  {
    quote: '"فريق داعم وخطة تنفيذ واضحة من البداية"',
    name: "",
    role: "مالك مشروع – قطاع سكني",
    company: "",
    sector: "السكني",
    rating: 5,
    photo: "",
    project: "",
  },
  {
    quote: "[نص الشهادة]",
    name: "[اسم العميل]",
    role: "[المسمى الوظيفي]",
    company: "[اسم الشركة]",
    sector: "[القطاع]",
    rating: 5,
    photo: "",
    project: "",
  },
  {
    quote: "[نص الشهادة]",
    name: "[اسم العميل]",
    role: "[المسمى الوظيفي]",
    company: "[اسم الشركة]",
    sector: "[القطاع]",
    rating: 5,
    photo: "",
    project: "",
  },
  {
    quote: "[نص الشهادة]",
    name: "[اسم العميل]",
    role: "[المسمى الوظيفي]",
    company: "[اسم الشركة]",
    sector: "[القطاع]",
    rating: 5,
    photo: "",
    project: "",
  },
];

const TEXT_FIELDS = ["quote", "name", "role", "company", "sector", "photo", "project"];
const PLACEHOLDER_RE = /[[\]]/;

const text = (value) => String(value ?? "").trim();

/** An entry publishes only when it has a quote and no bracketed placeholder anywhere. */
function isPublishable(entry) {
  if (!entry || typeof entry !== "object") return false;
  if (!text(entry.quote)) return false;
  return TEXT_FIELDS.every((field) => !PLACEHOLDER_RE.test(text(entry[field])));
}

function clampRating(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 5;
  return Math.min(5, Math.max(1, n));
}

/**
 * First letter used for the monogram avatar when no photo is supplied.
 * Anonymous entries return "" so the view falls back to a neutral quote badge
 * instead of a meaningless initial.
 */
function monogram(entry) {
  const source = text(entry.name) || text(entry.company);
  return source ? Array.from(source)[0] : "";
}

/**
 * Publishable testimonials, normalized for the view.
 * Returns [] when fewer than MIN_VISIBLE entries are ready, so the caller can
 * hide the whole section with a single truthiness check.
 * @returns {Array<{quote:string,name:string,role:string,company:string,sector:string,rating:number,photo:string,project:string,initial:string}>}
 */
function getTestimonials() {
  const ready = TESTIMONIALS.filter(isPublishable).map((entry) => ({
    quote: text(entry.quote),
    name: text(entry.name),
    role: text(entry.role),
    company: text(entry.company),
    sector: text(entry.sector),
    rating: clampRating(entry.rating),
    photo: text(entry.photo),
    project: text(entry.project),
    initial: monogram(entry),
  }));

  return ready.length >= MIN_VISIBLE ? ready : [];
}

module.exports = { MIN_VISIBLE, getTestimonials };
