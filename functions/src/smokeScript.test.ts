// Loading and portability of scripts/smoke-live.mjs.
//
// Regression for a Windows failure: the script imported its compiled core by
// absolute file path, and on Windows "C:\..." is parsed as a URL with the
// scheme "c:" (ERR_UNSUPPORTED_ESM_URL_SCHEME). The script now resolves the
// core against import.meta.url. These tests need no network and no key: they
// run only the dry run and the refusal paths.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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

/**
 * Copies a directory tree with only mkdirSync, readdirSync and copyFileSync,
 * and lists one with readdirSync, so the fixture depends on the basic file
 * calls and not on fs.cpSync or readdirSync's recursive mode.
 *
 * Why not cpSync: on Windows (Node 22.20.0) cpSync into a destination whose
 * path contains a non-ASCII character returned without error but left no
 * directory at that path, so the fixture then failed with ENOENT before the
 * script under test ever ran. That is a copy problem in the test setup, not
 * the smoke script's path handling. See the platform note test below, which
 * records what cpSync does on the machine running the tests.
 */
function copyTree(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const source = join(from, entry.name);
    const target = join(to, entry.name);
    if (entry.isDirectory()) {
      copyTree(source, target);
    } else {
      copyFileSync(source, target);
    }
  }
}

/** Relative paths of every file and directory under `dir`, sorted, with / separators. */
function listTree(dir: string, prefix = ''): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    found.push(relative);
    if (entry.isDirectory()) {
      found.push(...listTree(join(dir, entry.name), relative + '/'));
    }
  }
  return found.sort();
}

/**
 * A copy of the script and its compiled core in a fresh temporary directory
 * whose name starts with `prefix`, laid out like functions/ (script and lib
 * side by side under a package.json). The copy is checked file by file before
 * anything runs, so a fixture problem (a file that was not copied) fails here
 * with its own message, including what the temporary root actually contains,
 * instead of looking like a script failure.
 */
function copyOfFunctions(prefix: string): { root: string; script: string } {
  const root = mkdtempSync(join(tmpdir(), prefix));
  assert.ok(existsSync(root), 'fixture: the temporary directory was not created: ' + root);
  mkdirSync(join(root, 'scripts'));
  copyFileSync(scriptPath, join(root, 'scripts', 'smoke-live.mjs'));
  copyTree(join(functionsDir, 'lib'), join(root, 'lib'));
  // The real layout has functions/package.json above scripts/ and lib/. Pin
  // the module type so a stray package.json in any ancestor of the temporary
  // directory (for example one in a user's home folder) cannot change how the
  // compiled CommonJS files are loaded.
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'copy', type: 'commonjs' }));

  assert.ok(
    existsSync(join(root, 'lib')),
    'fixture: no lib directory at ' + root + '; the root contains: ' + JSON.stringify(readdirSync(root))
  );
  assert.deepEqual(
    listTree(join(root, 'lib')),
    listTree(join(functionsDir, 'lib')),
    'fixture: the compiled lib was not copied completely into ' + root
  );
  assert.ok(existsSync(join(root, 'lib', 'smokeCore.js')), 'fixture: lib/smokeCore.js is missing from ' + root);
  assert.ok(existsSync(join(root, 'lib', 'shared', 'data', 'scenarios', 'mt-s02.json')), 'fixture: the blueprint JSON is missing from ' + root);
  return { root, script: join(root, 'scripts', 'smoke-live.mjs') };
}

// The copy helper itself, under spaced and accented names. If a platform
// cannot create or copy into such a directory, this fails here, by name,
// instead of surfacing later as a script failure.
for (const [label, name] of [
  ['spaces', 'copy tree '],
  ['an accented name', 'copy-tré-'],
  ['spaces and an accented name', 'copy tree ré-']
]) {
  test('the fixture copy helper reproduces a nested tree under ' + label, () => {
    const base = mkdtempSync(join(tmpdir(), name));
    try {
      const source = join(base, 'source');
      mkdirSync(join(source, 'a', 'b'), { recursive: true });
      writeFileSync(join(source, 'top.txt'), 'top');
      writeFileSync(join(source, 'a', 'mid.json'), '{"x":1}');
      writeFileSync(join(source, 'a', 'b', 'deep.js'), 'module.exports = 1;');
      const destination = join(base, 'dest ré');
      copyTree(source, destination);
      assert.deepEqual(listTree(destination), listTree(source));
      assert.equal(readFileSync(join(destination, 'a', 'b', 'deep.js'), 'utf8'), 'module.exports = 1;');
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
}

// Informational: records what fs.cpSync does on the machine running the tests,
// so the cause of the Windows fixture failure is visible in the output rather
// than inferred. It never fails: it documents a platform behaviour that the
// fixture above deliberately avoids.
test('platform note: fs.cpSync into an accented destination (informational)', (t) => {
  const base = mkdtempSync(join(tmpdir(), 'cpsync-note-'));
  try {
    const source = join(base, 'source');
    mkdirSync(join(source, 'sub'), { recursive: true });
    writeFileSync(join(source, 'sub', 'a.txt'), 'x');
    const destination = join(base, 'dest ré');
    let outcome: string;
    try {
      cpSync(source, destination, { recursive: true });
      outcome = existsSync(join(destination, 'sub', 'a.txt'))
        ? 'copied correctly'
        : 'returned without error but nothing is at the destination; entries beside it: ' + JSON.stringify(readdirSync(base));
    } catch (error) {
      outcome = 'threw ' + (error as NodeJS.ErrnoException).code;
    }
    const note = 'fs.cpSync into an accented destination on ' + process.platform + ' node ' + process.version + ': ' + outcome;
    t.diagnostic(note);
    console.log('[platform note] ' + note);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// Spaces and non-ASCII characters are tested separately so that a failure on
// another platform says which kind of character the loader cannot handle.
for (const [label, prefix] of [
  ['spaces', 'managertalk gate '],
  ['non-ASCII characters', 'managertalk-gaté-ré-'],
  ['spaces and non-ASCII characters', 'managertalk gate ré-']
]) {
  test('it runs from a directory whose path contains ' + label, () => {
    const copy = copyOfFunctions(prefix);
    try {
      const result = run(copy.script, [], copy.root);
      assert.equal(result.status, 0, 'path: ' + copy.script + '\n' + result.stderr);
      assert.match(result.stdout, /DRY RUN/);
    } finally {
      rmSync(copy.root, { recursive: true, force: true });
    }
  });
}

test('a missing build gives a clear instruction instead of a stack trace', () => {
  const root = mkdtempSync(join(tmpdir(), 'smoke-nobuild-'));
  try {
    mkdirSync(join(root, 'scripts'));
    cpSync(scriptPath, join(root, 'scripts', 'smoke-live.mjs'));
    const result = run(join(root, 'scripts', 'smoke-live.mjs'), [], root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /run "npm run build" in functions\/ first/);
    assert.match(result.stderr, /Details: .*smokeCore\.js/, 'names the file that could not be found');
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
