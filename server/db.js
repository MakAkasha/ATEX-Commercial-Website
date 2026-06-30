const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const bcrypt = require("bcrypt");

const { getDefaultHomeContent, normalizeHomeContent } = require("./homeSchema");

const ROOT_DIR = path.resolve(__dirname, "..");
const DB_PATH = process.env.DB_PATH || path.join(ROOT_DIR, "server", "data.sqlite");

function parseBool(value, fallback = false) {
  const s = String(value || "").trim().toLowerCase();
  if (!s) return fallback;
  return ["1", "true", "yes", "on"].includes(s);
}

/**
 * Returns a singleton SQLite connection.
 * Note: better-sqlite3 is synchronous; keep queries small and indexed.
 */
let _db;
function getDb() {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  return _db;
}

function migrate() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS home_content (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      content_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      excerpt TEXT NOT NULL DEFAULT '',
      cover_image TEXT NOT NULL DEFAULT '',
      content_html TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',
      published INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TRIGGER IF NOT EXISTS posts_updated_at
    AFTER UPDATE ON posts
    FOR EACH ROW
    BEGIN
      UPDATE posts SET updated_at = datetime('now') WHERE id = OLD.id;
    END;

    -- Key/value settings (JSON) - additive
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TRIGGER IF NOT EXISTS settings_updated_at
    AFTER UPDATE ON settings
    FOR EACH ROW
    BEGIN
      UPDATE settings SET updated_at = datetime('now') WHERE key = OLD.key;
    END;

    -- Custom Pages (rendered at /rec/:slug)
    CREATE TABLE IF NOT EXISTS custom_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      html_code TEXT NOT NULL DEFAULT '',
      css_code TEXT NOT NULL DEFAULT '',
      js_code TEXT NOT NULL DEFAULT '',
      published INTEGER NOT NULL DEFAULT 0,
      unsafe_js INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TRIGGER IF NOT EXISTS custom_pages_updated_at
    AFTER UPDATE ON custom_pages
    FOR EACH ROW
    BEGIN
      UPDATE custom_pages SET updated_at = datetime('now') WHERE id = OLD.id;
    END;

    -- Internal analytics (page views)
    CREATE TABLE IF NOT EXISTS page_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL DEFAULT (datetime('now')),
      path TEXT NOT NULL,
      consent_level TEXT NOT NULL DEFAULT 'essential',
      visitor_id TEXT,
      referrer TEXT,
      device TEXT,
      user_agent TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_page_views_ts ON page_views(ts);
    CREATE INDEX IF NOT EXISTS idx_page_views_path ON page_views(path);
    CREATE INDEX IF NOT EXISTS idx_page_views_visitor ON page_views(visitor_id);

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      image TEXT NOT NULL DEFAULT '',
      brochure_url TEXT NOT NULL DEFAULT '',
      published INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TRIGGER IF NOT EXISTS products_updated_at
    AFTER UPDATE ON products
    FOR EACH ROW
    BEGIN
      UPDATE products SET updated_at = datetime('now') WHERE id = OLD.id;
    END;

    -- Contact form submissions
    CREATE TABLE IF NOT EXISTS contact_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      ip TEXT,
      user_agent TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_contact_submissions_created_at ON contact_submissions(created_at);
    CREATE INDEX IF NOT EXISTS idx_contact_submissions_email ON contact_submissions(email);
  `);

  // Additive column: separates the dedicated /products catalog (is_catalog=1)
  // from homepage demo products (is_catalog=0). Guarded so re-runs are no-ops.
  const productCols = db.prepare("PRAGMA table_info(products)").all();
  if (!productCols.some((c) => c.name === "is_catalog")) {
    db.exec("ALTER TABLE products ADD COLUMN is_catalog INTEGER NOT NULL DEFAULT 0");
  }

  // Ensure a default home content exists (id=1)
  const row = db.prepare("SELECT content_json FROM home_content WHERE id = 1").get();
  if (!row) {
    db.prepare("INSERT INTO home_content (id, content_json) VALUES (1, ?)").run(JSON.stringify(getDefaultHomeContent()));
  } else {
    // Normalize / migrate existing JSON forward (non-destructive)
    try {
      const current = JSON.parse(row.content_json);
      const normalized = normalizeHomeContent(current);
      const currStr = JSON.stringify(current);
      const nextStr = JSON.stringify(normalized);
      if (currStr !== nextStr) {
        db.prepare("UPDATE home_content SET content_json = ? WHERE id = 1").run(nextStr);
      }
    } catch {
      // If corrupted, reset to defaults
      db.prepare("UPDATE home_content SET content_json = ? WHERE id = 1").run(JSON.stringify(getDefaultHomeContent()));
    }
  }

  // Seed products table from data/products.json once when empty.
  const productsCount = Number(db.prepare("SELECT COUNT(*) as c FROM products").get()?.c || 0);
  if (productsCount === 0) {
    try {
      const seedPath = path.join(ROOT_DIR, "data", "products.json");
      const raw = fs.readFileSync(seedPath, "utf8");
      const rows = JSON.parse(raw);
      if (Array.isArray(rows) && rows.length) {
        const insert = db.prepare(
          "INSERT INTO products (slug, category, title, description, image, brochure_url, published, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        );
        const tx = db.transaction((items) => {
          items.forEach((p, idx) => {
            insert.run(
              String(p.id || `product-${Date.now()}-${idx}`),
              String(p.category || ""),
              String(p.title || ""),
              String(p.description || ""),
              String(p.image || ""),
              "",
              1,
              idx
            );
          });
        });
        tx(rows);
      }
    } catch {
      // Ignore seed failures; empty table is still valid.
    }
  }

  // Optional default-admin seed (explicitly enabled via env)
  // Useful for first bootstrap; rotate immediately before go-live.
  const defaultAdminEnabled = parseBool(process.env.DEFAULT_ADMIN_ENABLED, false);
  const defaultAdminUsername = String(process.env.DEFAULT_ADMIN_USERNAME || "").trim();
  const defaultAdminPassword = String(process.env.DEFAULT_ADMIN_PASSWORD || "").trim();
  if (defaultAdminEnabled && defaultAdminUsername && defaultAdminPassword) {
    const adminsCount = Number(db.prepare("SELECT COUNT(*) as c FROM admins").get()?.c || 0);
    if (adminsCount === 0) {
      const hash = bcrypt.hashSync(defaultAdminPassword, 12);
      db.prepare("INSERT INTO admins (username, password_hash) VALUES (?, ?)").run(defaultAdminUsername, hash);
      console.warn("[ATEX] Default admin seeded. IMPORTANT: change credentials before production use.");
    }
  }
}

module.exports = {
  getDb,
  migrate,
  DB_PATH,
};
