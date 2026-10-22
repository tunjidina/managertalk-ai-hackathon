// Shared fixtures for the backend tests. Named *.test.ts so it is compiled
// with them; it registers one trivial test so the runner does not report it
// as empty.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { VerifyIdToken } from './auth';
import { TurnHttpRequest } from './handler';
import { TurnLogEntry } from './log';

export const VALID_TOKEN = 'header.payload.signature-fake-token';
export const SECRET_INPUT = 'In Tuesday\'s review you cut across Priya twice — SECRET-INPUT-MARKER.';

export function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    scenarioId: 'MT-S02',
    stage: 'sbi',
    managerInput: SECRET_INPUT,
    priorTurns: [],
    ...overrides
  };
}

export function priorTurn(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    stage: 'sbi',
    managerInput: 'Earlier manager line.',
    employeeLines: ['Which review do you mean?'],
    ...overrides
  };
}

export function httpRequest(overrides: Partial<TurnHttpRequest> = {}, body: unknown = validBody()): TurnHttpRequest {
  return {
    method: 'POST',
    contentType: 'application/json',
    authorization: 'Bearer ' + VALID_TOKEN,
    rawBody: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8'),
    ...overrides
  };
}

/** Accepts only VALID_TOKEN; records every token it was asked about. */
export function fakeVerifier(): VerifyIdToken & { calls: string[] } {
  const calls: string[] = [];
  const verify = (async (token: string) => {
    calls.push(token);
    if (token !== VALID_TOKEN) {
      throw new Error('auth/id-token-expired');
    }
    return { uid: 'user-123' };
  }) as VerifyIdToken & { calls: string[] };
  verify.calls = calls;
  return verify;
}

export function captureLog(): { entries: TurnLogEntry[]; log: (entry: TurnLogEntry) => void } {
  const entries: TurnLogEntry[] = [];
  return { entries, log: (entry) => entries.push(entry) };
}

test('fixtures build a well-formed request', () => {
  const request = httpRequest();
  assert.equal(request.method, 'POST');
  assert.ok(Buffer.isBuffer(request.rawBody));
});
