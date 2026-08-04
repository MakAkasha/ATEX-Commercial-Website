"use strict";

/**
 * server/scripts/backup-db.js — the project's only recovery path.
 *
 * The old implementation made three separate fs.copyFileSync() calls (.sqlite,
 * -wal, -shm) against a live WAL database. In production the WAL is bigger than
 * the main file, so most committed rows exist only in the file being appended to
 * while the copy runs, and the three pieces can disagree.
 *
 * This test reproduces that shape deliberately: it writes rows over an open
 * connection and never checkpoints, so the main .sqlite file is nearly empty and
 * the data lives in the WAL. Then it runs the real script as a child process and
 * requires the single output file to open standalone, pass integrity_check, and
 * hold every row.
 */

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, before, describe, it } = require("node:test");

const Database = require("better-sqlite3");

const { makeTempDbPath, removeTempDb, REPO_ROOT } = require("./helpers/server");

const SCRIPT = path.join(REPO_ROOT, "server", "scripts", "backup-db.js");
const ROW_COUNT = 500;

describe("backup-db", () => {
  const dbPath = makeTempDbPath("backup");
  let backupsDir;
  let source;

  before(() => {
    backupsDir = fs.mkdtempSync(path.join(os.tmpdir(), "atex-test-backups-"));

    source = new Database(dbPath);
    source.pragma("journal_mode = WAL");
    source.exec("CREATE TABLE posts (id INTEGER PRIMARY KEY, slug TEXT NOT NULL, content_html TEXT NOT NULL)");
    const insert = source.prepare("INSERT INTO posts (slug, content_html) VALUES (?, ?)");
    const seed = source.transaction(() => {
      for (let i = 0; i < ROW_COUNT; i += 1) insert.run(`post-${i}`, `<p>body ${i}</p>`.repeat(50));
    });
    seed();
    // Deliberately left open and unchecked-pointed: this is the live-WAL state.
  });

  after(() => {
    try {
      source.close();
    } catch {
      // Already closed.
    }
    removeTempDb(dbPath);
    fs.rmSync(backupsDir, { recursive: true, force: true });
  });

  it("writes one self-contained file that round-trips the live WAL state", () => {
    const walSize = fs.statSync(`${dbPath}-wal`).size;
    assert.ok(walSize > 0, "precondition: committed data must still live in the WAL");

    const res = spawnSync(process.execPath, [SCRIPT], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      windowsHide: true,
      env: {
        ...process.env,
        DB_PATH: dbPath,
        BACKUPS_DIR: backupsDir,
        NODE_PATH: process.env.NODE_PATH || path.join(REPO_ROOT, "node_modules"),
      },
    });

    assert.equal(res.status, 0, `backup-db failed:\n${res.stdout}\n${res.stderr}`);
    assert.match(res.stdout, /Backup created:/);

    const produced = fs.readdirSync(backupsDir);
    assert.equal(produced.length, 1, `expected a single snapshot file, got: ${produced.join(", ")}`);

    const out = path.join(backupsDir, produced[0]);
    assert.match(produced[0], /\.bak$/);
    assert.ok(res.stdout.includes(out), "the produced path must be the one reported");

    const backup = new Database(out, { readonly: true });
    try {
      assert.equal(backup.pragma("integrity_check", { simple: true }), "ok");
      assert.equal(backup.prepare("SELECT COUNT(*) AS c FROM posts").get().c, ROW_COUNT);
      assert.equal(backup.prepare("SELECT slug FROM posts WHERE id = 1").get().slug, "post-0");
    } finally {
      backup.close();
    }
  });
});
