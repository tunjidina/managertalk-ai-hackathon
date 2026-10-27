import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MAX_BODY_BYTES } from '../handler';
import { TurnLogEntry } from '../log';
import { TEST_KEY, completion, jsonResponse, recordingFetch } from '../fetchSupport.test';
import { validBody } from '../testSupport.test';
import { createWorker, parseCap, WorkerEnv } from './app';
import { MAX_DAILY_CAP } from './dailyLimiter';
import { PROJECT_ID, limiterNamespace, makeKeys } from './workerSupport.test';

const URL_TURN = 'https://demo.example.workers.dev/api/s02/turn';
const REPLY = 'I answered the question as it was put to me.\n\nWhich part do you mean?';

async function setup(envOverrides: Partial<WorkerEnv> = {}, fetchImpl?: typeof fetch) {
  const keys = await makeKeys();
  const logs: TurnLogEntry[] = [];
  const assetCalls: string[] = [];
  const neverCalled = recordingFetch(() => {
    throw new Error('network must not be used');
  });
  const worker = createWorker({ keySet: keys.keySet, fetchImpl: fetchImpl || neverCalled, log: (e) => logs.push(e) });
  const env: WorkerEnv = {
    FIREBASE_PROJECT_ID: PROJECT_ID,
    ASSETS: {
      fetch: async (request) => {
        assetCalls.push(new URL(request.url).pathname);
        return new Response('asset', { status: 200 });
      }
    },
    ...envOverrides
  };
  const call = async (path: string, init: RequestInit = {}) => worker.fetch(new Request('https://demo.example.workers.dev' + path, init), env);
  const turn = async (token: string | null, body: unknown = validBody(), headers: Record<string, string> = {}) =>
    call('/api/s02/turn', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body)
    });
  return { keys, logs, assetCalls, neverCalled, call, turn, env };
}

test('mock mode answers a signed-in turn with no key and no network', async () => {
  const s = await setup();
  const response = await s.turn(await s.keys.mint());
  assert.equal(response.status, 200);
  const body = (await response.json()) as { lines: string[]; model: string };
  assert.ok(body.lines.length > 0);
  assert.match(body.model, /mock/i);
  assert.equal(s.neverCalled.calls.length, 0);
  assert.equal(s.logs[0].mode, 'mock');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('rejects missing and invalid tokens with a generic 401 before any model call', async () => {
  const s = await setup();
  for (const token of [null, 'not.a.jwt', await s.keys.mint({}, { forged: true }), await s.keys.mint({}, { expiresInSeconds: -3600 })]) {
    const response = await s.turn(token);
    assert.equal(response.status, 401);
    const text = await response.text();
    assert.ok(!text.includes('not.a.jwt'));
  }
  assert.equal(s.neverCalled.calls.length, 0);
});

test('rejects every token when no Firebase project id is configured', async () => {
  const s = await setup({ FIREBASE_PROJECT_ID: undefined });
  assert.equal((await s.turn(await s.keys.mint())).status, 401);
});

test('validates the request: media type, JSON, shape and size', async () => {
  const s = await setup();
  const token = await s.keys.mint();
  assert.equal((await s.turn(token, validBody(), { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await s.turn(token, '{not json')).status, 400);
  assert.equal((await s.turn(token, validBody({ scenarioId: 'MT-S99' }))).status, 400);
  assert.equal((await s.turn(token, validBody({ stage: 'nope' }))).status, 400);
  // Declared oversize is refused without reading the body.
  const declared = await s.turn(token, validBody(), { 'content-length': String(MAX_BODY_BYTES + 1) });
  assert.equal(declared.status, 413);
  // Undeclared oversize (streamed) is refused too.
  const big = 'x'.repeat(MAX_BODY_BYTES + 10);
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(big));
      controller.close();
    }
  });
  const streamed = await s.call('/api/s02/turn', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
    body: stream,
    duplex: 'half'
  } as RequestInit);
  assert.equal(streamed.status, 413);
});

test('routes: GET on the endpoint is 405, other /api paths are 404, other paths go to assets', async () => {
  const s = await setup();
  const get = await s.call('/api/s02/turn');
  assert.equal(get.status, 405);
  assert.equal(get.headers.get('allow'), 'POST');
  assert.equal((await s.call('/api/other')).status, 404);
  assert.equal((await s.call('/api')).status, 404);
  assert.deepEqual(s.assetCalls, []);
  assert.equal((await s.call('/')).status, 200);
  assert.equal((await s.call('/static/js/main.js')).status, 200);
  assert.deepEqual(s.assetCalls, ['/', '/static/js/main.js']);
  assert.equal((await s.call('/', { method: 'POST', body: 'x' })).status, 405);
});

