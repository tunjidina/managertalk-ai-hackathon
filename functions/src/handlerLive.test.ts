// The live path through the handler, with fake models and fake limiters.
// No network, no Firebase.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ErrorBody, LIMIT_HEADER, SuccessBody, TurnDeps, handleTurn } from './handler';
import { ModelClient, mockModel } from './mockModel';
import { ModelFailure, ModelFailureCode } from './nebiusModel';
import { DailyLimiter, QuotaDecision } from './rateLimit';
import { REJECTION_REASONS } from './log';
import { RejectionReason } from './replyValidation';
import { TEST_KEY } from './fetchSupport.test';
import { captureLog, fakeVerifier, httpRequest } from './testSupport.test';

function failing(code: ModelFailureCode, retryAfterSeconds?: number): ModelClient {
  return async () => {
    throw new ModelFailure(code, retryAfterSeconds);
  };
}

function limiterReturning(decision: QuotaDecision): DailyLimiter & { calls: string[] } {
  const calls: string[] = [];
  return { calls, consume: async (uid) => (calls.push(uid), decision) };
}

function setup(overrides: Partial<TurnDeps> = {}) {
  const logs = captureLog();
  return {
    logs,
    deps: { verifyIdToken: fakeVerifier(), model: mockModel, log: logs.log, ...overrides } as TurnDeps
  };
}

function code(body: unknown): string {
  return (body as ErrorBody).error.code;
}

