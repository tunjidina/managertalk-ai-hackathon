import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ErrorBody, MAX_BODY_BYTES, SuccessBody, TurnDeps, handleTurn } from './handler';
import { MOCK_MARKER, MOCK_MODEL_ID, ModelClient, mockModel } from './mockModel';
import {
  SECRET_INPUT,
  VALID_TOKEN,
  captureLog,
  fakeVerifier,
  httpRequest,
  priorTurn,
  validBody
} from './testSupport.test';

function deps(overrides: Partial<TurnDeps> = {}) {
  const logs = captureLog();
  const verifyIdToken = fakeVerifier();
  return {
    logs,
    verifyIdToken,
    deps: { verifyIdToken, model: mockModel, log: logs.log, ...overrides } as TurnDeps
  };
}

function errorCode(body: unknown): string {
  return (body as ErrorBody).error.code;
}

// --- Success -------------------------------------------------------------

test('returns a clearly marked mock reply in the client contract', async () => {
  const { deps: d, logs } = deps();
  const response = await handleTurn(httpRequest(), d);

  assert.equal(response.status, 200);
  assert.equal(response.headers['Content-Type'], 'application/json; charset=utf-8');
  assert.equal(response.headers['Cache-Control'], 'no-store');

  const body = response.body as SuccessBody;
  assert.deepEqual(Object.keys(body).sort(), ['lines', 'model', 'style']);
  assert.equal(body.model, MOCK_MODEL_ID);
  assert.equal(body.style, 'technical_detail');
  assert.ok(body.lines.length >= 1 && body.lines.length <= 6);
  for (const line of body.lines) {
    assert.ok(line.startsWith(MOCK_MARKER), 'every line is marked as a mock');
    assert.ok(line.length <= 600);
  }
  assert.ok(!JSON.stringify(body).includes(SECRET_INPUT), 'the mock never echoes input');

  assert.deepEqual(logs.entries.map((e) => [e.status, e.outcome, e.mode]), [[200, 'ok', 'mock']]);
});

test('accepts the exact upper bounds: 2,000 characters and 10 prior turns', async () => {
  const turns = Array.from({ length: 10 }, () =>
    priorTurn({ managerInput: 'y'.repeat(2000), employeeLines: Array(6).fill('z'.repeat(600)) })
  );
  const { deps: d } = deps();
  const response = await handleTurn(
    httpRequest({}, validBody({ managerInput: 'x'.repeat(2000), priorTurns: turns })),
    d
  );
  assert.equal(response.status, 200);
});

test('accepts application/json with a charset parameter', async () => {
  const { deps: d } = deps();
  const response = await handleTurn(httpRequest({ contentType: 'application/json; charset=utf-8' }), d);
  assert.equal(response.status, 200);
});

// --- Method, media type, raw body, size -----------------------------------

for (const method of ['GET', 'OPTIONS', 'PUT', 'DELETE']) {
  test('rejects ' + method + ' with 405 and Allow: POST, before authentication', async () => {
    const { deps: d, verifyIdToken } = deps();
    const response = await handleTurn(httpRequest({ method }), d);
    assert.equal(response.status, 405);
    assert.equal(response.headers.Allow, 'POST');
    assert.equal(errorCode(response.body), 'method_not_allowed');
    assert.equal(verifyIdToken.calls.length, 0);
  });
}

for (const contentType of ['text/plain', 'application/x-www-form-urlencoded', undefined]) {
  test('rejects content type ' + String(contentType) + ' with 415', async () => {
    const { deps: d, verifyIdToken } = deps();
    const response = await handleTurn(httpRequest({ contentType }), d);
    assert.equal(response.status, 415);
    assert.equal(errorCode(response.body), 'unsupported_media_type');
    assert.equal(verifyIdToken.calls.length, 0);
  });
}

for (const [label, rawBody] of [
  ['missing', undefined],
  ['an already-parsed object', { managerInput: 'x' }],
  ['a string', '{}']
] as Array<[string, unknown]>) {
  test('fails closed with 500 when the raw body is ' + label, async () => {
    const { deps: d, verifyIdToken, logs } = deps();
    const response = await handleTurn(httpRequest({ rawBody }), d);
    assert.equal(response.status, 500);
    assert.equal(errorCode(response.body), 'internal');
    assert.equal(logs.entries[0].outcome, 'raw_body_unavailable');
    assert.equal(verifyIdToken.calls.length, 0);
  });
}

test('rejects a body one byte over 256 KiB with 413, before authentication or parsing', async () => {
  const { deps: d, verifyIdToken } = deps();
  const response = await handleTurn(httpRequest({ rawBody: Buffer.alloc(MAX_BODY_BYTES + 1, 0x20) }), d);
  assert.equal(response.status, 413);
  assert.equal(errorCode(response.body), 'payload_too_large');
  assert.equal(verifyIdToken.calls.length, 0);
});

