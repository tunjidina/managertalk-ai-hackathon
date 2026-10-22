// The deploy-time build step in firebase.json. Firebase runs each
// "predeploy" command from the project root before uploading the functions
// source, with $RESOURCE_DIR set to that source directory. The upload takes
// whatever is in functions/lib, so a deploy without a fresh build would ship
// stale or missing code.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Compiled to functions/lib/deployConfig.test.js.
const functionsDir = join(__dirname, '..');
const repoRoot = join(functionsDir, '..');

interface FirebaseJson {
  functions: Array<{ source: string; codebase: string; predeploy?: string[] }>;
}

const firebaseJson = JSON.parse(readFileSync(join(repoRoot, 'firebase.json'), 'utf8')) as FirebaseJson;
const packageJson = JSON.parse(readFileSync(join(functionsDir, 'package.json'), 'utf8')) as {
  main: string;
  scripts: Record<string, string>;
};

test('firebase.json builds the functions before every deploy', () => {
  const entry = firebaseJson.functions[0];
  assert.equal(entry.source, 'functions');
  assert.deepEqual(entry.predeploy, ['npm --prefix "$RESOURCE_DIR" run build']);
});

test('the predeploy command runs a build script that syncs shared files and compiles', () => {
  const build = packageJson.scripts.build;
  assert.ok(build, 'functions/package.json has a build script');
  assert.match(build, /sync-shared/);
  assert.match(build, /tsc/);
});

test('the compiled entry point the deploy uploads is the one the build produces', () => {
  assert.equal(packageJson.main, 'lib/index.js');
});

test('the rewrite for the turn endpoint targets the exported function id and region', () => {
  const hosting = JSON.parse(readFileSync(join(repoRoot, 'firebase.json'), 'utf8')).hosting;
  const rewrite = hosting.rewrites.find((r: { source: string }) => r.source === '/api/s02/turn');
  assert.deepEqual(rewrite.function, { functionId: 's02Turn', region: 'europe-west2' });
});
