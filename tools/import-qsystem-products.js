/**
 * Import the selected Q-System catalog products into the ATEX site.
 *
 * Idempotent / re-runnable:
 *   1. Decode each selected SKU's base64 image -> assets/products/items/<sku>.png
 *   2. Copy the 5 category banners       -> assets/products/banners/<key>.png
 *   3. Upsert 55 rows into the products table (is_catalog=1, published=1)
 *
 * Homepage demo products (is_catalog=0) are never touched.
 *
 * Usage:  node tools/import-qsystem-products.js
 * Env:    QSYSTEM_ROOT, QSYSTEM_CATALOG, DB_PATH (all optional)
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const QROOT = process.env.QSYSTEM_ROOT || "C:/Users/m2kak/Documents/systems/atex q/ATEX_Quotation";
const CATALOG_PATH = process.env.QSYSTEM_CATALOG || path.join(QROOT, "data", "products.shared.json");
const BANNER_SRC_DIR = process.env.BANNER_SRC_DIR || "C:/Users/m2kak/Downloads/ix-images/banners";

const ITEMS_DIR = path.join(ROOT, "assets", "products", "items");
const BANNERS_DIR = path.join(ROOT, "assets", "products", "banners");

// Selected SKUs in display order (mirrors tools/build-products-page-preview.js).
const SELECTED = [
  "IX-41", "IX-40", "IX-39", "HL-01", "HL-02", "HL-11", "HL-12", "SF-13", "SX-16",
  "SXA-19", "SF-21", "SXA-25", "SXO-26", "SXO-34", "SXA-31", "IX-32", "IX-33", "IX-34",
  "IX-35", "IX-36", "IX-37", "IX-38", "VX-53", "VX-55", "VX-56", "VX-59", "VX-61",
  "BX-65", "FX-70", "PP-20", "PP-21", "AP-22", "GP-23", "GT-24", "PP-25", "PP-26",
  "AP-27", "PP-30", "GP-31", "GT-33", "GP-34", "GP-35", "GT-38", "GT-39", "CUT-6",
  "SA-1", "SA-2", "DP-11", "DP-12", "DP-13", "DP-14", "DP-16", "DP-17", "DP-18", "GT-38-4",
];

// Category (Arabic, from catalog) -> stable banner key + source filename.
const BANNERS = [
  { key: "intercom", file: "أنظمة الإنتركوم.png" },
  { key: "locks", file: "الأقفال الذكية.png" },
  { key: "switches", file: "مفاتيح التحكم الذكية.png" },
  { key: "doorplates", file: "لوحات الجرس.png" },
  { key: "screens", file: "شاشات التحكم.png" },
];

const MIME_EXT = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

function slugifySku(sku) {
  return String(sku).trim().toLowerCase();
}

// Resolve a catalog `image` (data-URI OR relative path into QROOT) -> { buf, ext }.
function resolveImageBytes(image) {
  const i = String(image || "").trim();
  if (!i) return null;
  const dm = i.match(/^data:([^;]+);base64,(.*)$/s);
  if (dm) {
    return { buf: Buffer.from(dm[2], "base64"), ext: MIME_EXT[dm[1].toLowerCase()] || ".png" };
  }
  try {
    const f = path.join(QROOT, i);
    return { buf: fs.readFileSync(f), ext: path.extname(f).toLowerCase() || ".png" };
  } catch {
    return null;
  }
}

function writeIfChanged(filePath, buf) {
  if (fs.existsSync(filePath)) {
    const cur = fs.readFileSync(filePath);
    if (cur.equals(buf)) return false;
  }
  fs.writeFileSync(filePath, buf);
  return true;
}

function main() {
  fs.mkdirSync(ITEMS_DIR, { recursive: true });
  fs.mkdirSync(BANNERS_DIR, { recursive: true });

  const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  const catalog = Array.isArray(raw) ? raw : raw.products || Object.values(raw);
  const bySku = new Map();
  catalog.forEach((p) => {
    const k = String(p.sku || "").trim();
    if (k && !bySku.has(k)) bySku.set(k, p);
  });

  // 1) product images
  const rows = [];
  const missing = [];
  SELECTED.forEach((sku, idx) => {
    const p = bySku.get(sku);
    const resolved = p && resolveImageBytes(p.image);
    if (!resolved) {
      missing.push(sku);
      return;
    }
    const slug = slugifySku(sku);
    writeIfChanged(path.join(ITEMS_DIR, `${slug}${resolved.ext}`), resolved.buf);
    rows.push({
      slug,
      category: String(p.category || "").trim(),
      title: String(p.nameAr || p.name || sku).trim(),
      description: String(p.description || "").trim(),
      image: `/assets/products/items/${slug}${resolved.ext}`,
      sort_order: idx,
    });
  });

  // 2) banners
  let bannerCount = 0;
  BANNERS.forEach(({ key, file }) => {
    const src = path.join(BANNER_SRC_DIR, file);
    if (!fs.existsSync(src)) {
      console.warn(`  ⚠ banner source missing: ${file}`);
      return;
    }
    writeIfChanged(path.join(BANNERS_DIR, `${key}.png`), fs.readFileSync(src));
    bannerCount += 1;
  });

  // 3) upsert DB (is_catalog=1)
  const { getDb, migrate } = require("../server/db");
  migrate();
  const db = getDb();
  const findStmt = db.prepare("SELECT id FROM products WHERE slug = ? LIMIT 1");
  const insertStmt = db.prepare(
    "INSERT INTO products (slug, category, title, description, image, brochure_url, published, sort_order, is_catalog) VALUES (?, ?, ?, ?, ?, '', 1, ?, 1)"
  );
  const updateStmt = db.prepare(
    "UPDATE products SET category = ?, title = ?, description = ?, image = ?, published = 1, sort_order = ?, is_catalog = 1 WHERE slug = ?"
  );

  let created = 0;
  let updated = 0;
  const tx = db.transaction((items) => {
    items.forEach((r) => {
      const existing = findStmt.get(r.slug);
      if (existing?.id) {
        updateStmt.run(r.category, r.title, r.description, r.image, r.sort_order, r.slug);
        updated += 1;
      } else {
        insertStmt.run(r.slug, r.category, r.title, r.description, r.image, r.sort_order);
        created += 1;
      }
    });
  });
  tx(rows);

  const home = Number(db.prepare("SELECT COUNT(*) c FROM products WHERE is_catalog = 0").get()?.c || 0);
  const cat = Number(db.prepare("SELECT COUNT(*) c FROM products WHERE is_catalog = 1").get()?.c || 0);

  console.log(`[import] images: ${rows.length}/${SELECTED.length}  banners: ${bannerCount}/${BANNERS.length}`);
  console.log(`[import] DB upsert: created ${created}, updated ${updated}`);
  console.log(`[import] catalog rows (is_catalog=1): ${cat}  |  homepage rows (is_catalog=0): ${home}`);
  if (missing.length) console.log(`  ⚠ no image for SKUs: ${missing.join(", ")}`);
}

main();
