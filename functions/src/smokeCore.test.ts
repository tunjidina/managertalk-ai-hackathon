import { test } from 'node:test';
import assert from 'node:assert/strict';

import { HARD_MAX_CALLS, NEBIUS_MODELS_URL, defaultVariants, runSmoke } from './smokeCore';
import { NEBIUS_CHAT_COMPLETIONS_URL, NEMOTRON_NANO_MODEL_ID } from './nebiusModel';
import { TEST_KEY, completion, jsonResponse, recordingFetch } from './fetchSupport.test';

function collect() {
  const lines: string[] = [];
  return { lines, emit: (line: string) => lines.push(line) };
}

const REPLY = 'I answered the question as it was put to me.';

function nebiusFake() {
  return recordingFetch((call) => {
    if (call.url === NEBIUS_MODELS_URL) {
      return jsonResponse({ data: [{ id: NEMOTRON_NANO_MODEL_ID }, { id: 'nvidia/NEMOTRON-3-SUPER-120B-A12B' }, { id: 'other/model' }] });
    }
    return jsonResponse(completion(REPLY, { reasoning: 'SECRET-REASONING-TEXT' }));
  });
}

test('the default plan covers Nano, Super and one experimental variant', () => {
  const variants = defaultVariants();
  assert.deepEqual(variants.map((v) => v.model).slice(0, 2), [NEMOTRON_NANO_MODEL_ID, 'nvidia/nemotron-3-super-120b-a12b']);
  assert.equal(variants.filter((v) => v.experimental).length, 1);
});

test('a dry run makes no request, needs no key and says so', async () => {
  const out = collect();
  const fake = nebiusFake();
  const report = await runSmoke({ live: false, fetchImpl: fake, emit: out.emit });
  assert.equal(fake.calls.length, 0);
  assert.equal(report.callsMade, 0);
  assert.ok(out.lines.some((line) => line.startsWith('DRY RUN')));
});

test('a live run without a key refuses and makes no request', async () => {
  const fake = nebiusFake();
  await assert.rejects(() => runSmoke({ live: true, fetchImpl: fake, emit: () => undefined }), /NEBIUS_API_KEY/);
  assert.equal(fake.calls.length, 0);
});

test('a live run checks the model list first, then stays within the call budget', async () => {
  const out = collect();
  const fake = nebiusFake();
  const report = await runSmoke({ live: true, apiKey: TEST_KEY, fetchImpl: fake, maxCalls: 7, emit: out.emit });

  assert.equal(fake.calls[0].url, NEBIUS_MODELS_URL);
  assert.equal((fake.calls[0].init.method || 'GET'), 'GET');
  assert.ok(fake.calls.slice(1).every((call) => call.url === NEBIUS_CHAT_COMPLETIONS_URL));
  assert.equal(fake.calls.length, 7);
  assert.equal(report.callsMade, 7);
  assert.equal(report.calls.length, 6);
  assert.ok(report.calls.every((call) => call.validation === 'ok'));
});

test('the budget can never exceed the hard cap', async () => {
  const fake = nebiusFake();
  await runSmoke({ live: true, apiKey: TEST_KEY, fetchImpl: fake, maxCalls: 500, emit: () => undefined });
  assert.equal(fake.calls.length, HARD_MAX_CALLS);
});

test('a budget of zero sends nothing', async () => {
  const fake = nebiusFake();
  await runSmoke({ live: true, apiKey: TEST_KEY, fetchImpl: fake, maxCalls: 0, emit: () => undefined });
  assert.equal(fake.calls.length, 0);
});

test('the key and reasoning text never appear in output, even if the key is echoed upstream', async () => {
  const out = collect();
  const leaky = recordingFetch((call) =>
    call.url === NEBIUS_MODELS_URL
      ? jsonResponse({ data: [{ id: TEST_KEY }, { id: NEMOTRON_NANO_MODEL_ID }] })
      : jsonResponse(completion('Here is my reply ' + TEST_KEY + ' to you.', { reasoning: 'SECRET-REASONING-TEXT' }))
  );
  await runSmoke({ live: true, apiKey: TEST_KEY, fetchImpl: leaky, maxCalls: 4, emit: out.emit });
  const all = out.lines.join('\n');
  assert.ok(!all.includes(TEST_KEY));
  assert.ok(!all.includes('SECRET-REASONING-TEXT'));
});

test('the model-list check reports exact, case-mismatched and missing ids', async () => {
  const out = collect();
  await runSmoke({ live: true, apiKey: TEST_KEY, fetchImpl: nebiusFake(), maxCalls: 1, emit: out.emit });
  const all = out.lines.join('\n');
  assert.match(all, /NVIDIA-Nemotron-3-Nano-30B-A3B: exact match/);
  assert.match(all, /nemotron-3-super-120b-a12b: CASE MISMATCH/);
});

