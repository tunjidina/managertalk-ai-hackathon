// Loading and portability of scripts/smoke-live.mjs.
//
// Regression for a Windows failure: the script imported its compiled core by
// absolute file path, and on Windows "C:\..." is parsed as a URL with the
// scheme "c:" (ERR_UNSUPPORTED_ESM_URL_SCHEME). The script now resolves the
// core against import.meta.url. These tests need no network and no key: they
// run only the dry run and the refusal paths.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Compiled to functions/lib/smokeScript.test.js.
const functionsDir = join(__dirname, '..');
const scriptPath = join(functionsDir, 'scripts', 'smoke-live.mjs');

function run(script: string, args: string[] = [], cwd: string = functionsDir, extraEnv: Record<string, string> = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extraEnv };
  delete env.NEBIUS_API_KEY;
  delete env.SMOKE_CONFIRM;
  Object.assign(env, extraEnv);
  return spawnSync(process.execPath, [script, ...args], { cwd, env, encoding: 'utf8' });
}

test('root cause: a Windows absolute path is not importable by dynamic import()', async () => {
  for (const specifier of ['C:\\repo\\functions\\lib\\smokeCore.js', 'C:/repo/functions/lib/smokeCore.js', 'D:\\a b\\lib\\x.js']) {
    await assert.rejects(
      () => import(specifier),
      (error: NodeJS.ErrnoException) => error.code === 'ERR_UNSUPPORTED_ESM_URL_SCHEME',
      specifier
    );
  }
});

test('resolving against a Windows script URL gives a valid file: URL, spaces and unicode included', () => {
  const windows = new URL('../lib/smokeCore.js', 'file:///C:/repo/functions/scripts/smoke-live.mjs').href;
  assert.equal(windows, 'file:///C:/repo/functions/lib/smokeCore.js');

  const awkward = new URL('../lib/smokeCore.js', 'file:///C:/Users/Tunji%20O/ré po/functions/scripts/smoke-live.mjs').href;
  assert.equal(awkward, 'file:///C:/Users/Tunji%20O/r%C3%A9%20po/functions/lib/smokeCore.js');
  assert.equal(new URL(awkward).protocol, 'file:');
});

test('the script never hands a filesystem path to import()', () => {
  const source = readFileSync(scriptPath, 'utf8');
  assert.match(source, /new URL\('\.\.\/lib\/smokeCore\.js', import\.meta\.url\)\.href/);
  assert.ok(!/\bjoin\(/.test(source), 'no path.join in the script');
  assert.ok(!/fileURLToPath/.test(source), 'no URL-to-path conversion in the script');
  const imports = source.match(/await import\([^)]*\)/g) || [];
  assert.deepEqual(imports, ['await import(coreUrl)']);
});

test('the dry run loads the compiled core and makes no request', () => {
  const result = run(scriptPath);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /DRY RUN: no request will be made\./);
});

test('it behaves the same from any working directory', () => {
  const elsewhere = mkdtempSync(join(tmpdir(), 'smoke-cwd-'));
  try {
    const result = run(scriptPath, [], elsewhere);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /DRY RUN/);
  } finally {
    rmSync(elsewhere, { recursive: true, force: true });
  }
});

test('it runs from a directory whose path contains spaces and non-ASCII characters', () => {
  const root = mkdtempSync(join(tmpdir(), 'managertalk gate ré-'));
  try {
    mkdirSync(join(root, 'scripts'));
    cpSync(scriptPath, join(root, 'scripts', 'smoke-live.mjs'));
    cpSync(join(functionsDir, 'lib'), join(root, 'lib'), { recursive: true });
    const result = run(join(root, 'scripts', 'smoke-live.mjs'), [], root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /DRY RUN/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a missing build gives a clear instruction instead of a stack trace', () => {
  const root = mkdtempSync(join(tmpdir(), 'smoke-nobuild-'));
  try {
    mkdirSync(join(root, 'scripts'));
    cpSync(scriptPath, join(root, 'scripts', 'smoke-live.mjs'));
    const result = run(join(root, 'scripts', 'smoke-live.mjs'), [], root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /run "npm run build" in functions\/ first/);
    assert.ok(!/at .*node:internal/.test(result.stderr), 'no stack trace');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// The safety controls must be unchanged by the loading fix.

test('live mode still refuses without the confirmation variable', () => {
  const result = run(scriptPath, ['--live'], functionsDir, { NEBIUS_API_KEY: 'fake-key-not-used' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /SMOKE_CONFIRM=yes-make-live-calls/);
  assert.ok(!result.stdout.includes('fake-key-not-used') && !result.stderr.includes('fake-key-not-used'));
});

test('live mode still refuses without a key, and with a wrong confirmation value', () => {
  const noKey = run(scriptPath, ['--live'], functionsDir, { SMOKE_CONFIRM: 'yes-make-live-calls' });
  assert.equal(noKey.status, 2);
  assert.match(noKey.stderr, /NEBIUS_API_KEY is not set/);

  const wrong = run(scriptPath, ['--live'], functionsDir, { SMOKE_CONFIRM: 'yes', NEBIUS_API_KEY: 'fake-key-not-used' });
  assert.equal(wrong.status, 2);
});

test('the dry run still caps the budget at 20 and never prints a key', () => {
  const result = run(scriptPath, ['--calls', '999'], functionsDir, { NEBIUS_API_KEY: 'fake-key-not-used' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /at most 20 requests in total \(hard cap 20\)/);
  assert.ok(!result.stdout.includes('fake-key-not-used'));
});

test('bad numeric flags are still rejected', () => {
  const result = run(scriptPath, ['--calls', 'abc']);
  assert.equal(result.status, 2);
});
