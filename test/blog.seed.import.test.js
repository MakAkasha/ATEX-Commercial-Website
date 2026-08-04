"use strict";

/**
 * The write path of tools/import-blog-seeds.js.
 *
 * Why this exists: upsertPost() used to force `published = 1` on UPDATE as well
 * as on INSERT, so every re-import silently republished any seed-managed post an
 * admin had deliberately unpublished — against production, where the seed slugs
 * map to live posts. The seed file owns the article's content; the admin owns
 * its visibility. Nothing else in the suite covers the UPDATE branch.
 *
 * The second half pins the guard that turns "no such column: meta_description"
 * (what you get running the importer before the app has been restarted and has
 * migrated the database) into an actionable DATABASE_NOT_MIGRATED error.
 *
 * The last two suites pin the two scope controls: --only, and the refuse-drift
 * default that makes a forgotten flag harmless.
 */

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { after, before, describe, it } = require("node:test");

const Database = require("better-sqlite3");

const { makeTempDbPath, removeTempDb, REPO_ROOT } = require("./helpers/server");

const TOOL = path.join(REPO_ROOT, "tools", "import-blog-seeds.js");

// Must be set before server/db.js is required — it reads DB_PATH at load.
const DB_PATH = makeTempDbPath("import");
process.env.DB_PATH = DB_PATH;

const { getDb, migrate } = require("../server/db");
const { buildPosts, classifyPost, upsertPost } = require("../tools/import-blog-seeds");

/** The post-migration shape of `posts`, so a raw DB can stand in for production. */
const MIGRATED_POSTS_SCHEMA =
  "CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, " +
  "title TEXT NOT NULL, excerpt TEXT NOT NULL DEFAULT '', cover_image TEXT NOT NULL DEFAULT '', " +
  "content_html TEXT NOT NULL DEFAULT '', tags_json TEXT NOT NULL DEFAULT '[]', " +
  "published INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), " +
  "updated_at TEXT NOT NULL DEFAULT (datetime('now')), meta_description TEXT NOT NULL DEFAULT '', " +
  "og_title TEXT NOT NULL DEFAULT '', og_description TEXT NOT NULL DEFAULT '', " +
  "cover_image_alt TEXT NOT NULL DEFAULT '')";

/** A slug that exists in the seed files and, in production, has been edited since. */
const DRIFTED_SLUG = "smart-home-system-saudi-arabia-guide";
/** A slug the seed files define but production does not have — an INSERT. */
const NEW_SLUG = "smart-home-wired-vs-wireless-saudi-arabia";

/** Inserts a row that has drifted from its seed file, as production's has. */
function insertDriftedRow(db) {
  db.prepare("INSERT INTO posts (slug, title, content_html, published) VALUES (?, ?, ?, 1)").run(
    DRIFTED_SLUG,
    "Hand-edited title",
    "<p>Hand-edited body that must survive.</p>"
  );
}

function readRow(dbPath, slug) {
  const db = new Database(dbPath, { readonly: true });
  const row = db
    .prepare(
      "SELECT title, excerpt, cover_image, content_html, tags_json, meta_description, " +
        "og_title, og_description, cover_image_alt, published FROM posts WHERE slug = ?"
    )
    .get(slug);
  db.close();
  return row;
}

/** A parsed-seed-shaped post, as buildPosts() produces. */
function seedPost(slug, overrides = {}) {
  return {
    slug,
    title: "Seed title",
    excerpt: "Seed excerpt",
    cover_image: "/uploads/cover.jpg",
    content_html: "<p>Seed body</p>",
    tags: ["smart-home"],
    meta_description: "Seed meta description",
    og_title: "Seed og title",
    og_description: "Seed og description",
    cover_image_alt: "Seed cover alt",
    ...overrides,
  };
}

function runTool(args, env = {}) {
  return spawnSync(process.execPath, [TOOL, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    windowsHide: true,
    env: {
      ...process.env,
      NODE_PATH: process.env.NODE_PATH || path.join(REPO_ROOT, "node_modules"),
      ...env,
    },
  });
}