test('the experimental variant adds its extra field; the others send the standard body', async () => {
  const fake = nebiusFake();
  await runSmoke({ live: true, apiKey: TEST_KEY, fetchImpl: fake, maxCalls: 4, emit: () => undefined });
  const bodies = fake.calls.slice(1).map((call) => call.body);
  assert.equal(bodies.filter((body) => 'chat_template_kwargs' in body).length, 1);
  assert.ok(bodies.every((body) => body.stream === false && typeof body.max_tokens === 'number' && (body.max_tokens as number) <= 1024));
});

test('failures are recorded as codes, not bodies', async () => {
  const out = collect();
  const failing = recordingFetch((call) =>
    call.url === NEBIUS_MODELS_URL ? jsonResponse({}, 500) : jsonResponse({ error: 'UPSTREAM-BODY' }, 429)
  );
  const report = await runSmoke({ live: true, apiKey: TEST_KEY, fetchImpl: failing, maxCalls: 4, emit: out.emit });
  assert.ok(report.calls.every((call) => call.status === 429));
  assert.ok(!out.lines.join('\n').includes('UPSTREAM-BODY'));
});

test('models the platform does not list are skipped, so no completions are wasted on them', async () => {
  const out = collect();
  const onlyNano = recordingFetch((call) =>
    call.url === NEBIUS_MODELS_URL ? jsonResponse({ data: [{ id: NEMOTRON_NANO_MODEL_ID }] }) : jsonResponse(completion(REPLY))
  );
  const report = await runSmoke({ live: true, apiKey: TEST_KEY, fetchImpl: onlyNano, maxCalls: 10, emit: out.emit });
  const models = onlyNano.calls.slice(1).map((call) => call.body.model);
  assert.ok(models.length > 0);
  assert.ok(models.every((model) => model === NEMOTRON_NANO_MODEL_ID));
  assert.ok(report.calls.every((call) => call.variant === 'nano-default'));
  assert.match(out.lines.join('\n'), /NOT FOUND, skipped/);
});

test('a case-only mismatch is run with the listed spelling and reported', async () => {
  const out = collect();
  const fake = nebiusFake();
  await runSmoke({ live: true, apiKey: TEST_KEY, fetchImpl: fake, maxCalls: 4, emit: out.emit });
  const superCalls = fake.calls.slice(1).filter((call) => String(call.body.model).toLowerCase().includes('super'));
  assert.ok(superCalls.length > 0);
  assert.ok(superCalls.every((call) => call.body.model === 'nvidia/NEMOTRON-3-SUPER-120B-A12B'));
  assert.match(out.lines.join('\n'), /using the listed spelling nvidia\/NEMOTRON-3-SUPER-120B-A12B/);
});

test('a refused model-list request (bad key) stops the run before any completion', async () => {
  const out = collect();
  const refused = recordingFetch(() => jsonResponse({ error: 'bad key' }, 401));
  const report = await runSmoke({ live: true, apiKey: TEST_KEY, fetchImpl: refused, maxCalls: 20, emit: out.emit });
  assert.equal(refused.calls.length, 1);
  assert.equal(report.calls.length, 0);
  assert.match(out.lines.join('\n'), /check the key/);
});

test('a non-numeric budget falls back to the default instead of running unbounded', async () => {
  for (const maxCalls of [NaN, Infinity, -Infinity]) {
    const fake = nebiusFake();
    await runSmoke({ live: true, apiKey: TEST_KEY, fetchImpl: fake, maxCalls, emit: () => undefined });
    assert.ok(fake.calls.length <= HARD_MAX_CALLS, 'budget ' + maxCalls);
    assert.ok(fake.calls.length <= 6, 'budget ' + maxCalls);
  }
});

test('every request refuses redirects and carries the key only in the Authorization header', async () => {
  const fake = nebiusFake();
  await runSmoke({ live: true, apiKey: TEST_KEY, fetchImpl: fake, maxCalls: 6, emit: () => undefined });
  assert.ok(fake.calls.length > 1);
  for (const call of fake.calls) {
    assert.equal(call.init.redirect, 'error');
    assert.ok(!String(call.init.body || '').includes(TEST_KEY));
    assert.ok(!call.url.includes(TEST_KEY));
    assert.equal((call.init.headers as Record<string, string>).Authorization, 'Bearer ' + TEST_KEY);
  }
});

test('requests only ever go to the two Token Factory URLs', async () => {
  const fake = nebiusFake();
  await runSmoke({ live: true, apiKey: TEST_KEY, fetchImpl: fake, maxCalls: 20, emit: () => undefined });
  assert.ok(fake.calls.every((call) => call.url === NEBIUS_MODELS_URL || call.url === NEBIUS_CHAT_COMPLETIONS_URL));
});
