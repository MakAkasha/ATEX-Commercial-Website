"use strict";

/**
 * POST /api/contact — field validation and the per-IP rate limit.
 *
 * NO OUTBOUND REQUESTS. Verified against server/routes/contact.js: the
 * formsubmit.co call lives in `forwardContactEmail()`, which returns early when
 * `config.contactEmailForwardEnabled` is false. That flag is
 * CONTACT_EMAIL_FORWARD_ENABLED (server/config.js), which the harness pins to
 * "false" for every server it starts.
 *
 * Two server instances, because the rate limiter is process-global and keyed by
 * IP: the validation suite needs a limit high enough not to trip, and the rate
 * limit suite needs a limit low enough to trip deterministically. One instance
 * per suite — still never one per test.
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");

const { startServer } = require("./helpers/server");

const VALID_BODY = {
  name: "شركة الاختبار",
  whatsapp: "+966500000002",
  message: "هذه رسالة اختبار طويلة بما يكفي.",
};

describe("POST /api/contact validation", () => {
  let srv;

  before(async () => {
    srv = await startServer({
      label: "contact",
      env: { CONTACT_RATE_LIMIT_LIMIT: "1000" },
    });
  });

  after(async () => {
    await srv.stop();
  });

  it("the outbound email forward is disabled for this run", async () => {
    // Sanity check that the flag actually took: a successful submission reports
    // email_forwarded:false, which only happens when the fetch was never made.
    const res = await srv.post("/api/contact", VALID_BODY);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, email_forwarded: false });
  });

  it("missing name returns 400 MISSING_FIELDS", async () => {
    const res = await srv.post("/api/contact", { whatsapp: "+966500000003" });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "MISSING_FIELDS" });
  });

  it("missing whatsapp returns 400 MISSING_FIELDS", async () => {
    const res = await srv.post("/api/contact", { name: "شركة الاختبار" });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "MISSING_FIELDS" });
  });

  it("a badly formatted whatsapp returns 400 INVALID_WHATSAPP", async () => {
    const res = await srv.post("/api/contact", { name: "شركة الاختبار", whatsapp: "0500000004" });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "INVALID_WHATSAPP" });
  });

  it("a name shorter than 2 characters returns 400 INVALID_NAME", async () => {
    const res = await srv.post("/api/contact", { name: "أ", whatsapp: "+966500000005" });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "INVALID_NAME" });
  });

  it("a message under 10 characters returns 400 MESSAGE_TOO_SHORT", async () => {
    const res = await srv.post("/api/contact", {
      name: "شركة الاختبار",
      whatsapp: "+966500000006",
      message: "قصير",
    });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "MESSAGE_TOO_SHORT" });
  });

  it("a valid submission returns 200 { ok: true }", async () => {
    const res = await srv.post("/api/contact", {
      name: "شركة الاختبار المحدودة",
      companyName: "أتكس",
      commercialRegister: "1010101010",
      whatsapp: "+966500000007",
      message: "نرغب في الحصول على عرض سعر لنظام منزل ذكي.",
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
  });
});

describe("POST /api/contact rate limit", () => {
  let srv;

  before(async () => {
    srv = await startServer({
      label: "contactrl",
      env: { CONTACT_RATE_LIMIT_LIMIT: "3", CONTACT_RATE_LIMIT_WINDOW_MS: "60000" },
    });
  });

  after(async () => {
    await srv.stop();
  });

  it("with CONTACT_RATE_LIMIT_LIMIT=3, five valid submissions produce at least one 429", async () => {
    const statuses = [];
    for (let i = 0; i < 5; i += 1) {
      const res = await srv.post("/api/contact", {
        ...VALID_BODY,
        whatsapp: `+96650000100${i}`,
      });
      statuses.push(res.status);
    }

    assert.ok(
      statuses.includes(429),
      `expected at least one 429 within the window, got statuses [${statuses.join(", ")}]`
    );
    assert.equal(statuses.slice(0, 3).every((s) => s === 200), true, `first three should succeed: [${statuses.join(", ")}]`);
  });
});
