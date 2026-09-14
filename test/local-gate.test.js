"use strict";

/**
 * The local gate, and the hooks doctor it runs first.
 *
 * WHY THIS IS TESTED AT ALL. The failure both scripts guard against is invisible by
 * construction: an unwired hook makes `git push` FASTER and quieter, never louder, and
 * a deleted line in tools/gate.mjs removes a check with every other test still green.
 * The sibling repo (atex-portal) lost a whole branch's worth of pushes to exactly that.
 *
 * The gate's step list is asserted as DATA, not by grepping the source for a spelling —
 * a text assertion passes the moment somebody writes the same thing a different way.
 */

const assert = require("node:assert/strict");
const { describe, it, before } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = path.join(__dirname, "..");

let gate;
let doctor;

// The import is per-describe, not file-level. A top-level `before` in node:test does not
// gate the subtests of a sibling describe, and they are cancelled mid-flight instead of
// failing with a readable reason.
async function loadScripts() {
  gate = await import(pathToFileURL(path.join(ROOT, "tools", "gate.mjs")).href);
  doctor = await import(pathToFileURL(path.join(ROOT, "tools", "check-hooks.mjs")).href);
}

function hooksDirWith(contents) {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "hookdoctor-")), "hooks");
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(contents)) fs.writeFileSync(path.join(dir, name), body);
  return dir;
}

describe("the hooks doctor", () => {
  before(loadScripts);

  it("passes when git fires a pre-push that still runs the gate", () => {
    const result = doctor.inspectHooks({ hooksDir: hooksDirWith({ "pre-push": "npm run gate\n" }) });
    assert.equal(result.ok, true);
    assert.deepEqual(result.problems, []);
  });

  it("FAILS when the hooks directory git would use does not exist", () => {
    const result = doctor.inspectHooks({ hooksDir: path.join(os.tmpdir(), "definitely-not-here", "hooks") });
    assert.equal(result.ok, false);
    assert.match(result.problems.join("\n"), /does not exist/);
  });

  it("FAILS when the hook is missing outright", () => {
    const result = doctor.inspectHooks({ hooksDir: hooksDirWith({}) });
    assert.equal(result.ok, false);
    assert.match(result.problems.join("\n"), /pre-push/);
  });

  it('FAILS on an EMPTY hook — "the file exists" was true the day the hooks were dead', () => {
    const result = doctor.inspectHooks({ hooksDir: hooksDirWith({ "pre-push": "" }) });
    assert.equal(result.ok, false);
    assert.match(result.problems.join("\n"), /missing or empty/);
  });

  it("FAILS when the hook exists but no longer runs the gate — gutted, not deleted", () => {
    const result = doctor.inspectHooks({ hooksDir: hooksDirWith({ "pre-push": "echo hi\n" }) });
    assert.equal(result.ok, false);
    assert.match(result.problems.join("\n"), /gates nothing/);
  });

  it("treats 'not a git checkout' as nothing-to-wire, not as a failure", () => {
    assert.equal(doctor.inspectHooks({ hooksDir: null }).ok, true);
    assert.equal(doctor.inspectHooks({ hooksDir: null }).notAGitRepo, true);
  });
});

describe("the gate's step list", () => {
  before(loadScripts);

  const cmds = () => gate.STEPS.map((s) => s.cmd || "").join("\n");

  it("runs the hooks doctor FIRST — a dead hook is worth knowing in one second", () => {
    assert.match(gate.STEPS[0].cmd, /check-hooks/);
  });

  it("still runs every check ci.yml declares", () => {
    // ci.yml: seed manifest parse, `npm run lint`, `npm test`. Change one there, change
    // it in tools/gate.mjs — and this test is what notices when only one of them moves.
    assert.match(cmds(), /catalog-products\.json/);
    assert.match(cmds(), /npm run lint/);
    assert.match(cmds(), /npm test/);
  });

  it("also builds, which ci.yml does not", () => {
    assert.match(cmds(), /npm run build/);
  });

  it("has no step that silently cannot fail", () => {
    // Every step here is 'blocking'. If a 'skip' or 'advisory' kind is ever added, it must
    // carry a reason, because a step reported without one reads as a pass.
    for (const step of gate.STEPS) {
      if (step.kind === "blocking") {
        assert.ok(step.cmd, `blocking step "${step.name}" has no command`);
      } else {
        assert.ok(step.skipReason, `non-blocking step "${step.name}" must say why`);
      }
    }
  });

  it("names scripts that are actually on disk", () => {
    for (const named of cmds().match(/tools\/[\w.-]+\.mjs/g) || []) {
      assert.ok(fs.statSync(path.join(ROOT, named)).isFile(), `${named} is missing`);
    }
  });
});
