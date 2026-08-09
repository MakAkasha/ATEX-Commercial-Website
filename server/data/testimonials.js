/**
 * Homepage testimonials (social proof) — file-based config, no admin UI.
 *
 * HOW TO ADD A REAL TESTIMONIAL
 * -----------------------------
 * Copy an entry below and fill every field with real text. The six here are
 * real, signed-off quotes from ATEX's development clients (the same set the
 * /rec campaign pages use). Never leave a square bracket in a field: that is
 * the placeholder marker, and it is what keeps an unfinished entry off the
 * live site.
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
 *   logo    optional company logo, e.g. "/assets/partners/sadana.webp".
 *           Preferred over `photo`: these are B2B references, and the client
 *           company is the credential a reader recognises, not the face.
 *   photo   optional portrait, e.g. "/assets/testimonials/name.webp"
 *   project optional project reference line
 */

// Hide the entire section (heading included) below this many publishable entries.
const MIN_VISIBLE = 2;

const TESTIMONIALS = [
  {
    quote:
      "التزام استثنائي بالمواعيد، سرعة في التنفيذ، واستجابة فورية في خدمات ما بعد البيع، مما جعل التعامل أكثر احترافية.",
    name: "السيد/ عبدالله حسن جيب الله",
    role: "مدير المشتريات",
    company: "شركة كفاءات العقارية",
    sector: "العقارات",
    rating: 5,
    logo: "/assets/partners/kafaat.webp",
    photo: "",
    project: "",
  },
  {
    quote:
      "تنوع كبير في المنتجات، مع استشارات فنية واضحة وتوصيات تناسب كل مشروع، مما ساعدنا على اختيار الحل الأمثل بثقة واطمئنان.",
    name: "السيد/ عبدالله الصيعري",
    role: "مدير المشتريات",
    company: "شركة سدنة العقارية",
    sector: "العقارات",
    rating: 5,
    logo: "/assets/partners/sadana.webp",
    photo: "",
    project: "",
  },
  {
    quote:
      "الحلول الذكية وفرت لنا منظومة متكاملة للأمان والتحكم والراحة، وربطت بين أنظمة المشروع بسهولة جعلت إدارة الوحدات السكنية أكثر سلاسة.",
    name: "السيد/ خالد السلمي",
    role: "قسم المشتريات",
    company: "شركة إشراق العقارية",
    sector: "العقارات",
    rating: 5,
    logo: "/assets/partners/ishraq.webp",
    photo: "",
    project: "",
  },
  {
    quote:
      "متابعة دقيقة لكل مراحل المشروع، من دراسة الاحتياج والتصميم إلى الإشراف على التنفيذ والتسليم، مع حضور فعال في مرحلة التشغيل والدعم المستمر.",
    name: "المهندس/ وليد",
    role: "مدير المشاريع",
    company: "شركة درة العقارية",
    sector: "العقارات",
    rating: 5,
    logo: "/assets/partners/durrah.webp",
    photo: "",
    project: "",
  },
  {
    quote:
      "قدموا حلولا مناسبة لتوجهات عملائنا من حيث التقنيات والميزانية، مع اقتراح بدائل ذكية تجعل المشروع أكثر تميزا وقيمة مضافة للمستخدم النهائي.",
    name: "المهندس/ بركات",
    role: "مدير المشاريع",
    company: "شركة التوباز العقارية",
    sector: "العقارات",
    rating: 5,
    logo: "/assets/partners/al-topaz.webp",
    photo: "",
    project: "",
  },
  {
    quote:
      "مرونة عالية في تكييف الحلول مع متطلبات كل مشروع، وسرعة في التعديل والاستجابة، مما عزز الثقة وساهم في استمرارية التعاون بين الجانبين.",
    name: "المهندس/ خالد ديان",
    role: "مدير المشتريات",
    company: "شركة سين العقارية",
    sector: "العقارات",
    rating: 5,
    logo: "/assets/partners/seen.webp",
    photo: "",
    project: "",
  },
];

const TEXT_FIELDS = ["quote", "name", "role", "company", "sector", "logo", "photo", "project"];
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
 * @returns {Array<{quote:string,logo:string,name:string,role:string,company:string,sector:string,rating:number,photo:string,project:string,initial:string}>}
 */
function getTestimonials() {
  const ready = TESTIMONIALS.filter(isPublishable).map((entry) => ({
    quote: text(entry.quote),
    logo: text(entry.logo),
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
