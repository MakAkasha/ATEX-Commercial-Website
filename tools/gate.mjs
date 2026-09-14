#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════════
// gate.mjs — the local stand-in for CI.
//
// WHY THIS EXISTS. Every gate in .github/workflows/ci.yml is currently gating
// nothing: GitHub Actions is billing-blocked at the account level, so no run has
// started since ~2026-08-26 (they die in 4-9s with "The job was not started
// because recent account payments have failed or your spending limit needs to be
// increased"). Until that is paid, this file is the only thing that can say
// whether the tree is sound.
//
// It REUSES the commands ci.yml declares rather than reimplementing them: the same
// seed-manifest parse, the same `npm run lint`, the same `npm test`. Change one
// there, change it here. Same shape as atex-portal/scripts/gate.mjs, deliberately —
// one habit, three repositories.
//
// WHAT CI DOES THAT THIS CANNOT: ci.yml runs the suite on BOTH Node 22.x and 24.x.
// This runs whatever node is on your PATH, once. A version-specific break is the
// one class of failure it can miss.
//
// TWO RULES IT MUST KEEP:
//
//   1. RUN EVERYTHING, THEN REPORT. It does NOT stop at the first failure. You need
//      the whole list of what is broken in one pass, not one item per re-run. Exit
//      code is non-zero if ANY step failed.
//
//   2. A STEP THAT CANNOT RUN IS "SKIPPED", NEVER "PASS". Counting a step that never
//      executed as green is the exact lie this script was written to avoid.
//
// THERE IS NO `gate:full` HERE, unlike atex-portal. Everything this repo can check is
// cheap: measured 2026-09-14, the whole run is ~24s and `vite build` is 0.6s of it. A
// second, slower tier would only be a tier people skip. If a check is ever added that
// needs a network or a browser, split then — not before.
//
// USAGE
//   npm run gate        — hooks, seed manifest, lint, tests, build
// ══════════════════════════════════════════════════════════════════════════════

import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// kind: 'blocking' — non-zero exit is a FAIL.
//       'skip'     — cannot reach a verdict here; reported SKIPPED with `skipReason`.
const steps = [
  // FIRST, AND CHEAP ON PURPOSE. A hook that is not wired runs nothing and says nothing;
  // it makes `git push` faster and quieter, never louder. The gate is the one thing run by
  // hand, so it is the one place that can report that the automatic checks are dead.
  { name: 'guard: git hooks wired', cmd: 'node tools/check-hooks.mjs', kind: 'blocking' },
  // ci.yml's own targeted guard: the catalog seed manifest is parsed with a bare try/catch
  // in server/db.js, so invalid JSON there fails SILENTLY at runtime.
  {
    name: 'guard: catalog seed manifest parses',
    cmd: 'node -e "JSON.parse(require(\'fs\').readFileSync(\'server/data/catalog-products.json\',\'utf8\'))"',
    kind: 'blocking',
  },
  { name: 'lint', cmd: 'npm run lint', kind: 'blocking' },
  { name: 'tests', cmd: 'npm test', kind: 'blocking' },
  // CI does not build. It costs 0.6s here, and a broken `vite build` is a broken deploy,
  // so there is no reason for this to be the one thing nobody checks before pushing.
  { name: 'build', cmd: 'npm run build', kind: 'blocking' },
];

// Exported as DATA, not read as text, for the reason atex-portal's gate documents: a test
// that greps the source for a spelling passes the moment somebody writes it differently,
// and a deleted wiring line is a removed gate with every test still green.
export const STEPS = steps;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(runGate());
}

export function runGate() {
  const results = [];

  for (const step of steps) {
    if (step.kind === 'skip') {
      console.log(`\n──────── ${step.name} — SKIPPED ────────\n${step.skipReason}`);
      results.push({ ...step, status: 'SKIPPED', reason: step.skipReason });
      continue;
    }

    console.log(`\n──────── ${step.name} ────────\n$ ${step.cmd}`);
    const started = Date.now();
    const { status } = spawnSync(step.cmd, { shell: true, stdio: 'inherit' });
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    results.push({ ...step, status: status === 0 ? 'PASS' : 'FAIL', exit: status, secs });
  }

  const failed = results.filter((r) => r.status === 'FAIL');
  const skipped = results.filter((r) => r.status === 'SKIPPED');
  const passed = results.filter((r) => r.status === 'PASS');

  console.log(`\n${'═'.repeat(78)}\nGATE SUMMARY\n${'═'.repeat(78)}`);
  for (const r of results) {
    const time = r.secs ? `${r.secs}s` : '—';
    const tail = r.status === 'SKIPPED' ? `  ← ${r.reason}` : r.status === 'FAIL' ? `  ← exit ${r.exit}` : '';
    console.log(`  ${r.status.padEnd(7)} ${r.name.padEnd(34)} ${time.padStart(8)}${tail}`);
  }
  console.log(
    `${'─'.repeat(78)}\n  ${passed.length} passed · ${failed.length} failed · ${skipped.length} skipped (not passed)`,
  );
  console.log('  Note: CI runs this on Node 22.x AND 24.x. This ran once, on your node.');

  if (failed.length) {
    console.log(`\n  FAILED: ${failed.map((r) => r.name).join(', ')}`);
    return 1;
  }
  console.log('\n  No failures. Any skipped step above is UNVERIFIED, not green.');
  return 0;
}
