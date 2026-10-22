// Fake-fetch helpers for the live-model tests. No test here can reach the
// network: every call goes to a function the test supplies.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TrustedPrompt } from './prompts';

export const TEST_KEY = 'test-key-DO-NOT-LEAK-1234567890';

export interface RecordedCall {
  url: string;
  init: RequestInit;
  body: Record<string, unknown>;
}

export function completion(content: unknown, extra: Record<string, unknown> = {}, choice: Record<string, unknown> = {}) {
  return {
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content, ...extra }, ...choice }],
    usage: { prompt_tokens: 100, completion_tokens: 40 }
  };
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  });
}

/** A fetch that records every call and answers with the supplied responder. */
export function recordingFetch(
  responder: (call: RecordedCall) => Response | Promise<Response>
): typeof fetch & { calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const impl = (async (input: unknown, init: RequestInit = {}) => {
    const call: RecordedCall = {
      url: String(input),
      init,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : {}
    };
    calls.push(call);
    return responder(call);
  }) as typeof fetch & { calls: RecordedCall[] };
  impl.calls = calls;
  return impl;
}

/** A fetch that never answers until the request is aborted, like a hung connection. */
export function hangingFetch(): typeof fetch {
  return ((_input: unknown, init: RequestInit = {}) =>
    new Promise((_resolve, reject) => {
      const signal = init.signal as AbortSignal | undefined;
      if (signal) {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      }
    })) as typeof fetch;
}

export function samplePrompt(overrides: Partial<TrustedPrompt> = {}): TrustedPrompt {
  return {
    scenarioId: 'MT-S02',
    stage: 'exploration',
    messages: [
      { role: 'system', content: 'SYSTEM TEXT' },
      { role: 'user', content: 'What did you understand Aoife to be asking?' }
    ],
    ...overrides
  };
}

test('fetch helpers answer from the supplied function and record calls', async () => {
  const fake = recordingFetch(() => jsonResponse(completion('hi')));
  const response = await fake('https://example.test/', { method: 'POST', body: JSON.stringify({ a: 1 }) });
  assert.equal(response.status, 200);
  assert.deepEqual(fake.calls[0].body, { a: 1 });
});
