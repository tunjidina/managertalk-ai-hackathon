// functions/src/worker/dailyLimiter.ts
//
// The Worker's daily counters: one SQLite-backed Durable Object that applies
// the same all-or-nothing increment as the Firestore store (../rateLimit.ts),
// so the per-user and global caps cannot be partly charged. The check and the
// writes run in one synchronous section (inside transactionSync when the
// platform offers it), and a Durable Object handles one request at a time, so
// concurrent requests cannot both pass the same limit.
//
// Only the Worker's binding can reach the object; it is not a public route.
// The object still validates its input.
//
// The state and namespace types below are minimal local shapes, so no
// platform type package is needed. Their behaviour on the real platform is
// unverified until deployed.

import { CounterRequest, CounterResult, CounterStore, DailyLimiter as DailyLimiterLike, dayKey } from '../rateLimit';

interface SqlCursorLike {
  toArray(): Array<Record<string, unknown>>;
}

export interface DurableObjectStateLike {
  storage: {
    sql: { exec(query: string, ...bindings: unknown[]): SqlCursorLike };
    transactionSync?<T>(closure: () => T): T;
  };
}

export interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}

/** The largest daily cap the limiter accepts. Configuration is checked against the same number. */
export const MAX_DAILY_CAP = 1_000_000;

const MAX_REQUESTS = 4;
const MAX_KEY_CHARS = 200;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const OBJECT_NAME = 'daily-limiter';
const INTERNAL_URL = 'https://limiter.internal/increment';

interface IncrementInput {
  day: string;
  requests: CounterRequest[];
}

function parseInput(value: unknown): IncrementInput | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const { day, requests } = value as { day?: unknown; requests?: unknown };
  if (typeof day !== 'string' || !DAY_PATTERN.test(day)) {
    return null;
  }
  if (!Array.isArray(requests) || requests.length === 0 || requests.length > MAX_REQUESTS) {
    return null;
  }
  const parsed: CounterRequest[] = [];
  for (const item of requests) {
    if (typeof item !== 'object' || item === null) {
      return null;
    }
    const { key, limit } = item as { key?: unknown; limit?: unknown };
    if (
      typeof key !== 'string' ||
      key.length === 0 ||
      key.length > MAX_KEY_CHARS ||
      typeof limit !== 'number' ||
      !Number.isInteger(limit) ||
      limit < 0 ||
      limit > MAX_DAILY_CAP
    ) {
      return null;
    }
    parsed.push({ key, limit });
  }
  return { day, requests: parsed };
}

export class DailyLimiter {
  private readonly state: DurableObjectStateLike;

  constructor(state: DurableObjectStateLike, _env?: unknown) {
    this.state = state;
    state.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY, count INTEGER NOT NULL, day TEXT NOT NULL)'
    );
  }

  /** Synchronous on purpose: no await between the checks and the writes. */
  tryIncrement(input: IncrementInput): CounterResult {
    const sql = this.state.storage.sql;

    const run = (): CounterResult => {
      // Yesterday's counters are no longer needed; keep storage bounded.
      sql.exec('DELETE FROM counters WHERE day <> ?', input.day);

      for (const request of input.requests) {
        const rows = sql.exec('SELECT count FROM counters WHERE key = ?', request.key).toArray();
        const count = rows.length > 0 ? Number(rows[0].count) : 0;
        if (!(count < request.limit)) {
          return { ok: false, key: request.key };
        }
      }
      for (const request of input.requests) {
        sql.exec(
          'INSERT INTO counters (key, count, day) VALUES (?, 1, ?) ' +
            'ON CONFLICT(key) DO UPDATE SET count = count + 1',
          request.key,
          input.day
        );
      }
      return { ok: true };
    };

    const transaction = this.state.storage.transactionSync;
    return transaction ? (transaction.call(this.state.storage, run) as CounterResult) : run();
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }
    let input: IncrementInput | null = null;
    try {
      input = parseInput(await request.json());
    } catch (error) {
      input = null;
    }
    if (!input) {
      return new Response('Bad request', { status: 400 });
    }
    const result = this.tryIncrement(input);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/** The CounterStore the Worker passes to the daily limiter. Fails closed. */
export function durableCounterStore(
  namespace: DurableObjectNamespaceLike,
  now: () => number = Date.now
): CounterStore {
  return {
    async tryIncrement(requests) {
      const stub = namespace.get(namespace.idFromName(OBJECT_NAME));
      const response = await stub.fetch(
        new Request(INTERNAL_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ day: dayKey(now()), requests })
        })
      );
      if (!response.ok) {
        throw new Error('limiter unavailable');
      }
      const body = (await response.json()) as { ok?: unknown; key?: unknown };
      if (body.ok === true) {
        return { ok: true };
      }
      if (body.ok === false && typeof body.key === 'string') {
        return { ok: false, key: body.key };
      }
      throw new Error('limiter returned an unexpected reply');
    }
  };
}

/**
 * A stable, bounded stand-in for a user id: 64 hex characters of SHA-256.
 * Counter keys then have a fixed length however long or unusual the id is,
 * and the id itself is never written to storage.
 */
export async function hashUid(uid: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(uid));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Wraps a limiter so it counts per hashed id. An id that is not a non-empty
 * string is passed through unchanged, so the inner limiter still refuses it
 * rather than a hash of it being allowed.
 */
export function hashingLimiter(inner: DailyLimiterLike): DailyLimiterLike {
  return {
    async consume(uid) {
      if (typeof uid !== 'string' || uid.length === 0) {
        return inner.consume(uid);
      }
      return inner.consume(await hashUid(uid));
    }
  };
}
