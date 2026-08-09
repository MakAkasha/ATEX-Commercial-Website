"use strict";

/**
 * Client logos — the real-estate developers ATEX has delivered for.
 *
 * Shown on the homepage social-proof section and on both /rec campaign landing
 * pages, so it lives here rather than inside either one.
 *
 * The artwork is supplied as square SVG cards — each file draws its own white
 * card with a light grey outline and a ~70% opaque fill — rendered to WebP at
 * 300px and flattened onto white. The flattening is not cosmetic: the card's
 * fill is translucent, so on any non-white backing it picks up the colour
 * underneath and the mark goes muddy.
 *
 * Sources: D:\ATEX\review\partners (numbered 1-19, supplied 2026-08-08).
 */

const partners = [
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

/** @returns {Array<{name: string, image: string}>} */
function getPartners() {
  return partners;
}

module.exports = { getPartners, partners };
