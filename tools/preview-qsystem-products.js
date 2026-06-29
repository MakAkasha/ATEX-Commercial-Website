/**
 * Preview-only seed: map Q-System catalog -> website products schema.
 *
 * Reads the Q-System shared catalog (products.shared.json) and seeds a
 * THROWAWAY SQLite DB so the homepage can be previewed with real items.
 * Does NOT touch the real local data.sqlite (uses its own DB_PATH).
 *
 * Field mapping (confirmed with Okasha):
 *   nameAr        -> title      (Arabic-first site; falls back to name)
 *   category      -> category   ("-" placeholder -> "")
 *   description   -> description (falls back to descriptionEn)
 *   image         -> image      (base64 data URI; "" -> placeholder svg)
 *
 * Usage:
 *   DB_PATH=./server/preview-qsystem.sqlite node tools/preview-qsystem-products.js
 */
const path = require("path");
const fs = require("fs");

const QROOT = process.env.QSYSTEM_ROOT || "C:/Users/m2kak/Documents/systems/atex q/ATEX_Quotation";
const CATALOG_PATH = process.env.QSYSTEM_CATALOG || path.join(QROOT, "data", "products.shared.json");

const PLACEHOLDER = "/assets/placeholder-product.svg";

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };

// Resolve a catalog image to something the website can render:
//   data: URI  -> kept as-is
//   rel path   -> read the PNG/JPG from the Q-System repo, inline as data: URI
//   missing    -> placeholder
function resolveImage(image) {
  const i = String(image || "").trim();
  if (!i) return PLACEHOLDER;
  if (i.startsWith("data:")) return i;
  try {
    const f = path.join(QROOT, i);
    const ext = path.extname(f).toLowerCase();
    const mime = MIME[ext] || "image/png";
    return `data:${mime};base64,${fs.readFileSync(f).toString("base64")}`;
  } catch {
    return PLACEHOLDER;
  }
}

function slugify(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^؀-ۿa-z0-9\-]/gi, "")
    .replace(/\-+/g, "-")
    .replace(/^\-+|\-+$/g, "");
}

function loadCatalog() {
  const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  return Array.isArray(raw) ? raw : raw.products || Object.values(raw);
}

function mapRow(p, idx, usedSlugs) {
  const title = String(p.nameAr || p.name || "").trim();
  let category = String(p.category || "").trim();
  if (category === "-") category = "";
  const description = String(p.description || p.descriptionEn || "").trim();
  const image = resolveImage(p.image);

  let base = slugify(p.sku) || slugify(p.name) || slugify(title) || `product-${idx}`;
  let slug = base;
  let n = 2;
  while (usedSlugs.has(slug)) slug = `${base}-${n++}`;
  usedSlugs.add(slug);

  return { slug, category, title, description, image, sort_order: idx };
}

function main() {
  if (!process.env.DB_PATH) {
    process.env.DB_PATH = path.join(__dirname, "..", "server", "preview-qsystem.sqlite");
  }
  // Fresh file every run so the preview is deterministic.
  try {
    for (const ext of ["", "-wal", "-shm"]) {
      const f = process.env.DB_PATH + ext;
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
  } catch {
    /* ignore */
  }

  const { getDb, migrate } = require("../server/db");
  migrate();
  const db = getDb();

  // Drop the 3 demo seeds migrate() inserts into an empty table.
  db.prepare("DELETE FROM products").run();

  const catalog = loadCatalog();
  const usedSlugs = new Set();
  let rows = catalog
    .map((p, idx) => mapRow(p, idx, usedSlugs))
    .filter((r) => r.slug && r.title)
    // Pull only products that have a real image (Okasha's rule).
    .filter((r) => r.image !== PLACEHOLDER);

  // Optional subset for a lightweight visual preview: one image-bearing item
  // per category first, then fill to the limit.
  const limit = Number(process.env.QSYSTEM_LIMIT || 0);
  if (limit > 0) {
    const withImg = rows.filter((r) => r.image !== PLACEHOLDER);
    const seenCat = new Set();
    const perCat = [];
    const rest = [];
    withImg.forEach((r) => {
      if (!seenCat.has(r.category)) {
        seenCat.add(r.category);
        perCat.push(r);
      } else {
        rest.push(r);
      }
    });
    rows = [...perCat, ...rest].slice(0, limit).map((r, i) => ({ ...r, sort_order: i }));
  }

  const insert = db.prepare(
    "INSERT INTO products (slug, category, title, description, image, brochure_url, published, sort_order) VALUES (?, ?, ?, ?, ?, ?, 1, ?)"
  );
  const tx = db.transaction((items) => {
    items.forEach((r) => insert.run(r.slug, r.category, r.title, r.description, r.image, "", r.sort_order));
  });
  tx(rows);

  const cats = new Set(rows.map((r) => r.category).filter(Boolean));
  const withImg = rows.filter((r) => r.image !== PLACEHOLDER).length;
  console.log(`[preview] DB: ${process.env.DB_PATH}`);
  console.log(`[preview] seeded ${rows.length} products / ${cats.size} categories / ${withImg} with images`);
}

main();