test('a live reply is returned in the client contract and logged as live', async () => {
  const { deps, logs } = setup({
    mode: 'live',
    model: async () => ({ style: 'composed_disagreement', lines: ['I see it differently.'], model: 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B' }),
    limiter: limiterReturning({ allowed: true })
  });
  const response = await handleTurn(httpRequest(), deps);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body as SuccessBody, {
    style: 'composed_disagreement',
    lines: ['I see it differently.'],
    model: 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B'
  });
  assert.deepEqual(logs.entries.map((e) => [e.status, e.outcome, e.mode]), [[200, 'ok', 'live']]);
});

test('mock mode logs as mock and ignores a missing limiter', async () => {
  const { deps, logs } = setup();
  const response = await handleTurn(httpRequest(), deps);
  assert.equal(response.status, 200);
  assert.equal(logs.entries[0].mode, 'mock');
});

test('the limiter is charged with the verified user id, once, after validation', async () => {
  const limiter = limiterReturning({ allowed: true });
  const { deps } = setup({ limiter });
  await handleTurn(httpRequest(), deps);
  assert.deepEqual(limiter.calls, ['user-123']);

  const invalid = limiterReturning({ allowed: true });
  const { deps: d2 } = setup({ limiter: invalid });
  await handleTurn(httpRequest({}, { scenarioId: 'MT-S02' }), d2);
  assert.deepEqual(invalid.calls, [], 'an invalid request is not charged');

  const unauth = limiterReturning({ allowed: true });
  const { deps: d3 } = setup({ limiter: unauth });
  await handleTurn(httpRequest({ authorization: 'Bearer wrong' }), d3);
  assert.deepEqual(unauth.calls, [], 'an unauthenticated request is not charged');
});

test('a user over their cap gets 429 and the model is never called', async () => {
  let modelCalls = 0;
  const { deps, logs } = setup({
    model: async () => (modelCalls += 1, mockModel({} as never)),
    limiter: limiterReturning({ allowed: false, scope: 'user' })
  });
  const response = await handleTurn(httpRequest(), deps);
  assert.equal(response.status, 429);
  assert.equal(code(response.body), 'daily_limit');
  assert.equal(response.headers[LIMIT_HEADER], 'daily-user');
  assert.equal(modelCalls, 0);
  assert.equal(logs.entries[0].outcome, 'quota_user');
});

test('the global cap is reported separately', async () => {
  const { deps, logs } = setup({ limiter: limiterReturning({ allowed: false, scope: 'global' }) });
  const response = await handleTurn(httpRequest(), deps);
  assert.equal(response.status, 429);
  assert.equal(code(response.body), 'daily_limit');
  assert.equal(response.headers[LIMIT_HEADER], 'daily-global');
  assert.equal(logs.entries[0].outcome, 'quota_global');
});

test('the provider\'s own 429 never carries the daily-limit header, so it is not mistaken for a cap', async () => {
  const { deps } = setup({ model: failing('rate_limited', 5) });
  const response = await handleTurn(httpRequest(), deps);
  assert.equal(response.status, 429);
  assert.equal(code(response.body), 'rate_limited');
  assert.equal(response.headers[LIMIT_HEADER], undefined);
});

test('a daily-limit response carries no model call, key or input', async () => {
  const { deps, logs } = setup({ limiter: limiterReturning({ allowed: false, scope: 'user' }) });
  const response = await handleTurn(httpRequest(), deps);
  const serialised = JSON.stringify(response) + JSON.stringify(logs.entries);
  assert.ok(!serialised.includes('SECRET-INPUT-MARKER'));
  assert.ok(!serialised.includes(TEST_KEY));
});

test('a limiter that cannot answer fails closed, without calling the model', async () => {
  let modelCalls = 0;
  const { deps, logs } = setup({
    model: async () => (modelCalls += 1, mockModel({} as never)),
    limiter: { consume: async () => { throw new Error('firestore down'); } }
  });
  const response = await handleTurn(httpRequest(), deps);
  assert.equal(response.status, 503);
  assert.equal(code(response.body), 'upstream_unavailable');
  assert.equal(modelCalls, 0);
  assert.equal(logs.entries[0].outcome, 'limiter_error');
});

const MAPPINGS: Array<[ModelFailureCode, number, string, string]> = [
  ['timeout', 504, 'upstream_unavailable', 'model_timeout'],
  ['rate_limited', 429, 'rate_limited', 'model_rate_limited'],
  ['unavailable', 502, 'upstream_unavailable', 'model_unavailable'],
  ['upstream_auth', 502, 'upstream_unavailable', 'model_auth_error'],
  ['malformed', 502, 'upstream_unavailable', 'model_malformed'],
  ['empty', 502, 'upstream_unavailable', 'model_empty'],
  ['truncated', 502, 'upstream_unavailable', 'reply_rejected'],
  ['rejected_reply', 502, 'upstream_unavailable', 'reply_rejected'],
  ['prompt_too_large', 502, 'upstream_unavailable', 'model_unavailable']
];

for (const [failure, status, errorCode, outcome] of MAPPINGS) {
  test('model failure "' + failure + '" becomes ' + status + ' and is logged as ' + outcome, async () => {
    const { deps, logs } = setup({ mode: 'live', model: failing(failure) });
    const response = await handleTurn(httpRequest(), deps);
    assert.equal(response.status, status);
    assert.equal(code(response.body), errorCode);
    assert.deepEqual(logs.entries.map((e) => [e.status, e.outcome, e.mode]), [[status, outcome, 'live']]);
    assert.equal(response.headers['Cache-Control'], 'no-store');
  });
}

test('an upstream Retry-After is passed on, bounded', async () => {
  const { deps } = setup({ model: failing('rate_limited', 12) });
  const response = await handleTurn(httpRequest(), deps);
  assert.equal(response.status, 429);
  assert.equal(response.headers['Retry-After'], '12');

  const { deps: d2 } = setup({ model: failing('rate_limited') });
  assert.equal((await handleTurn(httpRequest(), d2)).headers['Retry-After'], undefined);
});

test('an unexpected error from a model client is still a generic 500', async () => {
  const { deps, logs } = setup({ model: async () => { throw new Error('boom ' + TEST_KEY); } });
  const response = await handleTurn(httpRequest(), deps);
  assert.equal(response.status, 500);
  assert.equal(code(response.body), 'internal');
  assert.equal(logs.entries[0].outcome, 'model_error');
  assert.ok(!JSON.stringify(response).includes(TEST_KEY));
});

test('error bodies carry only generic messages, never the key or the input', async () => {
  const { deps, logs } = setup({ model: failing('unavailable') });
  const response = await handleTurn(httpRequest(), deps);
  const serialised = JSON.stringify(response) + JSON.stringify(logs.entries);
  assert.ok(!serialised.includes(TEST_KEY));
  assert.ok(!serialised.includes('SECRET-INPUT-MARKER'));
  assert.deepEqual(Object.keys(logs.entries[0]).sort(), ['latencyMs', 'mode', 'outcome', 'route', 'status']);
});

test('upstream detail reaches the log only, never the browser response', async () => {
  for (const [failureCode, detail] of [['unavailable', 'http_404'], ['unavailable', 'fetch_TypeError'], ['upstream_auth', 'http_401']] as const) {
    const { deps, logs } = setup({
      mode: 'live',
      limiter: limiterReturning({ allowed: true }),
      model: async () => { throw new ModelFailure(failureCode, undefined, detail); }
    });
    const response = await handleTurn(httpRequest(), deps);
    assert.equal(response.status, 502);
    assert.deepEqual(response.body, { error: { code: 'upstream_unavailable', message: 'The conversation partner is unavailable right now.' } });
    assert.ok(!JSON.stringify(response).includes(detail), 'the detail is not in the response');
    assert.equal(logs.entries[0].upstream, detail);
  }
});

test('a rejected reply logs its allowlisted reason, and the browser response is unchanged', async () => {
  for (const [failureCode, reason] of [['rejected_reply', 'leak'], ['rejected_reply', 'forbidden_topic'], ['truncated', 'truncated']] as const) {
    const { deps, logs } = setup({
      mode: 'live',
      limiter: limiterReturning({ allowed: true }),
      model: async () => { throw new ModelFailure(failureCode, undefined, undefined, reason); }
    });
    const response = await handleTurn(httpRequest(), deps);
    assert.equal(response.status, 502);
    assert.deepEqual(response.body, { error: { code: 'upstream_unavailable', message: 'The conversation partner is unavailable right now.' } });
    assert.ok(!JSON.stringify(response).includes(reason));
    assert.equal(logs.entries[0].outcome, 'reply_rejected');
    assert.equal(logs.entries[0].reason, reason);
  }
});

test('a reason outside the allowlist, or on any other outcome, never reaches the log', async () => {
  for (const bad of ['the user said hi', 'leak ' + TEST_KEY, 'LEAK', '']) {
    const { deps, logs } = setup({ model: async () => { throw new ModelFailure('rejected_reply', undefined, undefined, bad); } });
    await handleTurn(httpRequest(), deps);
    assert.equal(logs.entries[0].reason, undefined);
    assert.ok(!JSON.stringify(logs.entries).includes(TEST_KEY));
  }
  const { deps, logs } = setup({ model: async () => { throw new ModelFailure('unavailable', undefined, 'http_500', 'leak'); } });
  await handleTurn(httpRequest(), deps);
  assert.equal(logs.entries[0].reason, undefined, 'reason is logged for reply_rejected only');
});

test('the reason allowlist covers every reply-validation rejection code', () => {
  const every: Record<RejectionReason, true> = {
    not_text: true, empty: true, unterminated_reasoning: true, leak: true, forbidden_topic: true, mock_marker: true,
    control_characters: true, link: true, unfinished: true, too_long: true, too_many_lines: true
  };
  for (const reason of Object.keys(every)) {
    assert.ok((REJECTION_REASONS as readonly string[]).includes(reason), reason + ' is allowlisted');
  }
  assert.ok((REJECTION_REASONS as readonly string[]).includes('truncated'));
  assert.equal(REJECTION_REASONS.length, Object.keys(every).length + 1);
});

test('an upstream detail of any other shape is dropped from the log', async () => {
  for (const bad of ['http_404 ' + TEST_KEY, 'fetch_Type Error', 'Bearer abc', 'http_1234', '']) {
    const { deps, logs } = setup({ model: async () => { throw new ModelFailure('unavailable', undefined, bad); } });
    await handleTurn(httpRequest(), deps);
    assert.equal(logs.entries[0].upstream, undefined);
    assert.ok(!JSON.stringify(logs.entries).includes(TEST_KEY));
  }
});