describe("import-blog-seeds upsertPost", () => {
  let db;

  before(() => {
    migrate();
    db = getDb();
  });

  after(() => {
    try {
      db.close();
    } catch {
      // Already closed.
    }
    removeTempDb(DB_PATH);
  });

  it("inserts a new post published", () => {
    const result = upsertPost(db, seedPost("brand-new-post"));
    assert.equal(result.action, "created");
    const row = db.prepare("SELECT published, title FROM posts WHERE slug = ?").get("brand-new-post");
    assert.equal(row.published, 1);
    assert.equal(row.title, "Seed title");
  });

  it("leaves an unpublished post unpublished while still updating its content", () => {
    db.prepare("INSERT INTO posts (slug, title, content_html, published) VALUES (?, ?, ?, 0)").run(
      "admin-unpublished",
      "Old title",
      "<p>Old body</p>"
    );

    const result = upsertPost(db, seedPost("admin-unpublished", { title: "New title" }));
    assert.equal(result.action, "updated");

    const row = db.prepare("SELECT published, title, content_html FROM posts WHERE slug = ?").get("admin-unpublished");
    assert.equal(row.published, 0, "a re-import must not republish a post an admin unpublished");
    assert.equal(row.title, "New title");
    assert.equal(row.content_html, "<p>Seed body</p>");
  });

  it("leaves a published post published", () => {
    db.prepare("INSERT INTO posts (slug, title, published) VALUES (?, ?, 1)").run("live-post", "Old title");
    upsertPost(db, seedPost("live-post"));
    assert.equal(db.prepare("SELECT published FROM posts WHERE slug = ?").get("live-post").published, 1);
  });

  it("does not report a published change the apply run will not make", () => {
    // The preview reads `published` back off the row for exactly this reason: a
    // hardcoded 1 made an unpublished-but-otherwise-identical row look like a
    // pending update that would publish it.
    const post = seedPost("preview-unpublished");
    db.prepare("INSERT INTO posts (slug, title, published) VALUES (?, ?, 0)").run(post.slug, "Old title");
    upsertPost(db, post);

    const verdict = classifyPost(db, post);
    assert.equal(verdict.action, "unchanged");
    assert.deepEqual(verdict.differing, []);
    assert.equal(verdict.next.published, 0);
  });
});

describe("import-blog-seeds migration guard", () => {
  const rawDbPath = makeTempDbPath("unmigrated");

  before(() => {
    const raw = new Database(rawDbPath);
    // The pre-migration shape: posts exists, the SEO columns do not.
    raw.exec(
      "CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, " +
        "title TEXT NOT NULL, excerpt TEXT NOT NULL DEFAULT '', cover_image TEXT NOT NULL DEFAULT '', " +
        "content_html TEXT NOT NULL DEFAULT '', tags_json TEXT NOT NULL DEFAULT '[]', " +
        "published INTEGER NOT NULL DEFAULT 0)"
    );
    raw.close();
  });

  after(() => removeTempDb(rawDbPath));

  it("stops with an actionable error instead of a raw SQLite exception", () => {
    const res = runTool(["--db", rawDbPath]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /DATABASE_NOT_MIGRATED/);
    assert.match(res.stderr, /meta_description/);
    assert.match(res.stderr, /Restart the app/i);
    assert.doesNotMatch(res.stderr, /no such column/);
  });

  it("documents the restart-before-import ordering in --help", () => {
    const res = runTool(["--help"]);
    assert.equal(res.status, 0);
    assert.match(res.stdout, /DEPLOY ORDER/);
    assert.match(res.stdout, /restart the app BEFORE running this tool/i);
  });
});

/**
 * --only scopes a run to named slugs. Every other seed file is left completely
 * alone: not compared against the database, not written.
 */
