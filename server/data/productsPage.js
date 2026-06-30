/**
 * Static config + data access for the dedicated /products catalog page.
 *
 * Banners are file/code-config (no admin UI). Images live at
 * /assets/products/banners/<key>.png and are produced by
 * tools/import-qsystem-products.js. Products are admin-managed in the DB
 * (is_catalog=1) and rendered images-only.
 */

// Display order: 2 big banners, then 3 small banners (matches the approved preview).
const CATEGORIES = [
  { key: "intercom", label: "أنظمة الإنتركوم", sub: "اتصال المبنى", big: true },
  { key: "locks", label: "الأقفال الذكية", sub: "أمن وحماية", big: true },
  { key: "switches", label: "مفاتيح التحكم الذكية", sub: "منزل ذكي", big: false },
  { key: "doorplates", label: "لوحات الجرس", sub: "مداخل ذكية", big: false },
  { key: "screens", label: "شاشات التحكم", sub: "لوحات ذكية", big: false },
].map((c) => ({ ...c, banner: `/assets/products/banners/${c.key}.png` }));

const BIG_BANNERS = CATEGORIES.filter((c) => c.big);
const SMALL_BANNERS = CATEGORIES.filter((c) => !c.big);

/**
 * Flat list of published catalog products (images only), ordered for display.
 * @param {import('better-sqlite3').Database} db
 * @returns {Array<{ id:number, slug:string, title:string, category:string, image:string }>}
 */
function getCatalog(db) {
  return db
    .prepare(
      "SELECT id, slug, title, category, image FROM products WHERE published = 1 AND is_catalog = 1 ORDER BY sort_order ASC, id ASC"
    )
    .all();
}

module.exports = { CATEGORIES, BIG_BANNERS, SMALL_BANNERS, getCatalog };