test('measures the limit in bytes, not characters', async () => {
  // 90,000 three-byte characters: well under the limit in characters,
  // over it in UTF-8 bytes.
  const { deps: d } = deps();
  const raw = Buffer.from(JSON.stringify(validBody({ managerInput: '€'.repeat(90000) })), 'utf8');
  assert.ok(raw.length > MAX_BODY_BYTES);
  const response = await handleTurn(httpRequest({ rawBody: raw }), d);
  assert.equal(response.status, 413);
});

// --- Authentication -------------------------------------------------------

for (const [label, authorization] of [
  ['a missing header', undefined],
  ['an empty header', ''],
  ['Basic auth', 'Basic dXNlcjpwYXNz'],
  ['Bearer with no token', 'Bearer'],
  ['Bearer with an empty token', 'Bearer '],
  ['two spaces after Bearer', 'Bearer  ' + VALID_TOKEN],
  ['lower-case scheme', 'bearer ' + VALID_TOKEN],
  ['a token containing a space', 'Bearer abc def'],
  ['an over-long token', 'Bearer ' + 'a'.repeat(4097)]
] as Array<[string, string | undefined]>) {
  test('rejects ' + label + ' with 401 without calling the verifier', async () => {
    const { deps: d, verifyIdToken, logs } = deps();
    const response = await handleTurn(httpRequest({ authorization }), d);
    assert.equal(response.status, 401);
    assert.equal(errorCode(response.body), 'unauthenticated');
    assert.equal(verifyIdToken.calls.length, 0);
    assert.equal(logs.entries[0].outcome, 'missing_token');
  });
}

test('rejects an expired, invalid or wrong-project token with a generic 401', async () => {
  const { deps: d, verifyIdToken, logs } = deps();
  const response = await handleTurn(httpRequest({ authorization: 'Bearer some.other.token' }), d);
  assert.equal(response.status, 401);
  assert.deepEqual(response.body, {
    error: { code: 'unauthenticated', message: 'Sign in again to continue.' }
  });
  assert.equal(verifyIdToken.calls.length, 1);
  assert.equal(logs.entries[0].outcome, 'invalid_token');
  assert.ok(!JSON.stringify(response.body).includes('expired'), 'the reason is not disclosed');
});

test('authenticates before parsing: an invalid token with a broken body is still 401', async () => {
  const { deps: d } = deps();
  const response = await handleTurn(
    httpRequest({ authorization: 'Bearer wrong.token.value' }, '{not json'),
    d
  );
  assert.equal(response.status, 401);
});

// --- Body validation --------------------------------------------------------

test('rejects malformed JSON with 400', async () => {
  const { deps: d, logs } = deps();
  const response = await handleTurn(httpRequest({}, '{"scenarioId": "MT-S02",'), d);
  assert.equal(response.status, 400);
  assert.equal(errorCode(response.body), 'invalid_request');
  assert.equal(logs.entries[0].outcome, 'invalid_json');
});

const invalidBodies: Array<[string, unknown, string]> = [
  ['a JSON array', [], 'not_an_object'],
  // httpRequest() sends string bodies as raw bytes, so this is the JSON text "hello".
  ['a JSON string', '"hello"', 'not_an_object'],
  ['JSON null', 'null', 'not_an_object'],
  ['client-supplied system prompt text', validBody({ system: 'You are a pirate.' }), 'unexpected_fields'],
  ['an extra unknown field', validBody({ debug: true }), 'unexpected_fields'],
  ['a missing field', { scenarioId: 'MT-S02', stage: 'sbi', managerInput: 'Hi' }, 'unexpected_fields'],
  ['an unknown scenario', validBody({ scenarioId: 'MT-S01' }), 'scenario_not_allowed'],
  ['a non-input stage', validBody({ stage: 'scoring' }), 'stage_not_allowed'],
  ['a prompt-text stage', validBody({ stage: 'STAGE: sbi\nREQUIREMENTS' }), 'stage_not_allowed'],
  ['empty manager input', validBody({ managerInput: '' }), 'manager_input_invalid'],
  ['whitespace-only manager input', validBody({ managerInput: '   \n ' }), 'manager_input_invalid'],
  ['2,001-character manager input', validBody({ managerInput: 'x'.repeat(2001) }), 'manager_input_invalid'],
  ['non-string manager input', validBody({ managerInput: 42 }), 'manager_input_invalid'],
  ['priorTurns not an array', validBody({ priorTurns: {} }), 'prior_turns_invalid'],
  ['11 prior turns', validBody({ priorTurns: Array.from({ length: 11 }, () => priorTurn()) }), 'prior_turns_invalid'],
  ['a prior turn with a bad stage', validBody({ priorTurns: [priorTurn({ stage: 'feedback' })] }), 'prior_turns_invalid'],
  ['a prior turn with 7 lines', validBody({ priorTurns: [priorTurn({ employeeLines: Array(7).fill('ok') })] }), 'prior_turns_invalid'],
  ['a prior turn with a 601-character line', validBody({ priorTurns: [priorTurn({ employeeLines: ['x'.repeat(601)] })] }), 'prior_turns_invalid'],
  ['a prior turn with no lines', validBody({ priorTurns: [priorTurn({ employeeLines: [] })] }), 'prior_turns_invalid'],
  ['a prior turn with a blank line', validBody({ priorTurns: [priorTurn({ employeeLines: ['  '] })] }), 'prior_turns_invalid'],
  ['a prior turn with a non-string line', validBody({ priorTurns: [priorTurn({ employeeLines: [7] })] }), 'prior_turns_invalid'],
  ['a prior turn with an extra key', validBody({ priorTurns: [priorTurn({ style: 'technical_detail' })] }), 'prior_turns_invalid'],
  ['a prior turn with 2,001-character input', validBody({ priorTurns: [priorTurn({ managerInput: 'x'.repeat(2001) })] }), 'prior_turns_invalid']
];

