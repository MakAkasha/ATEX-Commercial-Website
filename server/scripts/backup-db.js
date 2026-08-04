/**
 * Point-in-time snapshot of the SQLite database.
 *
 * This used to fs.copyFileSync() the .sqlite, -wal and -shm files one after the
 * other. Against a live WAL database that is three separate reads of a moving
 * target: in production the WAL is larger than the main database, so most of the
 * committed state lives in the file that is being appended to while the copy
 * runs, and the three pieces can disagree. `VACUUM INTO` instead takes one read
 * transaction and writes a single, self-contained, fully checkpointed database
 * file - the only recovery path this project has, so it has to be consistent.
 */

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { DB_PATH } = require("../db");

function nowStamp() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

/** Writes one consistent snapshot of `src` to `out`. Throws if `out` exists. */
function snapshot(src, out) {
  // Opened read-write, like the app: a read-only connection to a WAL database
  // cannot create the -shm file it needs when no writer is attached. Nothing
  // here writes to the source.
  const db = new Database(src);
  try {
    db.prepare("VACUUM INTO ?").run(out);
  } finally {
    db.close();
  }
}

/** Re-opens the snapshot and refuses to report success on a corrupt file. */
function verify(out) {
  const db = new Database(out, { readonly: true });
  try {
    const result = db.pragma("integrity_check", { simple: true });
    if (result !== "ok") throw new Error(`integrity_check on the backup returned: ${result}`);
  } finally {
    db.close();
  }
}

function main() {
  const root = path.resolve(__dirname, "..", "..");
  const backupsDir = process.env.BACKUPS_DIR || path.join(root, "server", "backups");
  fs.mkdirSync(backupsDir, { recursive: true });

  if (!fs.existsSync(DB_PATH)) {
    console.error("DB file not found:", DB_PATH);
    process.exit(1);
  }

  const stamp = nowStamp();
  const out = path.join(backupsDir, `${path.basename(DB_PATH)}.${stamp}.bak`);

  try {
    snapshot(DB_PATH, out);
    verify(out);
  } catch (err) {
    console.error("Backup failed:", err && err.message ? err.message : err);
    // A half-written snapshot is worse than none - it looks like a backup.
    try {
      fs.rmSync(out, { force: true });
    } catch {
      // Best effort.
    }
    process.exit(1);
  }

  console.log("Backup created:");
  console.log("-", out);
}

main();