test('live mode without a key, without the limiter binding, or with a bad cap stays mock', async () => {
  for (const overrides of [
    { S02_ENGINE_MODE: 'live' },
    { S02_ENGINE_MODE: 'live', NEBIUS_API_KEY: TEST_KEY },
    { S02_ENGINE_MODE: 'live', NEBIUS_API_KEY: TEST_KEY, LIMITER: limiterNamespace(), S02_USER_DAILY_CAP: 'abc' },
    { S02_ENGINE_MODE: 'LIVE', NEBIUS_API_KEY: TEST_KEY, LIMITER: limiterNamespace() }
  ]) {
    const s = await setup(overrides);
    const response = await s.turn(await s.keys.mint());
    assert.equal(response.status, 200);
    assert.match(((await response.json()) as { model: string }).model, /mock/i);
    assert.equal(s.neverCalled.calls.length, 0);
    assert.equal(s.logs[0].mode, 'mock');
  }
});

test('live mode calls the model with the key server-side, meters the user, and never leaks the key', async () => {
  const fake = recordingFetch(() => jsonResponse(completion(REPLY)));
  const s = await setup(
    { S02_ENGINE_MODE: 'live', NEBIUS_API_KEY: TEST_KEY, LIMITER: limiterNamespace(), S02_USER_DAILY_CAP: '2', S02_GLOBAL_DAILY_CAP: '50' },
    fake
  );
  const token = await s.keys.mint();

  const first = await s.turn(token);
  assert.equal(first.status, 200);
  const firstText = await first.text();
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0].url, 'https://api.tokenfactory.nebius.com/v1/chat/completions');
  assert.equal((fake.calls[0].init.headers as Record<string, string>).Authorization, 'Bearer ' + TEST_KEY);
  assert.equal(s.logs[0].mode, 'live');

  assert.equal((await s.turn(token)).status, 200);

  const third = await s.turn(token);
  assert.equal(third.status, 429);
  assert.equal(third.headers.get('x-managertalk-limit'), 'daily-user');
  const thirdText = await third.text();
  assert.equal(fake.calls.length, 2, 'the model is not called once the cap is reached');

  for (const text of [firstText, thirdText, JSON.stringify(s.logs)]) {
    assert.ok(!text.includes(TEST_KEY));
    assert.ok(!text.includes(token));
  }
});

test('a limiter that cannot answer fails closed with 503 and no model call', async () => {
  const fake = recordingFetch(() => jsonResponse(completion(REPLY)));
  const broken = { idFromName: () => 'x', get: () => ({ fetch: async () => new Response('boom', { status: 500 }) }) };
  const s = await setup({ S02_ENGINE_MODE: 'live', NEBIUS_API_KEY: TEST_KEY, LIMITER: broken }, fake);
  const response = await s.turn(await s.keys.mint());
  assert.equal(response.status, 503);
  assert.equal(fake.calls.length, 0);
});

test('log lines carry only the allow-listed fields', async () => {
  const s = await setup();
  await s.turn(await s.keys.mint());
  await s.turn(null);
  for (const entry of s.logs) {
    assert.deepEqual(Object.keys(entry).sort(), ['latencyMs', 'mode', 'outcome', 'route', 'status']);
  }
});

test('parseCap accepts plain digits up to the limiter maximum and nothing else', () => {
  assert.equal(parseCap(undefined), undefined);
  assert.equal(parseCap(''), undefined);
  assert.equal(parseCap('0'), 0);
  assert.equal(parseCap('40'), 40);
  assert.equal(parseCap(String(MAX_DAILY_CAP)), MAX_DAILY_CAP);
  for (const bad of [String(MAX_DAILY_CAP + 1), '9999999', '-1', '1.5', '1e3', ' 5', 'abc', '12345678']) {
    assert.ok(Number.isNaN(parseCap(bad) as number), bad);
  }
});

