const fs = require("fs");
const path = require("path");
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

function copyIfExists(src, destDir, suffix) {
  if (!fs.existsSync(src)) return null;
  const name = path.basename(src) + suffix;
  const out = path.join(destDir, name);
  fs.copyFileSync(src, out);
  return out;
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
  const copied = [];

  const mainCopy = copyIfExists(DB_PATH, backupsDir, `.${stamp}.bak`);
  if (mainCopy) copied.push(mainCopy);

  const walCopy = copyIfExists(`${DB_PATH}-wal`, backupsDir, `.${stamp}.bak`);
  if (walCopy) copied.push(walCopy);

  const shmCopy = copyIfExists(`${DB_PATH}-shm`, backupsDir, `.${stamp}.bak`);
  if (shmCopy) copied.push(shmCopy);

  console.log("Backup created:");
  copied.forEach((f) => console.log("-", f));
}

main();
