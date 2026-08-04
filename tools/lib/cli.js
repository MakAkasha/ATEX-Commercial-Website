/**
 * Shared CLI plumbing for the tools under tools/ that write to the SQLite
 * database.
 *
 * Two rules every one of those tools follows, enforced from here:
 *
 * 1. PREVIEW BY DEFAULT. An argument-less run reports what it would do and
 *    writes nothing. Writing requires an explicit --apply. `--dry-run` is
 *    still accepted so older documented invocations keep working; it now just
 *    names the default.
 *
 * 2. The database is resolved the same way the server resolves it
 *    (server/db.js honours DB_PATH), so a tool can never silently write to a
 *    different file than the app reads:
 *
 *      --db <path>  ->  process.env.DB_PATH  ->  <repo>/server/data.sqlite
 */

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const DEFAULT_DB_PATH = path.resolve(__dirname, "..", "..", "server", "data.sqlite");

const COMMON_HELP_FOOTER = `
Database resolution order:
  1. --db <path>
  2. DB_PATH environment variable
  3. ${DEFAULT_DB_PATH}

WARNING: --apply writes to the resolved database. Run without --apply first and
read the preview. A missing database file is an error - these tools never create
one, and never migrate a schema.`;

function parseArgs(argv) {
  const args = (argv || process.argv.slice(2)).slice();
  const has = (...names) => names.some((n) => args.includes(n));

  const dbIndex = args.indexOf("--db");
  const rawDb = dbIndex === -1 ? undefined : args[dbIndex + 1];
  const dbArg = rawDb && !rawDb.startsWith("--") ? rawDb : undefined;

  return {
    args,
    help: has("--help", "-h"),
    apply: has("--apply"),
    dryRun: has("--dry-run"),
    dbFlagMissingValue: dbIndex !== -1 && !dbArg,
    dbArg,
  };
}

function resolveDbPath(dbArg) {
  if (dbArg) return path.resolve(dbArg);
  if (process.env.DB_PATH) return path.resolve(process.env.DB_PATH);
  return DEFAULT_DB_PATH;
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

/**
 * Resolves the flags/DB path shared by every tool and prints the banner.
 * Exits the process on --help, on contradictory flags, or on a bad --db.
 */
function start(toolName, helpText, argv) {
  const opts = parseArgs(argv);

  if (opts.help) {
    console.log(helpText.trim());
    process.exit(0);
  }

  if (opts.dbFlagMissingValue) {
    fail("--db requires a path argument.");
  }

  if (opts.apply && opts.dryRun) {
    fail("--apply and --dry-run contradict each other. Pass neither to preview, or --apply to write.");
  }

  const dbPath = resolveDbPath(opts.dbArg);
  const apply = opts.apply;

  console.log(toolName);
  console.log(`DB: ${dbPath}`);
  console.log(apply ? "Mode: APPLY — writing changes" : "Mode: PREVIEW (no changes written) — pass --apply to write");

  return { apply, preview: !apply, dbPath, opts };
}

/**
 * Opens the resolved database and matches the server's journal mode.
 * Refuses to run against a path that does not exist rather than creating an
 * empty, schema-less database.
 */
function openDb(dbPath) {
  if (!fs.existsSync(dbPath)) {
    fail(
      `database not found: ${dbPath}\n` +
        `Resolution order: --db <path> -> DB_PATH -> ${DEFAULT_DB_PATH}\n` +
        "Refusing to create an empty database (it would have no schema). " +
        "Point --db or DB_PATH at an existing, migrated database."
    );
  }

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  return db;
}

module.exports = {
  COMMON_HELP_FOOTER,
  DEFAULT_DB_PATH,
  fail,
  openDb,
  parseArgs,
  resolveDbPath,
  start,
};
