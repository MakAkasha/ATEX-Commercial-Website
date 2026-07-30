"use strict";

/**
 * The /api CSRF origin guard in server/app.js.
 *
 * This file DOCUMENTS CURRENT BEHAVIOUR — including two known weaknesses. It is
 * deliberately not a fix. The guard is:
 *
 *     const origin = req.get("origin") || req.get("referer") || "";
 *     const host   = req.get("host");
 *     if (origin && host && !origin.startsWith(`${req.protocol}://${host}`)) -> 403
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

  it("rejects a cross-origin Origin with 403 CSRF_REJECTED", async () => {
    const res = await srv.post("/api/contact", VALID_CONTACT_BODY, {
      headers: { origin: "https://evil.example" },
    });
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), { error: "CSRF_REJECTED" });
  });

  it("allows a matching Origin (not 403)", async () => {
    const res = await srv.post("/api/contact", VALID_CONTACT_BODY, {
      headers: { origin: srv.origin },
    });
    assert.notEqual(res.status, 403, "a same-origin POST must pass the guard");
    assert.equal(res.status, 200);
  });

  // ---------------------------------------------------------------------------
  // KNOWN GAPS — pinned as TODAY'S behaviour, not as desired behaviour.
  //
  // PR `fix/csrf-origin-validation` will INVERT both of the two tests below.
  // When that PR lands, each `assert.notEqual(..., 403)` becomes
  // `assert.equal(..., 403)`. They exist so the fix cannot be shipped without
  // consciously updating this file — i.e. so the behaviour change is visible in
  // the diff rather than silent.
  // ---------------------------------------------------------------------------

  describe("KNOWN GAP (currently accepted) — will be inverted by fix/csrf-origin-validation", () => {
    it("GAP A: a request with NO Origin and NO Referer currently passes the guard", async () => {
      // `origin` resolves to "" and the guard's `if (origin && ...)` short-circuits,
      // so any client that simply omits both headers is never checked at all.
      const res = await srv.post("/api/contact", VALID_CONTACT_BODY);
      assert.notEqual(
        res.status,
        403,
        "CURRENT behaviour: a header-less POST is not rejected. If this now returns 403, " +
          "the CSRF fix has landed — invert this assertion to assert.equal(res.status, 403)."
      );
      assert.equal(res.status, 200);
    });

    it("GAP B: a Referer of http://127.0.0.1:<port>.evil.example/ currently passes the guard", async () => {
      // `startsWith` is a prefix test, not an origin comparison, so any hostname
      // that merely BEGINS with "<host>" satisfies it — including a suffixed
      // attacker domain.
      const spoofed = `${srv.origin}.evil.example/`;
      const res = await srv.post("/api/contact", VALID_CONTACT_BODY, {
        headers: { referer: spoofed },
      });
      assert.notEqual(
        res.status,
        403,
        `CURRENT behaviour: referer "${spoofed}" is accepted because the guard uses ` +
          "String.startsWith on the origin. If this now returns 403, the CSRF fix has " +
          "landed — invert this assertion to assert.equal(res.status, 403)."
      );
      assert.equal(res.status, 200);
    });
  });
});
