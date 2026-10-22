import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_LIMITS,
  CounterStore,
  FirestoreLike,
  FirestoreTransactionLike,
  USAGE_COLLECTION,
  counterKeys,
  createDailyLimiter,
  dayKey,
  firestoreCounterStore,
  memoryCounterStore
} from './rateLimit';

const DAY1 = Date.UTC(2026, 9, 30, 12, 0, 0);
const DAY2 = Date.UTC(2026, 9, 31, 0, 0, 1);

function limiter(perUser: number, global: number, clock: { now: number }, store: CounterStore = memoryCounterStore()) {
  return createDailyLimiter({ store, limits: { perUser, global }, now: () => clock.now });
}

test('dayKey is the UTC calendar day', () => {
  assert.equal(dayKey(Date.UTC(2026, 9, 30, 23, 59, 59)), '2026-10-30');
  assert.equal(dayKey(Date.UTC(2026, 9, 31, 0, 0, 0)), '2026-10-31');
});

test('a user is allowed up to the per-user cap, then refused', async () => {
  const clock = { now: DAY1 };
  const l = limiter(3, 100, clock);
  for (let i = 0; i < 3; i += 1) {
    assert.deepEqual(await l.consume('alice'), { allowed: true });
  }
  assert.deepEqual(await l.consume('alice'), { allowed: false, scope: 'user' });
  assert.deepEqual(await l.consume('bob'), { allowed: true });
});

test('the global cap stops everyone once it is reached', async () => {
  const clock = { now: DAY1 };
  const l = limiter(10, 2, clock);
  assert.equal((await l.consume('a')).allowed, true);
  assert.equal((await l.consume('b')).allowed, true);
  assert.deepEqual(await l.consume('c'), { allowed: false, scope: 'global' });
});

test('a request refused by one cap does not use up the other', async () => {
  const clock = { now: DAY1 };
  const store = memoryCounterStore();
  const l = limiter(1, 5, clock, store);
  await l.consume('alice');
  assert.equal((await l.consume('alice')).allowed, false);
  assert.equal(store.counts.get(counterKeys('alice', DAY1).global), 1, 'the refused call did not charge the global cap');

  const l2 = limiter(5, 1, clock, memoryCounterStore());
  await l2.consume('x');
  assert.equal((await l2.consume('y')).allowed, false);
});

test('counters reset on the next UTC day', async () => {
  const clock = { now: DAY1 };
  const l = limiter(1, 1, clock);
  assert.equal((await l.consume('alice')).allowed, true);
  assert.equal((await l.consume('alice')).allowed, false);
  clock.now = DAY2;
  assert.equal((await l.consume('alice')).allowed, true);
});

test('a zero cap refuses everything, which switches live calls off', async () => {
  const clock = { now: DAY1 };
  assert.equal((await limiter(0, 100, clock).consume('alice')).allowed, false);
  assert.equal((await limiter(100, 0, clock).consume('alice')).allowed, false);
});

test('an empty or missing user id is refused', async () => {
  const clock = { now: DAY1 };
  const l = limiter(5, 5, clock);
  assert.equal((await l.consume('')).allowed, false);
  assert.equal((await l.consume(undefined as unknown as string)).allowed, false);
});

test('invalid limits are rejected when the limiter is built', () => {
  const store = memoryCounterStore();
  assert.throws(() => createDailyLimiter({ store, limits: { perUser: -1, global: 5 } }));
  assert.throws(() => createDailyLimiter({ store, limits: { perUser: 1.5, global: 5 } }));
  assert.throws(() => createDailyLimiter({ store, limits: { perUser: 5, global: NaN } }));
});

test('user ids with unusual characters become safe counter keys', () => {
  const keys = counterKeys('a/b c?d', DAY1);
  assert.ok(!keys.user.includes('/'));
  assert.equal(keys.user, 'user-a%2Fb%20c%3Fd-2026-10-30');
  assert.equal(keys.global, 'global-2026-10-30');
});

test('the default limits are 40 per user and 300 overall', () => {
  assert.deepEqual(DEFAULT_LIMITS, { perUser: 40, global: 300 });
});

// --- Firestore store, against a fake that behaves like a transaction ------

