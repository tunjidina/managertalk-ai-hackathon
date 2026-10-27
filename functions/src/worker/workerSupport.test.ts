// Fixtures for the Worker tests: real RSA keys signed with jose, a real
// SQLite database (node:sqlite) behind the Durable Object's SQL API, and a
// fake namespace that talks to the real DailyLimiter class. No network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import type { JWTVerifyGetKey } from 'jose';

import { DailyLimiter, DurableObjectNamespaceLike, DurableObjectStateLike } from './dailyLimiter';

export const PROJECT_ID = 'demo-project-test';
export const KID = 'test-key-1';

export interface TestKeys {
  keySet: JWTVerifyGetKey;
  mint(claims?: Record<string, unknown>, options?: MintOptions): Promise<string>;
}

export interface MintOptions {
  /** Sign with a different key pair than the published one. */
  forged?: boolean;
  kid?: string;
  /** Omit these standard claims. */
  omit?: string[];
  expiresInSeconds?: number;
}

export async function makeKeys(now: () => number = Date.now): Promise<TestKeys> {
  const good = await generateKeyPair('RS256');
  const other = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(good.publicKey)), kid: KID, alg: 'RS256', use: 'sig' };
  const keySet = createLocalJWKSet({ keys: [jwk] });

  return {
    keySet,
    async mint(claims = {}, options = {}) {
      const nowSeconds = Math.floor(now() / 1000);
      const payload: Record<string, unknown> = {
        iss: 'https://securetoken.google.com/' + PROJECT_ID,
        aud: PROJECT_ID,
        sub: 'user-abc',
        iat: nowSeconds - 30,
        exp: nowSeconds + (options.expiresInSeconds ?? 3600),
        auth_time: nowSeconds - 60,
        ...claims
      };
      for (const name of options.omit || []) {
        delete payload[name];
      }
      for (const name of Object.keys(payload)) {
        if (payload[name] === undefined) {
          delete payload[name];
        }
      }
      return new SignJWT(payload)
        .setProtectedHeader({ alg: 'RS256', kid: options.kid || KID })
        .sign(options.forged ? other.privateKey : good.privateKey);
    }
  };
}

/** A Durable Object state backed by a real in-memory SQLite database. */
export function sqliteState(options: { failOnInsert?: boolean } = {}): DurableObjectStateLike & { db: DatabaseSync } {
  const db = new DatabaseSync(':memory:');
  const exec = (query: string, ...bindings: unknown[]) => {
    if (options.failOnInsert && /^\s*INSERT/i.test(query)) {
      throw new Error('storage failure');
    }
    const statement = db.prepare(query);
    const values = bindings as Array<string | number>;
    if (/^\s*SELECT/i.test(query)) {
      return { toArray: () => statement.all(...values) as Array<Record<string, unknown>> };
    }
    statement.run(...values);
    return { toArray: () => [] as Array<Record<string, unknown>> };
  };
  return {
    db,
    storage: {
      sql: { exec },
      transactionSync<T>(closure: () => T): T {
        db.exec('BEGIN');
        try {
          const result = closure();
          db.exec('COMMIT');
          return result;
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      }
    }
  };
}

/** A namespace whose single object is a real DailyLimiter over SQLite. */
export function limiterNamespace(state = sqliteState()): DurableObjectNamespaceLike & { state: ReturnType<typeof sqliteState> } {
  const object = new DailyLimiter(state);
  return {
    state,
    idFromName: (name: string) => name,
    get: () => ({ fetch: (request: Request) => object.fetch(request) })
  };
}

test('worker fixtures sign and publish keys', async () => {
  const keys = await makeKeys();
  assert.equal(typeof (await keys.mint()), 'string');
  assert.equal(typeof keys.keySet, 'function');
});
