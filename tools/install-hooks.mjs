#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════════
// install-hooks.mjs — write the pre-push hook git will actually fire.
//
// No husky, no dependency. Git hooks are not tracked by git, so this has to be
// run once per clone (and once per linked worktree, if core.hooksPath is ever
// set to a relative path here — it is not today).
//
// It REFUSES to overwrite a pre-push it did not write. Silently clobbering
// somebody else's hook is the same class of harm as the missing hook this whole
// pair of scripts exists to make loud.
// ══════════════════════════════════════════════════════════════════════════════

import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { resolveHooksDir } from './check-hooks.mjs';

export const MARKER = 'installed by tools/install-hooks.mjs';

export const PRE_PUSH = `#!/bin/sh
# ${MARKER} — do not edit here; edit that script and re-run \`npm run hooks:install\`.
#
# Runs the local gate before anything leaves this machine. GitHub Actions is
# billing-blocked on this account, so nothing checks a push except this.
#
# TO SKIP, DELIBERATELY AND VISIBLY:
#   SKIP_GATE=1 git push        (preferred — it says so in the output)
#   git push --no-verify        (skips every hook)
# Skipping is fine for a docs-only or work-in-progress push. It is not a way to
# make a red suite go away.

if [ -n "$SKIP_GATE" ]; then
  echo "pre-push: SKIP_GATE set — gate skipped. Nothing else is checking this push."
  exit 0
fi

# A branch DELETE (\`git push origin :branch\`) sends an all-zero local sha and has
# nothing to verify. Without this, deleting a merged branch sits through the suite.
deleting_only=1
while read -r _local_ref local_sha _remote_ref _remote_sha; do
  case "$local_sha" in
    *[!0]*) deleting_only=0 ;;
  esac
done

if [ "$deleting_only" = "1" ]; then
  exit 0
fi

echo "pre-push: running npm run gate. Skip with: SKIP_GATE=1 git push"
echo

npm run gate
`;

export function main() {
  const hooksDir = resolveHooksDir(process.cwd());
  if (!hooksDir) {
    console.error('hooks: not a git checkout — nothing to install.');
    return 1;
  }

  mkdirSync(hooksDir, { recursive: true });
  const target = path.join(hooksDir, 'pre-push');

  if (existsSync(target) && !readFileSync(target, 'utf8').includes(MARKER)) {
    console.error('');
    console.error(`  A pre-push hook already exists and was NOT written by this script:`);
    console.error(`    ${target}`);
    console.error('');
    console.error('  Refusing to overwrite it. Move or delete it, then re-run this command.');
    console.error('');
    return 1;
  }

  writeFileSync(target, PRE_PUSH);
  try {
    chmodSync(target, 0o755); // no-op on Windows; git for Windows runs the hook regardless
  } catch {
    // chmod can fail on exotic filesystems. The hook still runs; do not fail the install.
  }

  console.log(`hooks: installed pre-push at ${target}`);
  console.log('hooks: `git push` now runs `npm run gate` first. Verify with `npm run hooks:check`.');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
