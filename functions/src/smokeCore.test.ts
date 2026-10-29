import { test } from 'node:test';
import assert from 'node:assert/strict';

import { HARD_MAX_CALLS, NEBIUS_MODELS_URL, defaultVariants, runSmoke } from './smokeCore';
import { NEBIUS_CHAT_COMPLETIONS_URL, NEMOTRON_NANO_MODEL_ID } from './nebiusModel';
import { TEST_KEY, completion, hangingFetch, jsonResponse, recordingFetch } from './fetchSupport.test';

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

test('the default plan covers Nano, Super and two experimental variants', () => {
  const variants = defaultVariants();
  assert.deepEqual(variants.map((v) => v.model).slice(0, 2), [NEMOTRON_NANO_MODEL_ID, 'nvidia/nemotron-3-super-120b-a12b']);
  assert.equal(variants.filter((v) => v.experimental).length, 2);
});

test('the Nano reasoning-off variant sends the Nano id, the runtime token cap and enable_thinking=false', async () => {
  const fake = nebiusFake();
  await runSmoke({ live: true, apiKey: TEST_KEY, fetchImpl: fake, maxCalls: 5, maxTokens: 350, emit: () => undefined });
  const body = fake.calls[4].body;
  assert.equal(body.model, NEMOTRON_NANO_MODEL_ID);
  assert.equal(body.max_tokens, 350);
  assert.deepEqual(body.chat_template_kwargs, { enable_thinking: false });
});

test('--variant runs the model-list call and exactly one completion of the chosen variant only', async () => {
  const fake = nebiusFake();
  const report = await runSmoke({ live: true, apiKey: TEST_KEY, fetchImpl: fake, variantName: 'nano-thinking-off', maxTokens: 350, emit: () => undefined });
  assert.equal(fake.calls.length, 2);
  assert.equal(fake.calls[0].url, NEBIUS_MODELS_URL);
  assert.equal(report.calls.length, 1);
  assert.equal(report.calls[0].variant, 'nano-thinking-off (experimental)');
  assert.equal(fake.calls[1].body.model, NEMOTRON_NANO_MODEL_ID);
  assert.deepEqual(fake.calls[1].body.chat_template_kwargs, { enable_thinking: false });
});

test('--variant still honours an explicit budget and never runs other variants', async () => {
  const fake = nebiusFake();
  await runSmoke({ live: true, apiKey: TEST_KEY, fetchImpl: fake, variantName: 'nano-default', maxCalls: 3, emit: () => undefined });
  const completions = fake.calls.slice(1);
  assert.equal(completions.length, 2);
  assert.ok(completions.every((call) => call.body.model === NEMOTRON_NANO_MODEL_ID && !('chat_template_kwargs' in call.body)));
});

test('an unknown --variant fails before any request, and does not fall back to other variants', async () => {
  const fake = nebiusFake();
  await assert.rejects(
    () => runSmoke({ live: true, apiKey: TEST_KEY, fetchImpl: fake, variantName: 'nano-thinkng-off', emit: () => undefined }),
    /Unknown variant "nano-thinkng-off"\. Available: nano-default, super-default, super-thinking-off, nano-thinking-off/
  );
  assert.equal(fake.calls.length, 0);
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
  const failing = recordingFetch((_call) => jsonResponse({ error: 'UPSTREAM-BODY' }, 429));
  const report = await runSmoke({ live: true, apiKey: TEST_KEY, fetchImpl: failing, maxCalls: 4, skipModelList: true, emit: out.emit });
  assert.ok(report.calls.length > 0);
  assert.ok(report.calls.every((call) => call.status === 429));
  assert.ok(!out.lines.join('\n').includes('UPSTREAM-BODY'));
});

test('an unreadable model list stops the run before any completion', async () => {
  for (const respond of [
    () => jsonResponse({ error: 'x' }, 500),
    () => jsonResponse({ error: 'x' }, 404),
    () => jsonResponse('not json at all'),
    () => { throw new TypeError('fetch failed'); }
  ]) {
    const out = collect();
    const fake = recordingFetch(respond as never);
    const report = await runSmoke({ live: true, apiKey: TEST_KEY, fetchImpl: fake, maxCalls: 10, emit: out.emit });
    assert.equal(fake.calls.length, 1, 'only the model list was requested');
    assert.equal(report.calls.length, 0);
    assert.match(out.lines.join('\n'), /Model list could not be read .* No completions were sent/);
  }
});

test('a model list that hangs times out and stops the run', async () => {
  const out = collect();
  const report = await runSmoke({ live: true, apiKey: TEST_KEY, fetchImpl: hangingFetch(), maxCalls: 10, timeoutMs: 30, emit: out.emit });
  assert.equal(report.callsMade, 1);
  assert.equal(report.calls.length, 0);
  assert.match(out.lines.join('\n'), /could not be read/);
});

test('--skip-model-list sends completions with the full budget and says the ids are unverified', async () => {
  const out = collect();
  const fake = nebiusFake();
  const report = await runSmoke({ live: true, apiKey: TEST_KEY, fetchImpl: fake, maxCalls: 4, skipModelList: true, emit: out.emit });
  assert.ok(fake.calls.every((call) => call.url === NEBIUS_CHAT_COMPLETIONS_URL), 'the model list is not requested');
  assert.equal(fake.calls.length, 4);
  assert.equal(report.callsMade, 4);
  assert.match(out.lines.join('\n'), /Model list check SKIPPED .* unverified/);
});

