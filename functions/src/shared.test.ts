// The files in src/shared/ are generated copies of client files. This
// proves the copies the server was built with match the client's sources
// byte for byte. Keep the list in step with scripts/sync-shared.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Compiled to functions/lib/shared.test.js.
const functionsDir = join(__dirname, '..');
const repoRoot = join(functionsDir, '..');

const SHARED_FILES: Array<[string, string]> = [
  ['src/types/scenarioBlueprint.ts', 'types/scenarioBlueprint.ts'],
  ['src/engine/s02/prompts.ts', 'engine/s02/prompts.ts'],
  ['src/data/scenarios/mt-s02.json', 'data/scenarios/mt-s02.json']
];

for (const [source, copy] of SHARED_FILES) {
  test('shared/' + copy + ' matches the client source ' + source, () => {
    const original = readFileSync(join(repoRoot, source));
    const copied = readFileSync(join(functionsDir, 'src', 'shared', copy));
    assert.ok(original.equals(copied), copy + ' is out of date: run npm run sync-shared');
  });
}

test('the shared prompt builder imports nothing but the blueprint types', () => {
  const source = readFileSync(join(repoRoot, 'src/engine/s02/prompts.ts'), 'utf8');
  const imports = source.match(/from\s+'[^']+'/g) || [];
  assert.deepEqual(imports, ["from '../../types/scenarioBlueprint'"]);
});
