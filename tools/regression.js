/*
  Lightweight regression runner for the ATEX Express/EJS app.

  It checks:
  - Admin login (session cookie)
  - Blog CRUD: create draft -> publish -> verify public API + SSR pages -> delete
  - Upload: upload a 1x1 PNG via /api/uploads/images and verify it is served

  Usage:
    node tools/regression.js --base http://127.0.0.1:5173 --user admin-root --pass "..."

  Notes:
  - Requires Node 18+ (built-in fetch, FormData, Blob).
  - Designed to run against a running dev server.
*/

// FormData and Blob are Node 18+ built-ins on globalThis, but they are not in
// the shared node globals list the lint config uses. Declare them here rather
// than widening that list for every file.
/* global FormData, Blob */

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = { base: "http://127.0.0.1:5173" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base") args.base = argv[++i];
    else if (a === "--user") args.user = argv[++i];
    else if (a === "--pass") args.pass = argv[++i];
  }
  return args;
}

async function readText(res) {
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // ignore
  }
  return { text, json };
}

// The /api CSRF guard (server/middleware/csrf.js) rejects any state-changing
// request that presents no Origin. A browser always sends one; fetch() from Node
// does not, so this runner must set it explicitly to the base it is targeting.
const originOf = (base) => {
  try {
    return new URL(base).origin;
  } catch {
    return base;
  }
};

async function api(base, url, { method = "GET", cookie, headers = {}, body } = {}) {
  const h = { origin: originOf(base), ...headers };
  if (cookie) h.cookie = cookie;
  const res = await fetch(base + url, { method, headers: h, body });
  const { text, json } = await readText(res);
  return { status: res.status, headers: res.headers, text, json };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const { base, user, pass } = parseArgs(process.argv.slice(2));
  assert(base && user && pass, "Missing args. Usage: node tools/regression.js --base ... --user ... --pass ...");

  console.log("[regression] base:", base);

  // Login
  const loginRes = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: originOf(base) },
    body: JSON.stringify({ username: user, password: pass }),
  });
  const loginBody = await readText(loginRes);
  const setCookie = loginRes.headers.get("set-cookie") || "";
  const cookie = (setCookie.split(";")[0] || "").trim();
  assert(loginRes.status === 200, "Login failed: " + loginRes.status + " " + loginBody.text);
  assert(cookie.startsWith("atex.sid="), "Login did not return atex.sid cookie");
  console.log("[regression] login ok; cookie=atex.sid=...");

  // Cleanup leftover test posts
  const adminList = await api(base, "/api/posts", { cookie });
  assert(adminList.status === 200, "Admin list posts failed: " + adminList.status + " " + adminList.text);
  const leftover = (adminList.json?.posts || []).filter((p) => String(p.slug || "").startsWith("test-post-"));
  for (const p of leftover) {
    const del = await api(base, `/api/posts/${p.id}`, { method: "DELETE", cookie });
    console.log("[regression] cleanup delete post", p.id, p.slug, "=>", del.status);
  }

  // Create draft
  const slug = `test-post-${Date.now()}`;
  const title = "منشور اختبار";
  const post = {
    slug,
    title,
    excerpt: "ملخص سريع",
    cover_image: "",
    content_html: "<h2>محتوى</h2><p>هذا منشور اختبار.</p>",
    tags: ["اختبار"],
    published: 0,
  };
  const create = await api(base, "/api/posts", {
    method: "POST",
    cookie,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(post),
  });
  assert(create.status === 200 && create.json?.id, "Create draft failed: " + create.status + " " + create.text);
  const id = create.json.id;
  console.log("[regression] created draft", { id, slug });

  // Publish
  post.published = 1;
  const publish = await api(base, `/api/posts/${id}`, {
    method: "PUT",
    cookie,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(post),
  });
  assert(publish.status === 200, "Publish failed: " + publish.status + " " + publish.text);
  console.log("[regression] publish ok");

  // Verify public API
  const pub = await api(base, "/api/posts/public");
  assert(pub.status === 200, "Public posts failed: " + pub.status);
  const foundPublic = (pub.json?.posts || []).some((p) => p.slug === slug);
  assert(foundPublic, "Published post not found in /api/posts/public");
  console.log("[regression] public API ok");

  // Verify SSR pages
  const blog = await api(base, "/blog");
  assert(blog.status === 200, "/blog SSR failed: " + blog.status);
  assert(blog.text.includes(title), "SSR /blog did not contain post title");

  const blogPost = await api(base, `/blog/${slug}`);
  assert(blogPost.status === 200, "/blog/:slug SSR failed: " + blogPost.status);
  assert(blogPost.text.includes(title), "SSR /blog/:slug did not contain post title");

  const home = await api(base, "/");
  assert(home.status === 200, "/ SSR failed: " + home.status);
  assert(home.text.includes(title), "SSR home did not contain blog teaser title");
  console.log("[regression] SSR blog + home teaser ok");

  // Upload test
  const pngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO9Nn1kAAAAASUVORK5CYII=";
  const png = Buffer.from(pngBase64, "base64");
  const fd = new FormData();
  fd.append("image", new Blob([png], { type: "image/png" }), "tiny.png");
  const upRes = await fetch(base + "/api/uploads/images", {
    method: "POST",
    headers: { cookie, origin: originOf(base) },
    body: fd,
  });
  const upBody = await readText(upRes);
  assert(upRes.status === 200, "Upload failed: " + upRes.status + " " + upBody.text);
  assert(upBody.json?.url, "Upload response missing url");
  console.log("[regression] upload ok; url:", upBody.json.url);

  const img = await fetch(base + upBody.json.url);
  assert(img.status === 200, "Uploaded image not served: " + img.status);
  console.log("[regression] uploaded image served ok; content-type:", img.headers.get("content-type"));

  // Cleanup: delete created post
  const del = await api(base, `/api/posts/${id}`, { method: "DELETE", cookie });
  assert(del.status === 200, "Delete test post failed: " + del.status + " " + del.text);
  console.log("[regression] cleanup post ok");

  // Best-effort cleanup: delete uploaded image file if it exists on disk
  try {
    const rel = (upBody.json.url || "").replace(/^\/uploads\//, "");
    const diskPath = path.join(process.cwd(), "uploads", ...rel.split("/"));
    if (diskPath.includes(path.join(process.cwd(), "uploads"))) {
      if (fs.existsSync(diskPath)) {
        fs.unlinkSync(diskPath);
        console.log("[regression] cleanup uploaded image file ok");
      }
    }
  } catch (e) {
    console.log("[regression] cleanup uploaded image skipped:", e.message || String(e));
  }

  console.log("REGRESSION_OK");
}

main().catch((e) => {
  console.error("REGRESSION_FAIL", e && (e.stack || e.message) ? e.stack || e.message : e);
  process.exit(1);
});
