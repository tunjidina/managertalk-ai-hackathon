import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createDailyLimiter } from '../rateLimit';
import { DailyLimiter, MAX_DAILY_CAP, durableCounterStore, hashUid, hashingLimiter } from './dailyLimiter';
import { limiterNamespace, sqliteState } from './workerSupport.test';

const DAY = '2026-10-28';
const at = (iso: string) => () => Date.parse(iso);

function post(object: DailyLimiter, body: unknown) {
  return object.fetch(new Request('https://limiter.internal/increment', { method: 'POST', body: JSON.stringify(body) }));
}

test('increments until the limit, then refuses without counting', async () => {
  const object = new DailyLimiter(sqliteState());
  const request = { day: DAY, requests: [{ key: 'user-a-' + DAY, limit: 2 }] };
  for (let i = 0; i < 2; i += 1) {
    assert.deepEqual(await (await post(object, request)).json(), { ok: true });
  }
  assert.deepEqual(await (await post(object, request)).json(), { ok: false, key: 'user-a-' + DAY });
  assert.deepEqual(await (await post(object, request)).json(), { ok: false, key: 'user-a-' + DAY });
});

test('is all-or-nothing: a full global counter leaves the user counter untouched', async () => {
  const state = sqliteState();
  const object = new DailyLimiter(state);
  await post(object, { day: DAY, requests: [{ key: 'global-' + DAY, limit: 1 }] });
  const refused = await (await post(object, {
    day: DAY,
    requests: [{ key: 'user-a-' + DAY, limit: 5 }, { key: 'global-' + DAY, limit: 1 }]
  })).json();
  assert.deepEqual(refused, { ok: false, key: 'global-' + DAY });
  const user = state.db.prepare('SELECT count FROM counters WHERE key = ?').all('user-a-' + DAY);
  assert.equal(user.length, 0);
});

test('a limit of 0 refuses everything', async () => {
  const object = new DailyLimiter(sqliteState());
  assert.deepEqual(await (await post(object, { day: DAY, requests: [{ key: 'k', limit: 0 }] })).json(), { ok: false, key: 'k' });
});

test('a new UTC day starts fresh and removes yesterday\'s rows', async () => {
  const state = sqliteState();
  const object = new DailyLimiter(state);
  await post(object, { day: '2026-10-27', requests: [{ key: 'user-a-2026-10-27', limit: 1 }] });
  const next = await (await post(object, { day: DAY, requests: [{ key: 'user-a-' + DAY, limit: 1 }] })).json();
  assert.deepEqual(next, { ok: true });
  const keys = state.db.prepare('SELECT key FROM counters').all().map((row) => row.key);
  assert.deepEqual(keys, ['user-a-' + DAY]);
});

test('a storage failure mid-increment rolls everything back and surfaces as an error', async () => {
  const state = sqliteState();
  const healthy = new DailyLimiter(state);
  await post(healthy, { day: DAY, requests: [{ key: 'a', limit: 5 }] });
  const failing = new DailyLimiter(sqliteState({ failOnInsert: true }));
  await assert.rejects(post(failing, { day: DAY, requests: [{ key: 'a', limit: 5 }] }));
  const rows = state.db.prepare('SELECT count FROM counters WHERE key = ?').all('a');
  assert.equal(Number(rows[0].count), 1);
});

test('concurrent requests cannot both take the last slot', async () => {
  const object = new DailyLimiter(sqliteState());
  const request = { day: DAY, requests: [{ key: 'k', limit: 1 }] };
  const results = await Promise.all([post(object, request), post(object, request), post(object, request)]);
  const bodies = (await Promise.all(results.map((r) => r.json()))) as Array<{ ok: boolean }>;
  assert.equal(bodies.filter((b) => b.ok).length, 1);
});

test('rejects malformed input and wrong methods', async () => {
  const object = new DailyLimiter(sqliteState());
  const bad: unknown[] = [
    null, 'x', {}, { day: 'tomorrow', requests: [{ key: 'k', limit: 1 }] },
    { day: DAY, requests: [] },
    { day: DAY, requests: [{ key: '', limit: 1 }] },
    { day: DAY, requests: [{ key: 'k', limit: -1 }] },
    { day: DAY, requests: [{ key: 'k', limit: 1.5 }] },
    { day: DAY, requests: [{ key: 'k', limit: 10_000_001 }] },
    { day: DAY, requests: [{ key: 'x'.repeat(201), limit: 1 }] },
    { day: DAY, requests: new Array(5).fill({ key: 'k', limit: 1 }) }
  ];
  for (const body of bad) {
    assert.equal((await post(object, body)).status, 400);
  }
  const invalidJson = await object.fetch(new Request('https://limiter.internal/increment', { method: 'POST', body: '{' }));
  assert.equal(invalidJson.status, 400);
  assert.equal((await object.fetch(new Request('https://limiter.internal/increment'))).status, 405);
});

