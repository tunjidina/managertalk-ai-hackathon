// functions/src/worker/app.ts
//
// The Cloudflare Worker's logic: serves the built React app and POST /api/s02/turn
// from one origin, so the browser needs no CORS and the client is unchanged.
// The turn logic is the same handleTurn the Firebase function uses; only the
// edges differ (Firebase ID-token check via jose, daily counters in a
// Durable Object, logs to console as the allow-listed entry only).
//
// Mock mode is the default and needs no key and no network. Live mode needs
// S02_ENGINE_MODE=live and the NEBIUS_API_KEY secret; the key is read here
// and passed to nothing but the live model client. It is never logged or
// returned.
//
// This file is not the Worker's entry point. The runtime treats EVERY export of
// the entry module as a handler or Durable Object class, so helpers such as
// createWorker and parseCap live here, where tests can import them, and
// index.ts exports only the default handler and the Durable Object class.

import type { JWTVerifyGetKey } from 'jose';

import { handleTurn, internalErrorResponse, MAX_BODY_BYTES } from '../handler';
import { selectEngine } from '../liveConfig';
import { TurnLogEntry } from '../log';
import { createFirebaseVerifier, googleKeySet } from './firebaseToken';
import {
  DurableObjectNamespaceLike,
  MAX_DAILY_CAP,
  durableCounterStore,
  hashingLimiter
} from './dailyLimiter';

export const TURN_PATH = '/api/s02/turn';

export interface WorkerEnv {
  S02_ENGINE_MODE?: string;
  NEBIUS_API_KEY?: string;
  NEBIUS_MODEL?: string;
  S02_USER_DAILY_CAP?: string;
  S02_GLOBAL_DAILY_CAP?: string;
  FIREBASE_PROJECT_ID?: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
  LIMITER?: DurableObjectNamespaceLike;
}

export interface WorkerOptions {
  keySet?: JWTVerifyGetKey;
  fetchImpl?: typeof fetch;
  now?: () => number;
  log?: (entry: TurnLogEntry) => void;
}

/**
 * A cap from an environment string. Plain digits up to MAX_DAILY_CAP are
 * accepted; anything else is NaN, which refuses live mode (the mock answers)
 * instead of running with a cap the limiter would reject on every request.
 */
export function parseCap(value: string | undefined): number | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  if (!/^\d{1,7}$/.test(value)) {
    return Number.NaN;
  }
  const cap = Number(value);
  return cap <= MAX_DAILY_CAP ? cap : Number.NaN;
}

/** Reads at most MAX_BODY_BYTES + 1 bytes, so an oversized body is never held in full. */
async function readBodyBounded(request: Request): Promise<Uint8Array> {
  const limit = MAX_BODY_BYTES + 1;
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return new Uint8Array(limit);
  }
  if (!request.body) {
    return new Uint8Array(0);
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    total += value.length;
    if (total >= limit) {
      await reader.cancel();
      break;
    }
  }
  const body = new Uint8Array(Math.min(total, limit));
  let offset = 0;
  for (const chunk of chunks) {
    const room = body.length - offset;
    if (room <= 0) {
      break;
    }
    body.set(chunk.length > room ? chunk.subarray(0, room) : chunk, offset);
    offset += Math.min(chunk.length, room);
  }
  return body;
}

export function createWorker(options: WorkerOptions = {}) {
  let sharedKeySet: JWTVerifyGetKey | undefined;
  const keySet = (): JWTVerifyGetKey => {
    if (options.keySet) {
      return options.keySet;
    }
    sharedKeySet = sharedKeySet || googleKeySet();
    return sharedKeySet;
  };
  const log =
    options.log ||
    ((entry: TurnLogEntry) => {
      console.log(JSON.stringify({ event: 's02Turn', ...entry }));
    });

  async function runTurn(request: Request, env: WorkerEnv): Promise<Response> {
    const engine = selectEngine(
      {
        mode: env.S02_ENGINE_MODE,
        apiKey: env.NEBIUS_API_KEY,
        model: env.NEBIUS_MODEL,
        userDailyCap: parseCap(env.S02_USER_DAILY_CAP),
        globalDailyCap: parseCap(env.S02_GLOBAL_DAILY_CAP)
      },
      {
        fetchImpl: options.fetchImpl || fetch,
        now: options.now,
        counterStore: () => {
          if (!env.LIMITER) {
            throw new Error('No limiter binding');
          }
          return durableCounterStore(env.LIMITER, options.now);
        }
      }
    );

    const rawBody = request.method === 'POST' ? await readBodyBounded(request) : undefined;

    const response = await handleTurn(
      {
        method: request.method,
        contentType: request.headers.get('content-type') || undefined,
        authorization: request.headers.get('authorization') || undefined,
        rawBody
      },
      {
        verifyIdToken: createFirebaseVerifier({
          projectId: env.FIREBASE_PROJECT_ID,
          keySet: keySet(),
          now: options.now
        }),
        model: engine.model,
        mode: engine.mode,
        limiter: engine.limiter && hashingLimiter(engine.limiter),
        now: options.now,
        log
      }
    );

    return new Response(JSON.stringify(response.body), {
      status: response.status,
      headers: response.headers
    });
  }

  /**
   * Anything that throws outside handleTurn (reading the body, choosing the
   * engine, building the verifier) becomes the application's generic JSON 500.
   * The error is not echoed and not logged: only its occurrence is.
   */
  async function turn(request: Request, env: WorkerEnv): Promise<Response> {
    const now = options.now || Date.now;
    const started = now();
    try {
      return await runTurn(request, env);
    } catch (error) {
      try {
        log({ route: TURN_PATH, mode: 'mock', status: 500, outcome: 'worker_error', latencyMs: now() - started });
      } catch (logError) {
        // A failing logger must not turn the generic response into an unhandled error.
      }
      const response = internalErrorResponse();
      return new Response(JSON.stringify(response.body), { status: response.status, headers: response.headers });
    }
  }

  return {
    async fetch(request: Request, env: WorkerEnv): Promise<Response> {
      const url = new URL(request.url);

      if (url.pathname === TURN_PATH) {
        return turn(request, env);
      }
      // Anything else under /api is not a static file and not ours to guess.
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
      }
      return env.ASSETS.fetch(request);
    }
  };
}