test('a cap above the limiter maximum keeps the Worker in mock mode instead of failing every live request', async () => {
  const fake = recordingFetch(() => jsonResponse(completion(REPLY)));
  const s = await setup(
    { S02_ENGINE_MODE: 'live', NEBIUS_API_KEY: TEST_KEY, LIMITER: limiterNamespace(), S02_USER_DAILY_CAP: String(MAX_DAILY_CAP + 1) },
    fake
  );
  const response = await s.turn(await s.keys.mint());
  assert.equal(response.status, 200);
  assert.match(((await response.json()) as { model: string }).model, /mock/i);
  assert.equal(fake.calls.length, 0);
});

test('a cap of exactly the limiter maximum works in live mode', async () => {
  const fake = recordingFetch(() => jsonResponse(completion(REPLY)));
  const s = await setup(
    { S02_ENGINE_MODE: 'live', NEBIUS_API_KEY: TEST_KEY, LIMITER: limiterNamespace(), S02_USER_DAILY_CAP: String(MAX_DAILY_CAP), S02_GLOBAL_DAILY_CAP: String(MAX_DAILY_CAP) },
    fake
  );
  assert.equal((await s.turn(await s.keys.mint())).status, 200);
  assert.equal(fake.calls.length, 1);
});

test('a verified 128-character user id is metered in live mode without storing or logging it', async () => {
  const uid = 'é/ ?#&=+%'.repeat(15).slice(0, 128);
  const fake = recordingFetch(() => jsonResponse(completion(REPLY)));
  const namespace = limiterNamespace();
  const s = await setup({ S02_ENGINE_MODE: 'live', NEBIUS_API_KEY: TEST_KEY, LIMITER: namespace, S02_USER_DAILY_CAP: '1' }, fake);
  const token = await s.keys.mint({ sub: uid });

  const first = await s.turn(token);
  assert.equal(first.status, 200);
  const second = await s.turn(token);
  assert.equal(second.status, 429);
  assert.equal(second.headers.get('x-managertalk-limit'), 'daily-user');

  const stored = JSON.stringify(namespace.state.db.prepare('SELECT key FROM counters').all());
  assert.ok(!stored.includes(encodeURIComponent(uid).slice(0, 12)));
  assert.ok(!JSON.stringify(s.logs).includes(uid.slice(0, 6)));
  assert.ok(!(await second.text()).includes(uid.slice(0, 6)));
});

test('errors while reading the body, choosing the engine or setting up the verifier return the generic JSON 500', async () => {
  const secret = 'SECRET-INTERNAL-DETAIL';
  const cases: Array<[string, (s: Awaited<ReturnType<typeof setup>>) => Promise<Response>]> = [
    [
      'body read',
      async (s) => {
        const stream = new ReadableStream({
          start(controller) {
            controller.error(new Error(secret));
          }
        });
        return s.call('/api/s02/turn', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: 'Bearer x' },
          body: stream,
          duplex: 'half'
        } as RequestInit);
      }
    ],
    [
      'engine selection',
      async (s) => {
        Object.defineProperty(s.env, 'S02_ENGINE_MODE', {
          get() {
            throw new Error(secret);
          }
        });
        return s.turn(await s.keys.mint());
      }
    ],
    [
      'verifier setup',
      async (s) => {
        Object.defineProperty(s.env, 'FIREBASE_PROJECT_ID', {
          get() {
            throw new Error(secret);
          }
        });
        return s.turn(await s.keys.mint());
      }
    ]
  ];

  for (const [label, run] of cases) {
    const s = await setup();
    const response = await run(s);
    const text = await response.text();
    assert.equal(response.status, 500, label);
    assert.deepEqual(JSON.parse(text), { error: { code: 'internal', message: 'Something went wrong. Please try again.' } }, label);
    assert.ok(!text.includes(secret), label);
    assert.equal(response.headers.get('cache-control'), 'no-store', label);
    assert.equal(s.logs.length, 1, label);
    assert.equal(s.logs[0].outcome, 'worker_error', label);
    assert.ok(!JSON.stringify(s.logs).includes(secret), label);
  }
});

test('a logger that throws during error handling still yields the generic 500', async () => {
  const keys = await makeKeys();
  const worker = createWorker({
    keySet: keys.keySet,
    log: () => {
      throw new Error('logger down');
    }
  });
  const env = { ASSETS: { fetch: async () => new Response('x') } } as unknown as WorkerEnv;
  Object.defineProperty(env, 'S02_ENGINE_MODE', { get() { throw new Error('x'); } });
  const response = await worker.fetch(
    new Request('https://d.example/api/s02/turn', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }),
    env
  );
  assert.equal(response.status, 500);
});
