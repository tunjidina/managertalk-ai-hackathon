import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LiveConfigInput, selectEngine } from './liveConfig';
import { MOCK_MODEL_ID } from './mockModel';
import { DEFAULT_MAX_TOKENS, DEFAULT_TIMEOUT_MS, ModelFailure, NEMOTRON_NANO_MODEL_ID, NEMOTRON_SUPER_MODEL_ID } from './nebiusModel';
import { memoryCounterStore } from './rateLimit';
import { TEST_KEY, completion, hangingFetch, jsonResponse, recordingFetch, samplePrompt } from './fetchSupport.test';

function io() {
  const fake = recordingFetch(() => jsonResponse(completion('I see it differently.')));
  let storeBuilt = 0;
  return {
    fake,
    storeBuilt: () => storeBuilt,
    io: {
      fetchImpl: fake,
      counterStore: () => {
        storeBuilt += 1;
        return memoryCounterStore();
      }
    }
  };
}

const LIVE: LiveConfigInput = {
  mode: 'live',
  apiKey: TEST_KEY,
  model: undefined,
  userDailyCap: undefined,
  globalDailyCap: undefined
};

test('live mode is off by default: unset or any other mode value means mock', async () => {
  for (const mode of [undefined, '', 'mock', 'LIVE', 'true', 'on', 'live ']) {
    const t = io();
    const engine = selectEngine({ ...LIVE, mode }, t.io);
    assert.equal(engine.mode, 'mock', 'mode ' + JSON.stringify(mode));
    assert.equal(engine.limiter, undefined);
    assert.equal(t.storeBuilt(), 0, 'mock mode never touches storage');
    assert.equal((await engine.model(samplePrompt())).model, MOCK_MODEL_ID);
    assert.equal(t.fake.calls.length, 0, 'mock mode makes no request');
  }
});

test('live mode without a key falls back to the mock instead of pretending', async () => {
  for (const apiKey of [undefined, '']) {
    const t = io();
    const engine = selectEngine({ ...LIVE, apiKey }, t.io);
    assert.equal(engine.mode, 'mock');
    assert.equal((await engine.model(samplePrompt())).model, MOCK_MODEL_ID);
    assert.equal(t.fake.calls.length, 0);
  }
});

test('live mode with a key builds the Nebius client, defaulting to Nemotron Nano, with a limiter', async () => {
  const t = io();
  const engine = selectEngine(LIVE, t.io);
  assert.equal(engine.mode, 'live');
  assert.ok(engine.limiter);
  const reply = await engine.model(samplePrompt());
  assert.equal(reply.model, NEMOTRON_NANO_MODEL_ID);
  assert.equal(t.fake.calls.length, 1);
});

test('the model id is configurable', async () => {
  const t = io();
  const engine = selectEngine({ ...LIVE, model: NEMOTRON_SUPER_MODEL_ID }, t.io);
  assert.equal((await engine.model(samplePrompt())).model, NEMOTRON_SUPER_MODEL_ID);
});

test('the configured caps reach the limiter', async () => {
  const t = io();
  const engine = selectEngine({ ...LIVE, userDailyCap: 1, globalDailyCap: 10 }, t.io);
  assert.equal((await engine.limiter!.consume('alice')).allowed, true);
  assert.equal((await engine.limiter!.consume('alice')).allowed, false);
});

test('invalid caps refuse to go live', () => {
  const t = io();
  const engine = selectEngine({ ...LIVE, userDailyCap: -5 }, t.io);
  assert.equal(engine.mode, 'mock');
  assert.equal(t.fake.calls.length, 0);
});

test('a bad key shape or model id falls back to the mock instead of throwing', async () => {
  for (const override of [{ apiKey: 'has a space' }, { apiKey: 'line\nbreak' }, { model: 'm'.repeat(500) }]) {
    const t = io();
    const engine = selectEngine({ ...LIVE, ...override }, t.io);
    assert.equal(engine.mode, 'mock', JSON.stringify(override).slice(0, 40));
    assert.equal(engine.limiter, undefined);
    assert.equal((await engine.model(samplePrompt())).model, MOCK_MODEL_ID);
    assert.equal(t.fake.calls.length, 0);
  }
});

test('the key is never stored on the selected engine object', () => {
  const t = io();
  const engine = selectEngine(LIVE, t.io);
  assert.ok(!JSON.stringify(engine).includes(TEST_KEY));
});

test('callers that omit maxTokens and timeoutMs keep the shared defaults (600 tokens, 12 s)', async () => {
  assert.equal(DEFAULT_MAX_TOKENS, 600);
  assert.equal(DEFAULT_TIMEOUT_MS, 12_000);
  const t = io();
  await selectEngine(LIVE, t.io).model(samplePrompt());
  assert.equal(t.fake.calls[0].body.max_tokens, 600);
});

test('maxTokens is passed through to the provider request', async () => {
  const t = io();
  await selectEngine({ ...LIVE, maxTokens: 350 }, t.io).model(samplePrompt());
  assert.equal(t.fake.calls[0].body.max_tokens, 350);
});

test('timeoutMs is passed through: the request aborts at that time, not at the default', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const hanging = hangingFetch();
  const engine = selectEngine({ ...LIVE, timeoutMs: 14_000 }, { ...io().io, fetchImpl: hanging });
  const outcome = engine.model(samplePrompt()).then(
    () => 'replied',
    (error: unknown) => (error instanceof ModelFailure ? error.code : 'other')
  );
  let settled = false;
  outcome.then(() => {
    settled = true;
  });
  context.mock.timers.tick(DEFAULT_TIMEOUT_MS + 1_000);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false, 'the 12 s default must not apply when 14 s is configured');
  context.mock.timers.tick(14_000 - DEFAULT_TIMEOUT_MS - 1_000);
  assert.equal(await outcome, 'timeout');
});

test('mock mode ignores the limits and makes no provider request', async () => {
  const t = io();
  const engine = selectEngine({ ...LIVE, mode: 'mock', maxTokens: 350, timeoutMs: 14_000 }, t.io);
  assert.equal(engine.mode, 'mock');
  assert.equal((await engine.model(samplePrompt())).model, MOCK_MODEL_ID);
  assert.equal(t.fake.calls.length, 0);
});