describe("import-blog-seeds --only", () => {
  const dbPath = makeTempDbPath("only");

  before(() => {
    const db = new Database(dbPath);
    db.exec(MIGRATED_POSTS_SCHEMA);
    insertDriftedRow(db);
    db.close();
  });

  after(() => removeTempDb(dbPath));

  it("imports only the named slugs and reports what it left alone", () => {
    const res = runTool(["--db", dbPath, "--only", NEW_SLUG]);
    assert.equal(res.status, 0);
    assert.match(res.stdout, /importing 1, leaving 7 untouched/);
    assert.match(res.stdout, new RegExp(`WOULD CREATE ${NEW_SLUG}`));
    assert.doesNotMatch(res.stdout, new RegExp(DRIFTED_SLUG));
  });

  it("--apply leaves an unnamed slug's stored row byte-identical", () => {
    const before_ = readRow(dbPath, DRIFTED_SLUG);

    const res = runTool(["--db", dbPath, "--apply", "--only", NEW_SLUG]);
    assert.equal(res.status, 0);

    assert.deepEqual(readRow(dbPath, DRIFTED_SLUG), before_, "an unnamed slug's row was rewritten");

    const db = new Database(dbPath, { readonly: true });
    const added = db.prepare("SELECT published FROM posts WHERE slug = ?").get(NEW_SLUG);
    const total = db.prepare("SELECT COUNT(*) AS n FROM posts").get().n;
    db.close();
    assert.ok(added, "the named slug was not inserted");
    assert.equal(added.published, 1, "a newly inserted post should be published");
    assert.equal(total, 2, "exactly one row should have been added");
  });

  it("fails on a slug no seed file defines rather than importing nothing", () => {
    const res = runTool(["--db", dbPath, "--only", "not-a-real-slug"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /no seed file defines: not-a-real-slug/);
    assert.match(res.stderr, /Known slugs:/);
  });

  it("fails when --only is given no value", () => {
    const res = runTool(["--db", dbPath, "--only"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /--only requires a slug argument/);
  });
});

/**
 * The safety property that does not depend on anyone remembering a flag: an
 * --apply run never rewrites a stored post that has drifted from its seed file
 * unless --allow-overwrite says so.
 *
 * Production's stored copies of the three original seed slugs have been edited
 * since they were seeded (one is 18x the size of its seed file). Before this
 * guard, importing an unrelated new article reverted all three in the same run,
 * with no signal beyond a WOULD UPDATE line in a preview nobody had to read.
 */
describe("import-blog-seeds drift guard", () => {
  const dbPath = makeTempDbPath("drift");

  before(() => {
    const db = new Database(dbPath);
    db.exec(MIGRATED_POSTS_SCHEMA);
    insertDriftedRow(db);
    db.close();
  });

  after(() => removeTempDb(dbPath));

  it("previews a drifted post as REFUSED, not as a pending update", () => {
    const res = runTool(["--db", dbPath]);
    assert.equal(res.status, 0);
    assert.match(res.stdout, new RegExp(`WOULD REFUSE ${DRIFTED_SLUG}`));
    assert.match(res.stdout, /stored content has drifted/);
    assert.doesNotMatch(res.stdout, new RegExp(`WOULD UPDATE ${DRIFTED_SLUG}`));
    assert.match(res.stdout, /1 refused/);
    assert.match(res.stdout, /--allow-overwrite/);
  });

  it("--apply refuses the drifted post while still inserting the new ones", () => {
    const before_ = readRow(dbPath, DRIFTED_SLUG);

    const res = runTool(["--db", dbPath, "--apply"]);
    assert.equal(res.status, 0);
    assert.match(res.stdout, new RegExp(`REFUSED\\s+${DRIFTED_SLUG}`));

    assert.deepEqual(
      readRow(dbPath, DRIFTED_SLUG),
      before_,
      "an --apply run without --allow-overwrite rewrote a drifted post"
    );
    assert.ok(readRow(dbPath, NEW_SLUG), "a brand-new slug should still be inserted");
  });

  it("--allow-overwrite is what actually rewrites the drifted post", () => {
    const res = runTool(["--db", dbPath, "--apply", "--allow-overwrite", "--only", DRIFTED_SLUG]);
    assert.equal(res.status, 0);
    assert.match(res.stdout, new RegExp(`UPDATED\\s+${DRIFTED_SLUG}`));

    const row = readRow(dbPath, DRIFTED_SLUG);
    assert.notEqual(row.title, "Hand-edited title", "--allow-overwrite should have replaced the stored title");
    assert.equal(row.published, 1, "an overwrite still leaves publication state as the admin set it");
  });

  it("documents both scope flags in --help", () => {
    const res = runTool(["--help"]);
    assert.equal(res.status, 0);
    assert.match(res.stdout, /--only <slug>/);
    assert.match(res.stdout, /--allow-overwrite/);
    assert.match(res.stdout, /DRIFT IS REFUSED BY DEFAULT/);
  });
});

/**
 * The three backfill seeds (blog_post_no6-no8) are byte-faithful copies of posts
 * an admin wrote in the editor. They must classify as UNCHANGED against a
 * database holding those posts — if the trim handling regressed they would read
 * as drift and be refused forever, which is how the trailing-newline bug
 * surfaced the first time.
 */
describe("import-blog-seeds backfilled posts", () => {
  const dbPath = makeTempDbPath("backfill");
  const backfillSlugs = ["hotel-automation-guest-experience", "dali-smart-lighting-control", "ev-chargers-real-estate-projects"];

  before(() => {
    const db = new Database(dbPath);
    db.exec(MIGRATED_POSTS_SCHEMA);
    const { posts } = buildPosts();
    backfillSlugs.forEach((slug) => {
      const post = posts.find((p) => p.slug === slug);
      assert.ok(post, `no seed file defines ${slug}`);
      db.prepare(
        "INSERT INTO posts (slug, title, excerpt, cover_image, content_html, tags_json, meta_description, " +
          "og_title, og_description, cover_image_alt, published) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)"
      ).run(
        post.slug,
        post.title,
        post.excerpt,
        post.cover_image,
        post.content_html,
        JSON.stringify(post.tags),
        post.meta_description,
        post.og_title,
        post.og_description,
        post.cover_image_alt
      );
    });
    db.close();
  });

  after(() => removeTempDb(dbPath));

  it("import as UNCHANGED, so the drift guard never fires on them", () => {
    const res = runTool(["--db", dbPath, ...backfillSlugs.flatMap((s) => ["--only", s])]);
    assert.equal(res.status, 0);
    backfillSlugs.forEach((slug) => assert.match(res.stdout, new RegExp(`UNCHANGED\\s+${slug}`)));
    assert.match(res.stdout, /0 created, 0 updated, 3 unchanged, 0 refused/);
    assert.doesNotMatch(res.stdout, /REFUSE/);
  });
});