function fakeFirestore() {
  const docs = new Map<string, { count: number; updatedAtMs: number }>();
  let transactions = 0;
  const db: FirestoreLike = {
    collection(name: string) {
      assert.equal(name, USAGE_COLLECTION);
      return { doc: (id: string) => ({ id }) };
    },
    async runTransaction<T>(update: (transaction: FirestoreTransactionLike) => Promise<T>): Promise<T> {
      transactions += 1;
      const pending = new Map<string, { count: number; updatedAtMs: number }>();
      let wrote = false;
      let readAfterWrite = false;
      const transaction: FirestoreTransactionLike = {
        async get(ref) {
          if (wrote) {
            readAfterWrite = true;
          }
          const value = docs.get((ref as { id: string }).id);
          return { data: () => value };
        },
        set(ref, data) {
          wrote = true;
          pending.set((ref as { id: string }).id, data as { count: number; updatedAtMs: number });
        }
      };
      const result = await update(transaction);
      assert.equal(readAfterWrite, false, 'a transaction must read before it writes');
      pending.forEach((value, id) => docs.set(id, value));
      return result;
    }
  };
  return { db, docs, transactions: () => transactions };
}

test('the Firestore store increments both counters in one transaction', async () => {
  const fake = fakeFirestore();
  const store = firestoreCounterStore(fake.db, () => 123);
  const result = await store.tryIncrement([
    { key: 'user-a-2026-10-30', limit: 2 },
    { key: 'global-2026-10-30', limit: 5 }
  ]);
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(fake.docs.get('user-a-2026-10-30'), { count: 1, updatedAtMs: 123 });
  assert.deepEqual(fake.docs.get('global-2026-10-30'), { count: 1, updatedAtMs: 123 });
  assert.equal(fake.transactions(), 1);
});

test('the Firestore store refuses at the limit and writes nothing', async () => {
  const fake = fakeFirestore();
  fake.docs.set('global-2026-10-30', { count: 1, updatedAtMs: 1 });
  const store = firestoreCounterStore(fake.db);
  const result = await store.tryIncrement([
    { key: 'user-a-2026-10-30', limit: 5 },
    { key: 'global-2026-10-30', limit: 1 }
  ]);
  assert.deepEqual(result, { ok: false, key: 'global-2026-10-30' });
  assert.equal(fake.docs.has('user-a-2026-10-30'), false, 'the refused request charged nothing');
});

test('the Firestore store feeds the limiter end to end', async () => {
  const fake = fakeFirestore();
  const clock = { now: DAY1 };
  const l = limiter(2, 3, clock, firestoreCounterStore(fake.db, () => clock.now));
  assert.equal((await l.consume('alice')).allowed, true);
  assert.equal((await l.consume('alice')).allowed, true);
  assert.deepEqual(await l.consume('alice'), { allowed: false, scope: 'user' });
  assert.equal((await l.consume('bob')).allowed, true);
  assert.deepEqual(await l.consume('carol'), { allowed: false, scope: 'global' });
});

test('a storage failure propagates so the caller can fail closed', async () => {
  const broken: CounterStore = {
    async tryIncrement() {
      throw new Error('firestore unavailable');
    }
  };
  const l = createDailyLimiter({ store: broken });
  await assert.rejects(() => l.consume('alice'));
});

// --- Concurrency: a fake with optimistic transactions --------------------
//
// Real Firestore runs a transaction's function again if a document it read
// changed before commit, and gives up after a few attempts. This fake does
// the same, and yields between reads so concurrent transactions interleave.
// It is the property the store relies on: all reads happen before any write,
// the function has no side effects outside the transaction, and the check
// and the increment are committed together or retried.

