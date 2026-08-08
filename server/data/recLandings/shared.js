"use strict";

/**
 * Content both /rec landing pages show.
 *
 * The partner logos are the same seven either way. The testimonials are the
 * same six by owner decision: they are real quotes from property-development
 * clients, and the villa page frames them as project references rather than
 * homeowner quotes (see `proof.lede` in smart-villa.js). If ATEX ever supplies
 * villa-owner quotes, give smart-villa.js its own `testimonials` array and stop
 * importing this one — nothing else has to change.
 */

/** Sales line, not customer service. Same number the printed material carries. */
const WHATSAPP_NUMBER = "966509330008";

/** For the `tel:` fallback next to the WhatsApp CTA. Matches site-footer.ejs. */
const SALES_PHONE = "0509330008";

/**
 * Client logo strip.
 *
 * Rendered from the client-supplied SVGs to WebP, flattened onto white. The
 * source artwork places each mark on a card at ~50% opacity, so anything other
 * than a white backing turns the card grey and tints the logo — baking the
 * white in makes the strip correct no matter what the section sits on. The
 * matching `.recProof__logo` rule in assets/css/rec-landing.css keeps a white
 * tile underneath for the same reason.
 */
const PARTNER_LOGOS = [
  { name: "شعار رسوخ العمرانية", image: "/assets/partners/rusookh.webp" },
  { name: "شعار درة العقارية", image: "/assets/partners/durrah.webp" },
  { name: "شعار سدنة العقارية", image: "/assets/partners/sadana.webp" },
  { name: "شعار كيان الماسية", image: "/assets/partners/kayan-almasiya.webp" },
  { name: "شعار كفاءات العقارية", image: "/assets/partners/kafaat.webp" },
  { name: "شعار سين العقارية", image: "/assets/partners/seen.webp" },
  { name: "شعار جوار الأولى", image: "/assets/partners/jiwar-aloula.webp" },
  { name: "شعار إشراق العقارية", image: "/assets/partners/ishraq.webp" },
  { name: "شعار سداسيات العقارية", image: "/assets/partners/sodasyat.webp" },
  { name: "شعار التوباز العقارية", image: "/assets/partners/al-topaz.webp" },
  { name: "شعار الشاطري العقارية", image: "/assets/partners/al-shatri.webp" },
  { name: "شعار فجر العقارية", image: "/assets/partners/fajr.webp" },
  { name: "شعار مساكن التمليك العقارية", image: "/assets/partners/masakin-altamleek.webp" },
  { name: "شعار جسر", image: "/assets/partners/jisr.webp" },
  { name: "شعار منصات للتطوير العقاري", image: "/assets/partners/manassat.webp" },
  { name: "شعار أحمد آل مبارك العقارية", image: "/assets/partners/ahmed-al-mubarak.webp" },
  { name: "شعار منازل العز للتطوير العقاري", image: "/assets/partners/manazel-al-ezz.webp" },
  { name: "شعار معاد المطورة للتجارة والتطوير العقاري", image: "/assets/partners/maad.webp" },
  { name: "شعار رواسخ العقارية", image: "/assets/partners/rwasekh.webp" },
];

const TESTIMONIALS = [
  {
    quote:
      "التزام استثنائي بالمواعيد، سرعة في التنفيذ، واستجابة فورية في خدمات ما بعد البيع، مما جعل التعامل أكثر احترافية.",
    person: "السيد/ عبدالله حسن جيب الله",
    role: "مدير المشتريات - شركة كفاءات العقارية",
  },
  {
    quote:
      "تنوع كبير في المنتجات، مع استشارات فنية واضحة وتوصيات تناسب كل مشروع، مما ساعدنا على اختيار الحل الأمثل بثقة واطمئنان.",
    person: "السيد/ عبدالله الصيعري",
    role: "مدير المشتريات - شركة سدنة العقارية",
  },
  {
    quote:
      "الحلول الذكية وفرت لنا منظومة متكاملة للأمان والتحكم والراحة، وربطت بين أنظمة المشروع بسهولة جعلت إدارة الوحدات السكنية أكثر سلاسة.",
    person: "السيد/ خالد السلمي",
    role: "قسم المشتريات - شركة إشراق العقارية",
  },
  {
    quote:
      "متابعة دقيقة لكل مراحل المشروع، من دراسة الاحتياج والتصميم إلى الإشراف على التنفيذ والتسليم، مع حضور فعال في مرحلة التشغيل والدعم المستمر.",
    person: "المهندس/ وليد",
    role: "مدير المشاريع - شركة درة العقارية",
  },
  {
    quote:
      "قدموا حلولا مناسبة لتوجهات عملائنا من حيث التقنيات والميزانية، مع اقتراح بدائل ذكية تجعل المشروع أكثر تميزا وقيمة مضافة للمستخدم النهائي.",
    person: "المهندس/ بركات",
    role: "مدير المشاريع - شركة التوباز العقارية",
  },
  {
    quote:
      "مرونة عالية في تكييف الحلول مع متطلبات كل مشروع، وسرعة في التعديل والاستجابة، مما عزز الثقة وساهم في استمرارية التعاون بين الجانبين.",
    person: "المهندس/ خالد ديان",
    role: "مدير المشتريات - شركة سين العقارية",
  },
];

/**
 * The hero background clip, reused from the homepage rather than re-hosted.
 *
 * The original standalone pages pointed at https://atex.sa/content/video.mp4,
 * which has returned 404 since the site rebuild — the hero on those pages has
 * been broken for as long as the pages themselves have been missing.
 *
 * `poster` is deliberately a real attribute rather than a CSS background: the
 * browser fetches it eagerly even under `preload="none"`, which makes it a
 * legitimate LCP candidate on a page whose whole audience arrives by phone
 * camera over cellular. assets/js/main.js:1020 swaps the `data-src` sources in
 * 300ms after DOMContentLoaded, so the poster is what fills the frame until
 * then.
 */
const HERO_VIDEO = {
  poster: "/assets/hero-video/video-keeper.webp",
  sources: [
    { src: "/assets/hero-video/hero.webm", type: "video/webm" },
    { src: "/assets/hero-video/hero.mp4", type: "video/mp4" },
  ],
  fallback: "متصفحك لا يدعم تشغيل الفيديو.",
};

module.exports = {
  HERO_VIDEO,
  PARTNER_LOGOS,
  SALES_PHONE,
  TESTIMONIALS,
  WHATSAPP_NUMBER,
};