test('through the store and daily limiter, the 41st request of a user in a day is refused', async () => {
  const namespace = limiterNamespace();
  const now = at('2026-10-28T12:00:00Z');
  const limiter = createDailyLimiter({ store: durableCounterStore(namespace, now), limits: { perUser: 40, global: 300 }, now });
  for (let i = 0; i < 40; i += 1) {
    assert.deepEqual(await limiter.consume('user-a'), { allowed: true });
  }
  assert.deepEqual(await limiter.consume('user-a'), { allowed: false, scope: 'user' });
  assert.deepEqual(await limiter.consume('user-b'), { allowed: true });
});

test('the global cap is reported as global', async () => {
  const namespace = limiterNamespace();
  const now = at('2026-10-28T12:00:00Z');
  const limiter = createDailyLimiter({ store: durableCounterStore(namespace, now), limits: { perUser: 5, global: 2 }, now });
  assert.deepEqual(await limiter.consume('a'), { allowed: true });
  assert.deepEqual(await limiter.consume('b'), { allowed: true });
  assert.deepEqual(await limiter.consume('c'), { allowed: false, scope: 'global' });
});

test('the store fails closed when the object errors or misbehaves', async () => {
  const broken = (response: () => Response) => ({
    idFromName: () => 'x',
    get: () => ({ fetch: async () => response() })
  });
  for (const make of [
    () => new Response('boom', { status: 500 }),
    () => new Response('not json', { status: 200 }),
    () => new Response(JSON.stringify({ ok: 'maybe' }), { status: 200 })
  ]) {
    await assert.rejects(durableCounterStore(broken(make)).tryIncrement([{ key: 'k', limit: 1 }]));
  }
});

test('the limiter accepts a cap of MAX_DAILY_CAP and refuses one above it', async () => {
  const object = new DailyLimiter(sqliteState());
  assert.deepEqual(await (await post(object, { day: DAY, requests: [{ key: 'k', limit: MAX_DAILY_CAP }] })).json(), { ok: true });
  assert.equal((await post(object, { day: DAY, requests: [{ key: 'k', limit: MAX_DAILY_CAP + 1 }] })).status, 400);
});

test('hashUid is stable, bounded and does not contain the id', async () => {
  const uid = 'é/ ?#&=+%'.repeat(15);
  const a = await hashUid(uid);
  assert.equal(a, await hashUid(uid));
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, await hashUid(uid + 'x'));
  assert.ok(!a.includes('/'));
});

test('a 128-character user id with awkward characters is metered under a bounded hashed key', async () => {
  const state = sqliteState();
  const namespace = limiterNamespace(state);
  const now = at('2026-10-28T12:00:00Z');
  const limiter = hashingLimiter(
    createDailyLimiter({ store: durableCounterStore(namespace, now), limits: { perUser: 2, global: 50 }, now })
  );
  const uid = 'é/ ?#&=+%'.repeat(15).slice(0, 128);
  assert.equal(uid.length, 128);

  assert.deepEqual(await limiter.consume(uid), { allowed: true });
  assert.deepEqual(await limiter.consume(uid), { allowed: true });
  assert.deepEqual(await limiter.consume(uid), { allowed: false, scope: 'user' });
  assert.deepEqual(await limiter.consume(uid.slice(0, 127)), { allowed: true });

  const rows = state.db.prepare('SELECT key FROM counters').all().map((row) => String(row.key));
  assert.ok(rows.length > 0);
  for (const key of rows) {
    assert.ok(key.length <= 100, 'key length ' + key.length);
    assert.ok(!key.includes('%'), 'no percent-encoded id in the key');
    assert.ok(!key.includes(uid.slice(0, 10)));
  }
});

test('an empty or non-string user id is still refused, never hashed into an allowed one', async () => {
  const now = at('2026-10-28T12:00:00Z');
  const limiter = hashingLimiter(
    createDailyLimiter({ store: durableCounterStore(limiterNamespace(), now), limits: { perUser: 5, global: 5 }, now })
  );
  assert.deepEqual(await limiter.consume(''), { allowed: false, scope: 'user' });
  assert.deepEqual(await limiter.consume(undefined as unknown as string), { allowed: false, scope: 'user' });
});
