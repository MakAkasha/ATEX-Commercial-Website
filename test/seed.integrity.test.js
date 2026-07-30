"use strict";

/**
 * Seed-data integrity.
 *
 * This is the guard for the class of bug where a bulk path rewrite corrupts a
 * committed JSON manifest and NOTHING notices: server/db.js wraps both seed
 * blocks in a bare `catch {}`, so an unparseable manifest boots the app
 * normally, seeds zero rows, logs nothing, and renders an empty /products page.
 *
 * The final test is the real end-to-end assertion: run migrate() against a
 * brand-new throwaway DB and require that the catalog row count equals the
 * manifest length. Zero rows from a 55-entry manifest fails here.
 *
 * No server is started. The DB used is a fresh temp file, created and deleted by
 * the harness helpers, which refuse any path outside the OS temp dir.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it, after } = require("node:test");

const { makeTempDbPath, removeTempDb, REPO_ROOT } = require("./helpers/server");

const CATALOG_MANIFEST = path.join(REPO_ROOT, "server", "data", "catalog-products.json");
const PRODUCTS_SEED = path.join(REPO_ROOT, "data", "products.json");

/** Bytes below 0x20 that are legitimate in JSON whitespace. */
const ALLOWED_CONTROL_BYTES = new Set([0x09, 0x0a, 0x0d]);

describe("seed data integrity", () => {
  const tempDbs = [];

  after(() => {
    for (const dbPath of tempDbs) removeTempDb(dbPath);
  });

  it("server/data/catalog-products.json contains no stray control bytes", () => {
    const buf = fs.readFileSync(CATALOG_MANIFEST);
    const offenders = [];
    for (let i = 0; i < buf.length; i += 1) {
      const byte = buf[i];
      if (byte < 0x20 && !ALLOWED_CONTROL_BYTES.has(byte)) {
        offenders.push(`0x${byte.toString(16).padStart(2, "0")}@${i}`);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `catalog-products.json contains ${offenders.length} raw control byte(s) — ` +
        `first few: ${offenders.slice(0, 5).join(", ")}. A byte below 0x20 inside a ` +
        `JSON string makes the whole file unparseable, and server/db.js swallows that ` +
        `failure silently.`
    );
  });

  it("server/data/catalog-products.json parses as a non-empty JSON array", () => {
    const raw = fs.readFileSync(CATALOG_MANIFEST, "utf8");
    let rows;
    assert.doesNotThrow(() => {
      rows = JSON.parse(raw);
    }, "catalog-products.json is not valid JSON");
    assert.ok(Array.isArray(rows), "catalog-products.json must be a JSON array");
    assert.ok(rows.length > 0, "catalog-products.json must not be empty");
  });

  it("every catalog image path starts with /assets/ and resolves on disk", () => {
    const rows = JSON.parse(fs.readFileSync(CATALOG_MANIFEST, "utf8"));
    const problems = [];

    for (const row of rows) {
      const image = String(row.image || "");
      if (!image.startsWith("/assets/")) {
        problems.push(`${row.slug}: image "${image}" does not start with /assets/`);
        continue;
      }
      const onDisk = path.join(REPO_ROOT, image.replace(/^\//, ""));
      if (!fs.existsSync(onDisk)) {
        problems.push(`${row.slug}: image "${image}" is missing on disk`);
      }
    }

    assert.deepEqual(problems, [], `broken catalog images:\n  ${problems.join("\n  ")}`);
  });

  it("data/products.json parses as a JSON array", () => {
    const raw = fs.readFileSync(PRODUCTS_SEED, "utf8");
    let rows;
    assert.doesNotThrow(() => {
      rows = JSON.parse(raw);
    }, "data/products.json is not valid JSON");
    assert.ok(Array.isArray(rows), "data/products.json must be a JSON array");
  });

  it("a fresh migrate() seeds exactly one catalog row per manifest entry", () => {
    const expected = JSON.parse(fs.readFileSync(CATALOG_MANIFEST, "utf8")).length;

    // DB_PATH is captured when server/db.js is first required, so it must be set
    // before the require below. The path is a brand-new temp file.
    const dbPath = makeTempDbPath("seed");
    tempDbs.push(dbPath);
    process.env.DB_PATH = dbPath;

    // eslint-disable-next-line global-require
    const { migrate, getDb } = require("../server/db");
    migrate();

    const db = getDb();
    const actual = Number(db.prepare("SELECT COUNT(*) AS c FROM products WHERE is_catalog = 1").get()?.c || 0);
    db.close();

    assert.equal(
      actual,
      expected,
      `expected ${expected} catalog rows after a fresh migrate(), got ${actual}. ` +
        `A count of 0 means the catalog seed threw and server/db.js swallowed it.`
    );
  });
});
