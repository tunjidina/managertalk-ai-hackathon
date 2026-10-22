// functions/scripts/sync-shared.mjs
//
// Copies the client files the server shares into functions/src/shared/,
// byte for byte, before every build. Firebase uploads only the functions/
// directory on deploy, so the server cannot import ../src directly, and a
// hand-maintained copy would drift. The copies are gitignored; the client
// files are the sources of truth. shared.test.ts checks they match.
//
// Every shared file must stay pure: no Firebase, network or browser APIs.

import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const functionsDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(functionsDir, '..');

/** [source under the repo root, destination under functions/src/shared] */
const SHARED_FILES = [
  ['src/types/scenarioBlueprint.ts', 'types/scenarioBlueprint.ts'],
  ['src/engine/s02/prompts.ts', 'engine/s02/prompts.ts'],
  ['src/data/scenarios/mt-s02.json', 'data/scenarios/mt-s02.json']
];

for (const [source, destination] of SHARED_FILES) {
  const target = join(functionsDir, 'src', 'shared', destination);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(join(repoRoot, source), target);
}

console.log('sync-shared: copied ' + SHARED_FILES.length + ' files into src/shared/');