test('when none of the candidates are listed, no completions are sent', async () => {
  const out = collect();
  const none = recordingFetch(() => jsonResponse({ data: [{ id: 'other/model' }] }));
  await runSmoke({ live: true, apiKey: TEST_KEY, fetchImpl: none, maxCalls: 10, emit: out.emit });
  assert.equal(none.calls.length, 1);
  assert.match(out.lines.join('\n'), /None of the candidate models are listed/);
});

test('the summary tallies outcomes, finish reasons and token-cap hits so a failure can be told apart', async () => {
  const out = collect();
  let n = 0;
  const mixed = recordingFetch((call) => {
    if (call.url === NEBIUS_MODELS_URL) {
      return jsonResponse({ data: [{ id: NEMOTRON_NANO_MODEL_ID }] });
    }
    n += 1;
    if (n === 1) {
      return jsonResponse(completion(REPLY));
    }
    if (n === 2) {
      return jsonResponse(completion(null, { reasoning: 'SECRET-REASONING-TEXT' }, { finish_reason: 'length' }));
    }
    const capped = completion(REPLY);
    capped.usage = { prompt_tokens: 50, completion_tokens: 600 };
    return jsonResponse(capped);
  });
  await runSmoke({
    live: true,
    apiKey: TEST_KEY,
    fetchImpl: mixed,
    variants: [{ name: 'only', model: NEMOTRON_NANO_MODEL_ID }],
    maxCalls: 4,
    emit: out.emit
  });
  const all = out.lines.join('\n');
  assert.match(all, /outcomes: not_text x1, ok x2/);
  assert.match(all, /finish: length x1, stop x2/);
  assert.match(all, /reached max_tokens: 1/);
  assert.ok(!all.includes('SECRET-REASONING-TEXT'));
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
  assert.ok(report.calls.every((call) => call.variant.startsWith('nano-')));
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

test('replies are not printed by default; only a validation note appears', async () => {
  const out = collect();
  await runSmoke({ live: true, apiKey: TEST_KEY, fetchImpl: nebiusFake(), maxCalls: 4, emit: out.emit });
  const all = out.lines.join('\n');
  assert.ok(!all.includes(REPLY));
  assert.match(all, /reply passed validation \(\d+ lines\); text not shown/);
});

test('--show-replies prints a short preview of validated replies, never reasoning', async () => {
  const out = collect();
  await runSmoke({ live: true, apiKey: TEST_KEY, fetchImpl: nebiusFake(), maxCalls: 4, showReplies: true, emit: out.emit });
  const all = out.lines.join('\n');
  assert.ok(all.includes(REPLY));
  assert.ok(!all.includes('SECRET-REASONING-TEXT'));
});

test('a documented alternative spelling of Nano is used when the primary id is not listed', async () => {
  const out = collect();
  const aliasOnly = recordingFetch((call) =>
    call.url === NEBIUS_MODELS_URL ? jsonResponse({ data: [{ id: 'NVIDIA/Nemotron-3-Nano-30B-A3B' }] }) : jsonResponse(completion(REPLY))
  );
  await runSmoke({ live: true, apiKey: TEST_KEY, fetchImpl: aliasOnly, maxCalls: 4, emit: out.emit });
  const models = aliasOnly.calls.slice(1).map((call) => call.body.model);
  assert.ok(models.length > 0);
  assert.ok(models.every((model) => model === 'NVIDIA/Nemotron-3-Nano-30B-A3B'));
  assert.match(out.lines.join('\n'), /NOT LISTED, but its alias is; using NVIDIA\/Nemotron-3-Nano-30B-A3B/);
});

test('the cookbook spelling (all lowercase) is matched case-insensitively and reported', async () => {
  const out = collect();
  const lower = recordingFetch((call) =>
    call.url === NEBIUS_MODELS_URL ? jsonResponse({ data: [{ id: 'nvidia/nvidia-nemotron-3-nano-30b-a3b' }] }) : jsonResponse(completion(REPLY))
  );
  await runSmoke({ live: true, apiKey: TEST_KEY, fetchImpl: lower, maxCalls: 3, emit: out.emit });
  assert.ok(lower.calls.slice(1).every((call) => call.body.model === 'nvidia/nvidia-nemotron-3-nano-30b-a3b'));
  assert.match(out.lines.join('\n'), /CASE MISMATCH, using the listed spelling nvidia\/nvidia-nemotron-3-nano-30b-a3b/);
});

test('an unrelated listed model is never used as an alias', async () => {
  const out = collect();
  const unrelated = recordingFetch((call) =>
    call.url === NEBIUS_MODELS_URL ? jsonResponse({ data: [{ id: 'other/model' }] }) : jsonResponse(completion(REPLY))
  );
  await runSmoke({ live: true, apiKey: TEST_KEY, fetchImpl: unrelated, maxCalls: 6, emit: out.emit });
  assert.equal(unrelated.calls.length, 1, 'only the model list was requested');
  assert.match(out.lines.join('\n'), /NOT FOUND, skipped/);
});
