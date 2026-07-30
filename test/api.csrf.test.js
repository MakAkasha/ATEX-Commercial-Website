"use strict";

/**
 * The /api CSRF origin guard (server/middleware/csrf.js).
 *
 * This file asserts the FIXED behaviour introduced by fix/csrf-origin-validation.
 *
 * It replaces the version added on test/backend-smoke-tests (PR #3), which
 * pinned two then-current weaknesses as accepted:
 *   GAP A — a POST with no Origin and no Referer passed the guard.
 *   GAP B — a Referer of "http://<host>.evil.example/" passed the guard, because
 *           the old guard used String.startsWith instead of comparing origins.
 * Both are now rejections. The two tests below marked "was GAP A/B" are the
 * inverted versions of those assertions. On merge this file CONFLICTS with
 * PR #3's copy, and PR #3's copy must lose.
 *
 * No outbound request is possible from these tests: the harness sets
 * CONTACT_EMAIL_FORWARD_ENABLED=false, so /api/contact never calls formsubmit.co.
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");

const { startServer } = require("./helpers/server");

const VALID_CONTACT_BODY = {
  name: "اختبار",
  whatsapp: "+966500000001",
  message: "رسالة اختبار كافية الطول لتجاوز الحد الأدنى.",
};

async function assertRejected(res, context) {
  assert.equal(res.status, 403, `${context}: expected 403, got ${res.status}`);
  assert.deepEqual(await res.json(), { error: "CSRF_REJECTED" }, `${context}: wrong body`);
}

describe("CSRF origin guard on /api", () => {
  let srv;

  before(async () => {
    srv = await startServer({
      label: "csrf",
      // Keep the contact limiter out of the way — this file is about the guard.
      env: { CONTACT_RATE_LIMIT_LIMIT: "1000" },
    });
  });

  after(async () => {
    await srv.stop();
  });

  // ---- the happy path must keep working -----------------------------------

  it("allows a same-origin POST (admin panel / contact form shape)", async () => {
    const res = await srv.post("/api/contact", VALID_CONTACT_BODY, {
      headers: { origin: srv.origin },
    });
    assert.equal(res.status, 200, "a same-origin POST must pass the guard");
  });

  it("allows a same-origin POST that presents only a Referer with a path", async () => {
    const res = await srv.post("/api/contact", VALID_CONTACT_BODY, {
      headers: { referer: `${srv.origin}/contact-us?utm=x` },
    });
    assert.equal(res.status, 200);
  });

  // ---- cross-origin rejections --------------------------------------------

  it("rejects a cross-origin Origin with 403 CSRF_REJECTED", async () => {
    const res = await srv.post("/api/contact", VALID_CONTACT_BODY, {
      headers: { origin: "https://evil.example" },
    });
    await assertRejected(res, "cross-origin Origin");
  });

  it("was GAP A: rejects a POST with NO Origin and NO Referer", async () => {
    // Previously `origin` resolved to "" and the guard short-circuited, so any
    // client that simply omitted both headers was never checked at all.
    const res = await srv.post("/api/contact", VALID_CONTACT_BODY);
    await assertRejected(res, "header-less POST");
  });

  it("was GAP B: rejects a suffix attack — Referer http://<host>.evil.example/", async () => {
    // The old guard's String.startsWith accepted any hostname merely BEGINNING
    // with the request host, so an attacker could suffix their own domain.
    const res = await srv.post("/api/contact", VALID_CONTACT_BODY, {
      headers: { referer: `${srv.origin}.evil.example/` },
    });
    await assertRejected(res, "suffix-attack Referer");
  });

  it("rejects a userinfo attack — Origin http://<host>@evil.example", async () => {
    // Also a startsWith bypass: everything before the "@" is userinfo, so the
    // real host is evil.example. URL parsing sees through it; prefix matching
    // does not.
    const res = await srv.post("/api/contact", VALID_CONTACT_BODY, {
      headers: { origin: `${srv.origin}@evil.example` },
    });
    await assertRejected(res, "userinfo-attack Origin");
  });

  it("rejects when the request hostname is a prefix of the presented hostname", async () => {
    // The "atex.sa" vs "atex.sa.attacker.example" shape, expressed against this
    // server's 127.0.0.1 host so that the URL still parses (a suffix appended
    // AFTER the port, as in the test above, makes the port invalid and is caught
    // one branch earlier).
    const res = await srv.post("/api/contact", VALID_CONTACT_BODY, {
      headers: { origin: `http://127.0.0.1.evil.example:${srv.port}` },
    });
    await assertRejected(res, "host-is-prefix-of-attacker-host");
  });

  it("rejects when the presented host is a prefix of the request host", async () => {
    // e.g. Origin "http://127.0.0.1:517" against a server on 127.0.0.1:5173.
    const truncated = String(srv.port).slice(0, -1) || "1";
    const res = await srv.post("/api/contact", VALID_CONTACT_BODY, {
      headers: { origin: `http://127.0.0.1:${truncated}` },
    });
    await assertRejected(res, "attacker-host-is-prefix-of-host");
  });

  it("rejects a port mismatch on the same hostname", async () => {
    const otherPort = srv.port === 65535 ? 65534 : srv.port + 1;
    const res = await srv.post("/api/contact", VALID_CONTACT_BODY, {
      headers: { origin: `http://127.0.0.1:${otherPort}` },
    });
    await assertRejected(res, "port mismatch");
  });

  it("rejects a same-hostname origin with no port when the server has one", async () => {
    const res = await srv.post("/api/contact", VALID_CONTACT_BODY, {
      headers: { origin: "http://127.0.0.1" },
    });
    await assertRejected(res, "missing port");
  });

  // ---- malformed input must 403, never 500 --------------------------------

  for (const malformed of ["not a url", "http://", "://nope", "null", "javascript:alert(1)//"]) {
    it(`rejects a malformed Origin ${JSON.stringify(malformed)} with 403, not 500`, async () => {
      const res = await srv.post("/api/contact", VALID_CONTACT_BODY, {
        headers: { origin: malformed },
      });
      assert.ok(res.status < 500, `expected no server error, got ${res.status}`);
      await assertRejected(res, `malformed origin ${malformed}`);
    });
  }

  // ---- safe methods are untouched -----------------------------------------

  it("leaves GET unaffected even with a hostile Origin", async () => {
    const res = await srv.get("/api/auth/me", { headers: { origin: "https://evil.example" } });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { admin: null });
  });

  it("leaves HEAD unaffected even with a hostile Origin", async () => {
    const res = await fetch(`${srv.origin}/api/auth/me`, {
      method: "HEAD",
      headers: { origin: "https://evil.example" },
    });
    assert.notEqual(res.status, 403);
  });

  it("leaves OPTIONS unaffected even with a hostile Origin", async () => {
    const res = await fetch(`${srv.origin}/api/auth/me`, {
      method: "OPTIONS",
      headers: { origin: "https://evil.example" },
    });
    assert.notEqual(res.status, 403);
  });
});

describe("CSRF origin guard — ALLOWED_ORIGINS escape hatch", () => {
  const PARTNER = "https://partner.atex.example";
  let srv;

  before(async () => {
    srv = await startServer({
      label: "csrfallow",
      env: {
        CONTACT_RATE_LIMIT_LIMIT: "1000",
        ALLOWED_ORIGINS: `${PARTNER}, https://second.atex.example`,
      },
    });
  });

  after(async () => {
    await srv.stop();
  });

  it("accepts an Origin listed in ALLOWED_ORIGINS", async () => {
    const res = await srv.post("/api/contact", VALID_CONTACT_BODY, {
      headers: { origin: PARTNER },
    });
    assert.equal(res.status, 200, "an allowlisted origin must pass the guard");
  });

  it("accepts the second, whitespace-padded ALLOWED_ORIGINS entry", async () => {
    const res = await srv.post("/api/contact", VALID_CONTACT_BODY, {
      headers: { origin: "https://second.atex.example" },
    });
    assert.equal(res.status, 200);
  });

  it("still rejects an origin that is NOT in ALLOWED_ORIGINS", async () => {
    const res = await srv.post("/api/contact", VALID_CONTACT_BODY, {
      headers: { origin: "https://evil.example" },
    });
    await assertRejected(res, "non-allowlisted origin");
  });

  it("does not allow the atex.sa.attacker.example suffix shape against an allowlisted origin", async () => {
    const res = await srv.post("/api/contact", VALID_CONTACT_BODY, {
      headers: { origin: `${PARTNER}.evil.example` },
    });
    await assertRejected(res, "suffixed allowlisted origin");
  });

  it("does not allow a subdomain of an allowlisted origin", async () => {
    const res = await srv.post("/api/contact", VALID_CONTACT_BODY, {
      headers: { origin: `https://sub.partner.atex.example` },
    });
    await assertRejected(res, "subdomain of allowlisted origin");
  });

  it("still allows the server's own origin", async () => {
    const res = await srv.post("/api/contact", VALID_CONTACT_BODY, {
      headers: { origin: srv.origin },
    });
    assert.equal(res.status, 200);
  });
});
