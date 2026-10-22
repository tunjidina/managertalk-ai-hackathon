// functions/src/rateLimit.ts
//
// Daily usage caps for the live model: one per signed-in user and one for
// the whole service, so a single account or a burst of new accounts cannot
// run up model spend. The check and the increment are one atomic step, and
// both caps are charged together or not at all, so a request refused by one
// cap never uses up the other.
//
// The logic is storage-agnostic. Tests use memoryCounterStore(); the
// deployed function uses firestoreCounterStore() with the Admin SDK, which
// bypasses Firestore security rules, so no client-facing rule is needed
// (and the default rules deny clients access to this collection).

export interface CounterRequest {
  key: string;
  /** The count may not exceed this after the increment. */
  limit: number;
}

export type CounterResult = { ok: true } | { ok: false; key: string };

export interface CounterStore {
  /** Atomically increments every counter, or none of them if any is at its limit. */
  tryIncrement(requests: CounterRequest[]): Promise<CounterResult>;
}

export interface DailyLimits {
  perUser: number;
  global: number;
}

export type QuotaDecision = { allowed: true } | { allowed: false; scope: 'user' | 'global' };

export interface DailyLimiter {
  consume(uid: string): Promise<QuotaDecision>;
}

export const DEFAULT_LIMITS: DailyLimits = { perUser: 40, global: 300 };

/** UTC calendar day, so every instance agrees on when the counters reset. */
export function dayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function checkLimit(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(name + ' must be a non-negative integer');
  }
}

export function counterKeys(uid: string, nowMs: number): { user: string; global: string } {
  const day = dayKey(nowMs);
  return { user: 'user-' + encodeURIComponent(uid) + '-' + day, global: 'global-' + day };
}

export function createDailyLimiter(options: {
  store: CounterStore;
  limits?: DailyLimits;
  now?: () => number;
}): DailyLimiter {
  const limits = options.limits || DEFAULT_LIMITS;
  checkLimit('perUser limit', limits.perUser);
  checkLimit('global limit', limits.global);
  const now = options.now || Date.now;

  return {
    async consume(uid) {
      if (typeof uid !== 'string' || uid.length === 0) {
        return { allowed: false, scope: 'user' };
      }
      const keys = counterKeys(uid, now());
      const result = await options.store.tryIncrement([
        { key: keys.user, limit: limits.perUser },
        { key: keys.global, limit: limits.global }
      ]);
      if (result.ok) {
        return { allowed: true };
      }
      return { allowed: false, scope: result.key === keys.global ? 'global' : 'user' };
    }
  };
}

/** In-process store for tests and local runs. Not shared between instances. */
export function memoryCounterStore(): CounterStore & { counts: Map<string, number> } {
  const counts = new Map<string, number>();
  return {
    counts,
    async tryIncrement(requests) {
      for (const request of requests) {
        if ((counts.get(request.key) || 0) >= request.limit) {
          return { ok: false, key: request.key };
        }
      }
      for (const request of requests) {
        counts.set(request.key, (counts.get(request.key) || 0) + 1);
      }
      return { ok: true };
    }
  };
}

// The slice of the Admin SDK's Firestore this module needs, so it can be
// tested without a Firebase project.
export interface FirestoreTransactionLike {
  get(ref: unknown): Promise<{ data(): { count?: unknown } | undefined }>;
  set(ref: unknown, data: Record<string, unknown>): unknown;
}

export interface FirestoreLike {
  collection(name: string): { doc(id: string): unknown };
  runTransaction<T>(update: (transaction: FirestoreTransactionLike) => Promise<T>): Promise<T>;
}

export const USAGE_COLLECTION = 'usageCounters';

export function firestoreCounterStore(
  db: FirestoreLike,
  now: () => number = Date.now
): CounterStore {
  return {
    tryIncrement(requests) {
      return db.runTransaction(async (transaction): Promise<CounterResult> => {
        const refs = requests.map((request) => db.collection(USAGE_COLLECTION).doc(request.key));

        // All reads first: a transaction may not read after it has written.
        const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
        const counts = snapshots.map((snapshot) => {
          const data = snapshot.data();
          return data && typeof data.count === 'number' ? data.count : 0;
        });

        for (let i = 0; i < requests.length; i += 1) {
          if (counts[i] >= requests[i].limit) {
            return { ok: false, key: requests[i].key };
          }
        }

        for (let i = 0; i < requests.length; i += 1) {
          transaction.set(refs[i], { count: counts[i] + 1, updatedAtMs: now() });
        }
        return { ok: true };
      });
    }
  };
}
