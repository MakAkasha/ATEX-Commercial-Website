/**
 * Build a self-contained HTML preview of Q-System products mapped to the
 * website product cards. Portable (no server needed) — open in any browser.
 *
 * Output: qsystem-products-preview.html (repo root)
 */
const fs = require("fs");
const path = require("path");

const QROOT = process.env.QSYSTEM_ROOT || "C:/Users/m2kak/Documents/systems/atex q/ATEX_Quotation";
const CATALOG_PATH = process.env.QSYSTEM_CATALOG || path.join(QROOT, "data", "products.shared.json");

const OUT = path.join(__dirname, "..", "qsystem-products-preview.html");

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };

function resolveImage(image) {
  const i = String(image || "").trim();
  if (!i) return "";
  if (i.startsWith("data:")) return i;
  try {
    const f = path.join(QROOT, i);
    const ext = path.extname(f).toLowerCase();
    const mime = MIME[ext] || "image/png";
    return `data:${mime};base64,${fs.readFileSync(f).toString("base64")}`;
  } catch {
    return "";
  }
}

function esc(s) {
  return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
const items = (Array.isArray(raw) ? raw : raw.products || Object.values(raw))
  .map((p) => {
    let cat = String(p.category || "").trim();
    if (cat === "-") cat = "غير مصنّف";
    return {
      title: String(p.nameAr || p.name || "").trim(),
      category: cat,
      description: String(p.description || p.descriptionEn || "").trim(),
      image: resolveImage(p.image),
      sku: String(p.sku || "").trim(),
    };
  })
  // Pull only products that have an image (Okasha's rule).
  .filter((p) => p.image);

// Optional lightweight gallery: one representative (image-bearing) item per
// category, so the file stays small enough to share. Set QSYSTEM_HTML_PERCAT=1.
let gallery = items;
if (process.env.QSYSTEM_HTML_PERCAT) {
  const seen = new Set();
  gallery = items.filter((i) => {
    if (!i.image || seen.has(i.category)) return false;
    seen.add(i.category);
    return true;
  });
}

const cats = [...new Set(gallery.map((i) => i.category))].sort((a, b) => a.localeCompare(b, "ar"));
const withImg = gallery.filter((i) => i.image).length;

const cards = gallery
  .map(
    (p) => `
    <article class="item" data-cat="${esc(p.category)}">
      <div class="item__media">
        ${p.image ? `<img src="${p.image}" alt="${esc(p.title)}" loading="lazy" />` : `<div class="ph">لا توجد صورة</div>`}
      </div>
      <div class="item__body">
        <div class="item__tag">${esc(p.category)}</div>
        <h3 class="item__title">${esc(p.title)}</h3>
        <p class="item__desc">${esc(p.description)}</p>
        <div class="item__sku">${esc(p.sku)}</div>
        <div class="item__actions">
          <a class="btn btn--primary" href="#">اطلب عرضاً</a>
        </div>
      </div>
    </article>`
  )
  .join("");

const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>معاينة منتجات Q-System — ATEX</title>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet" />
<style>
  :root{ --ink:#1a1a1a; --body:#5a5a5a; --line:#e8e8ea; --accent:#ff8a00; --bg:#fafafa; }
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Tajawal',sans-serif;color:var(--body);background:var(--bg);line-height:1.7}
  .wrap{max-width:1280px;margin-inline:auto;padding:32px clamp(16px,4vw,40px)}
  header h1{font-size:26px;color:var(--ink);font-weight:800;margin-bottom:6px}
  header p{font-size:15px}
  .stats{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}
  .stat{background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px 16px;font-size:14px}
  .stat b{color:var(--accent);font-size:18px;display:block}
  .filters{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}
  .chip{border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 14px;font-size:13px;cursor:pointer}
  .chip.active{background:var(--ink);color:#fff;border-color:var(--ink)}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:18px;margin-top:18px}
  .item{background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;transition:box-shadow .2s,transform .2s}
  .item:hover{box-shadow:0 12px 30px rgba(0,0,0,.08);transform:translateY(-3px)}
  .item__media{aspect-ratio:4/3;background:#f3f3f5;display:flex;align-items:center;justify-content:center;overflow:hidden}
  .item__media img{width:100%;height:100%;object-fit:contain;padding:10px}
  .ph{color:#bbb;font-size:13px}
  .item__body{padding:14px;display:flex;flex-direction:column;gap:8px;flex:1}
  .item__tag{font-size:11px;color:var(--accent);font-weight:700}
  .item__title{font-size:16px;color:var(--ink);font-weight:700;line-height:1.35}
  .item__desc{font-size:13px;flex:1}
  .item__sku{font-size:11px;color:#aaa;direction:ltr;text-align:right}
  .item__actions{margin-top:6px}
  .btn{display:inline-block;background:var(--accent);color:#fff;border-radius:8px;padding:9px 16px;font-size:13px;font-weight:700;text-decoration:none}
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>معاينة منتجات Q-System على واجهة الموقع</h1>
      <p>مطابقة كتالوج نظام العروض (Q-System) إلى بطاقات منتجات الموقع — معاينة فقط، لم يُكتب أي شيء على الموقع المباشر.</p>
    </header>
    <div class="stats">
      <div class="stat"><b>${gallery.length}</b> معروض هنا</div>
      <div class="stat"><b>${items.length}</b> إجمالي المنتجات بصورة</div>
      <div class="stat"><b>${cats.length}</b> تصنيف</div>
    </div>
    <div class="filters" id="filters">
      <span class="chip active" data-cat="*">الكل</span>
      ${cats.map((c) => `<span class="chip" data-cat="${esc(c)}">${esc(c)}</span>`).join("")}
    </div>
    <div class="grid" id="grid">${cards}</div>
  </div>
  <script>
    const grid = document.getElementById('grid');
    document.getElementById('filters').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip'); if(!chip) return;
      document.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));
      chip.classList.add('active');
      const cat = chip.dataset.cat;
      grid.querySelectorAll('.item').forEach(it=>{ it.style.display = (cat==='*'||it.dataset.cat===cat)?'':'none'; });
    });
  </script>
</body>
</html>`;

fs.writeFileSync(OUT, html, "utf8");
const kb = Math.round(Buffer.byteLength(html) / 1024);
console.log(`[preview-html] wrote ${OUT} (${kb} KB, ${items.length} products, ${cats.length} categories)`);