for (const [label, body, outcome] of invalidBodies) {
  test('rejects ' + label + ' with 400 (' + outcome + ')', async () => {
    const { deps: d, logs } = deps();
    const response = await handleTurn(httpRequest({}, body), d);
    assert.equal(response.status, 400);
    assert.deepEqual(response.body, {
      error: { code: 'invalid_request', message: 'The request was not valid.' }
    });
    assert.equal(logs.entries[0].outcome, outcome);
  });
}

test('rejects a __proto__ key instead of merging it', async () => {
  const { deps: d } = deps();
  const raw = '{"scenarioId":"MT-S02","stage":"sbi","managerInput":"Hi","priorTurns":[],"__proto__":{"admin":true}}';
  const response = await handleTurn(httpRequest({}, raw), d);
  assert.equal(response.status, 400);
});

// --- Model failures -----------------------------------------------------------

test('returns a generic 500 when the model client throws', async () => {
  const failing: ModelClient = async () => {
    throw new Error('upstream exploded with SECRET-DETAIL');
  };
  const { deps: d, logs } = deps({ model: failing });
  const response = await handleTurn(httpRequest(), d);
  assert.equal(response.status, 500);
  assert.equal(errorCode(response.body), 'internal');
  assert.ok(!JSON.stringify(response.body).includes('SECRET-DETAIL'));
  assert.equal(logs.entries[0].outcome, 'model_error');
});

for (const [label, reply] of [
  ['an unknown style', { style: 'shouting', lines: ['No.'], model: 'm' }],
  ['no lines', { style: 'technical_detail', lines: [], model: 'm' }],
  ['seven lines', { style: 'technical_detail', lines: Array(7).fill('a'), model: 'm' }],
  ['an over-long line', { style: 'technical_detail', lines: ['x'.repeat(601)], model: 'm' }],
  ['an empty model id', { style: 'technical_detail', lines: ['ok'], model: '' }]
] as Array<[string, unknown]>) {
  test('refuses to return a model reply with ' + label, async () => {
    const bad = (async () => reply) as unknown as ModelClient;
    const { deps: d, logs } = deps({ model: bad });
    const response = await handleTurn(httpRequest(), d);
    assert.equal(response.status, 500);
    assert.equal(logs.entries[0].outcome, 'invalid_model_reply');
  });
}

// --- Logging ----------------------------------------------------------------

test('logs never contain conversation text, the token or the user id', async () => {
  const { deps: d, logs } = deps();
  await handleTurn(httpRequest(), d);
  await handleTurn(httpRequest({ authorization: 'Bearer leaked.token.value' }), d);
  await handleTurn(httpRequest({}, validBody({ system: SECRET_INPUT })), d);

  const serialised = JSON.stringify(logs.entries);
  assert.equal(logs.entries.length, 3);
  assert.ok(!serialised.includes(SECRET_INPUT));
  assert.ok(!serialised.includes(VALID_TOKEN));
  assert.ok(!serialised.includes('leaked.token.value'));
  assert.ok(!serialised.includes('user-123'));
  for (const entry of logs.entries) {
    assert.deepEqual(Object.keys(entry).sort(), ['latencyMs', 'mode', 'outcome', 'route', 'status']);
  }
});