function contendedFirestore(maxAttempts: number) {
  const docs = new Map<string, { data: { count: number; updatedAtMs: number } | undefined; version: number }>();
  let attempts = 0;
  const db: FirestoreLike = {
    collection: () => ({ doc: (id: string) => ({ id }) }),
    async runTransaction<T>(update: (transaction: FirestoreTransactionLike) => Promise<T>): Promise<T> {
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        attempts += 1;
        const readVersions = new Map<string, number>();
        const writes = new Map<string, { count: number; updatedAtMs: number }>();
        const transaction: FirestoreTransactionLike = {
          async get(ref) {
            // The value is captured when the read is issued; the yield lets
            // other transactions commit before this one finishes, which is
            // what makes the commit-time version check meaningful.
            const id = (ref as { id: string }).id;
            const doc = docs.get(id);
            readVersions.set(id, doc ? doc.version : 0);
            const value = doc ? doc.data : undefined;
            await new Promise((resolve) => setImmediate(resolve));
            return { data: () => value };
          },
          set(ref, data) {
            writes.set((ref as { id: string }).id, data as { count: number; updatedAtMs: number });
          }
        };
        const result = await update(transaction);
        let conflict = false;
        readVersions.forEach((version, id) => {
          const doc = docs.get(id);
          if ((doc ? doc.version : 0) !== version) {
            conflict = true;
          }
        });
        if (!conflict) {
          writes.forEach((data, id) => {
            const doc = docs.get(id);
            docs.set(id, { data, version: (doc ? doc.version : 0) + 1 });
          });
          return result;
        }
      }
      throw new Error('transaction aborted: too much contention');
    }
  };
  return { db, docs, attempts: () => attempts };
}

function counted(docs: Map<string, { data: { count: number } | undefined }>, key: string): number {
  const doc = docs.get(key);
  return doc && doc.data ? doc.data.count : 0;
}

test('concurrent requests never exceed the global cap (30 users racing for 7 slots)', async () => {
  const fake = contendedFirestore(100);
  const clock = { now: DAY1 };
  const l = limiter(1000, 7, clock, firestoreCounterStore(fake.db));
  const results = await Promise.all(Array.from({ length: 30 }, (_value, i) => l.consume('user-' + i)));

  const allowed = results.filter((r) => r.allowed).length;
  assert.equal(allowed, 7);
  assert.equal(counted(fake.docs, counterKeys('x', DAY1).global), 7, 'the counter equals the admissions');
  assert.ok(results.filter((r) => !r.allowed).every((r) => !r.allowed && r.scope === 'global'));
  assert.ok(fake.attempts() > 30, 'contention really caused retries');
});

test('concurrent requests from one user never exceed the per-user cap', async () => {
  const fake = contendedFirestore(100);
  const clock = { now: DAY1 };
  const l = limiter(3, 1000, clock, firestoreCounterStore(fake.db));
  const results = await Promise.all(Array.from({ length: 12 }, () => l.consume('alice')));
  assert.equal(results.filter((r) => r.allowed).length, 3);
  assert.equal(counted(fake.docs, counterKeys('alice', DAY1).user), 3);
  assert.equal(counted(fake.docs, counterKeys('alice', DAY1).global), 3, 'refused requests charged nothing');
});

test('when contention exhausts the retries the request errors, and the counter is still never over the cap', async () => {
  const fake = contendedFirestore(1);
  const clock = { now: DAY1 };
  const l = limiter(1000, 5, clock, firestoreCounterStore(fake.db));
  const settled = await Promise.allSettled(Array.from({ length: 20 }, (_value, i) => l.consume('user-' + i)));

  const admitted = settled.filter((r) => r.status === 'fulfilled' && r.value.allowed).length;
  const errored = settled.filter((r) => r.status === 'rejected').length;
  assert.ok(errored > 0, 'with one attempt, racing transactions abort');
  assert.ok(admitted <= 5);
  assert.equal(counted(fake.docs, counterKeys('x', DAY1).global), admitted, 'only committed admissions are counted');
});

test('the day rolls over under concurrency: yesterday\'s counters do not limit today', async () => {
  const fake = contendedFirestore(100);
  const clock = { now: DAY1 };
  const l = limiter(2, 2, clock, firestoreCounterStore(fake.db));
  const day1 = await Promise.all([l.consume('a'), l.consume('b'), l.consume('c')]);
  assert.equal(day1.filter((r) => r.allowed).length, 2);

  clock.now = DAY2;
  const day2 = await Promise.all([l.consume('a'), l.consume('b'), l.consume('c')]);
  assert.equal(day2.filter((r) => r.allowed).length, 2);
});

test('a failing read inside the transaction propagates, so the handler fails closed', async () => {
  const brokenDb: FirestoreLike = {
    collection: () => ({ doc: (id: string) => ({ id }) }),
    runTransaction: async (update) =>
      update({
        get: async () => {
          throw new Error('unavailable');
        },
        set: () => undefined
      })
  };
  const l = createDailyLimiter({ store: firestoreCounterStore(brokenDb) });
  await assert.rejects(() => l.consume('alice'), /unavailable/);
});
