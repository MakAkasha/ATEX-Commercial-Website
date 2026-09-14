#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════════
// check-hooks.mjs — make an UNWIRED git hook loud instead of silent.
//
// WHY THIS EXISTS. An unwired hook is invisible by construction: it makes `git push`
// FASTER and quieter, never louder. The sibling repo (atex-portal) lost a whole
// branch's worth of pushes to exactly that — the hook file existed, git was reading
// a different directory, and every push reported success in four seconds.
//
// The resolution rule is not guessed here. This asks git which directory it will
// actually use (`git rev-parse --git-path hooks`), so it stays correct whether
// core.hooksPath is absolute, relative, unset, or resolved differently by a future
// git, and in a linked worktree as well as the main checkout.
//
// It also refuses to accept a hook that merely EXISTS: an empty file, or one that
// no longer runs the gate, is the silent case all over again. Hooks are NOT tracked
// by git, so a fresh clone has none until `npm run hooks:install` runs.
//
// EXIT CODES
//   0  hooks wired (or this is not a git checkout at all — nothing to wire)
//   1  a required hook is missing, empty, or no longer runs what it should
// ══════════════════════════════════════════════════════════════════════════════

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Each entry: the hook git fires, and a substring the REAL script must still contain.
// The substring is the point of the hook, not its spelling — a pre-push that no longer
// runs the gate is a file, not a check. Only pre-push is required here: this repo runs
// nothing on commit, and its whole gate is short enough to afford on every push.
export const REQUIRED = [{ name: 'pre-push', mustMention: 'gate' }];

export const FIX = 'npm run hooks:install';

/** The directory git will actually read hooks from, or null if this is not a git checkout. */
export function resolveHooksDir(root = process.cwd()) {
  const r = spawnSync('git', ['rev-parse', '--git-path', 'hooks'], { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) return null;
  const p = r.stdout.trim();
  if (!p) return null;
  return path.isAbsolute(p) ? p : path.resolve(root, p);
}

/**
 * Pure over the filesystem: given a resolved hooks directory, report what is wrong.
 * Exported so a test can pin the VERDICT without installing or removing real hooks.
 */
export function inspectHooks({ hooksDir, required = REQUIRED }) {
  const problems = [];

  if (!hooksDir) {
    return { ok: true, notAGitRepo: true, hooksDir: null, problems };
  }

  if (!existsSync(hooksDir)) {
    problems.push(
      `the hooks directory git would use does not exist: ${hooksDir}\n` +
        '      This is the worktree trap: core.hooksPath is a RELATIVE path, so every worktree\n' +
        '      needs its own copy, and the directory is not tracked by git.',
    );
    return { ok: false, hooksDir, problems };
  }

  for (const { name, mustMention } of required) {
    const fired = path.join(hooksDir, name);
    if (!existsSync(fired) || statSync(fired).size === 0) {
      problems.push(`${name}: git fires ${fired} — missing or empty. Nothing runs.`);
      continue;
    }

    // husky puts its shim in .husky/_ and the real script one level up, in .husky/.
    const isHuskyShim = path.basename(hooksDir) === '_';
    const real = isHuskyShim ? path.join(path.dirname(hooksDir), name) : fired;

    if (real !== fired && (!existsSync(real) || statSync(real).size === 0)) {
      problems.push(
        `${name}: the shim at ${fired} delegates to ${real}, which is missing or empty.\n` +
          '      The shim exits 0 when that happens — a silent pass.',
      );
      continue;
    }

    if (!readFileSync(real, 'utf8').includes(mustMention)) {
      problems.push(`${name}: ${real} no longer mentions "${mustMention}" — it exists but gates nothing.`);
    }
  }

  return { ok: problems.length === 0, hooksDir, problems };
}

export function main() {
  const root = process.cwd();
  const hooksDir = resolveHooksDir(root);
  const result = inspectHooks({ hooksDir });

  if (result.notAGitRepo) {
    console.log('hooks: not a git checkout — nothing to wire. (Not a pass, not a failure.)');
    return 0;
  }

  if (result.ok) {
    console.log(`hooks: wired — git fires ${result.hooksDir}`);
    console.log(`hooks: ${REQUIRED.map((r) => r.name).join(', ')} present and still running what they should.`);
    return 0;
  }

  console.error('');
  console.error(
    `  GIT HOOKS ARE NOT WIRED — ${REQUIRED.map((r) => r.name).join(' / ')} is running NO checks, silently.`,
  );
  console.error('');
  for (const p of result.problems) console.error(`    - ${p}`);
  console.error('');
  console.error(`  FIX:  ${FIX}`);
  console.error('');
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
