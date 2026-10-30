import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_MAX_TOKENS,
  MAX_PROMPT_CHARS,
  MAX_RETRY_AFTER_SECONDS,
  MAX_TOKENS_CEILING,
  ModelFailure,
  ModelFailureCode,
  NEBIUS_CHAT_COMPLETIONS_URL,
  NEMOTRON_NANO_MODEL_ID,
  NEMOTRON_SUPER_MODEL_ID,
  createNebiusModel
} from './nebiusModel';
import { TEST_KEY, completion, hangingFetch, jsonResponse, recordingFetch, samplePrompt } from './fetchSupport.test';

const GOOD = 'I answered the question as it was put to me.\n\nWhich part do you mean?';

function model(fetchImpl: typeof fetch, overrides: Record<string, unknown> = {}) {
  return createNebiusModel({ apiKey: TEST_KEY, model: NEMOTRON_NANO_MODEL_ID, fetchImpl, ...overrides });
}

async function failureOf(run: () => Promise<unknown>): Promise<ModelFailure> {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof ModelFailure, 'expected a ModelFailure');
    return error as ModelFailure;
  }
  assert.fail('expected the call to fail');
}

async function failsWith(fetchImpl: typeof fetch, code: ModelFailureCode, overrides: Record<string, unknown> = {}) {
  const failure = await failureOf(() => model(fetchImpl, overrides)(samplePrompt()));
  assert.equal(failure.code, code);
  assert.ok(!failure.message.includes(TEST_KEY), 'a failure never carries the key');
  assert.ok(!JSON.stringify(failure).includes(TEST_KEY));
  return failure;
}

test('the model ids match the project context', () => {
  assert.equal(NEMOTRON_NANO_MODEL_ID, 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B');
  assert.equal(NEMOTRON_SUPER_MODEL_ID, 'nvidia/nemotron-3-super-120b-a12b');
});

test('chatTemplateKwargs is sent when supplied, without overriding any other request field', async () => {
  const plain = recordingFetch(() => jsonResponse(completion(GOOD)));
  await model(plain)(samplePrompt());
  const withKwargs = recordingFetch(() => jsonResponse(completion(GOOD)));
  await model(withKwargs, { chatTemplateKwargs: { enable_thinking: false } })(samplePrompt());

  const { chat_template_kwargs: kwargs, ...rest } = withKwargs.calls[0].body;
  assert.deepEqual(kwargs, { enable_thinking: false });
  assert.deepEqual(rest, plain.calls[0].body);
  assert.ok(!('chat_template_kwargs' in plain.calls[0].body), 'omitted means absent from the body');
  assert.ok(!JSON.stringify(withKwargs.calls[0].body).includes(TEST_KEY));
});

test('sends exactly one fixed-URL request with the documented body', async () => {
  const fake = recordingFetch(() => jsonResponse(completion(GOOD)));
  const reply = await model(fake)(samplePrompt());

  assert.equal(fake.calls.length, 1);
  const call = fake.calls[0];
  assert.equal(call.url, NEBIUS_CHAT_COMPLETIONS_URL);
  assert.equal(call.url, 'https://api.tokenfactory.nebius.com/v1/chat/completions');
  assert.equal(call.init.method, 'POST');
  assert.deepEqual(Object.keys(call.body).sort(), ['max_tokens', 'messages', 'model', 'stream', 'temperature', 'top_p']);
  assert.equal(call.body.model, NEMOTRON_NANO_MODEL_ID);
  assert.equal(call.body.stream, false);
  assert.equal(call.body.max_tokens, DEFAULT_MAX_TOKENS);
  assert.deepEqual(call.body.messages, samplePrompt().messages);

  const headers = call.init.headers as Record<string, string>;
  assert.equal(headers.Authorization, 'Bearer ' + TEST_KEY);
  assert.equal(headers['Content-Type'], 'application/json');
  assert.ok(!JSON.stringify(call.body).includes(TEST_KEY), 'the key is in the header only');

  assert.equal(reply.model, NEMOTRON_NANO_MODEL_ID);
  assert.deepEqual(reply.lines, ['I answered the question as it was put to me.', 'Which part do you mean?']);
});

test('the style is chosen by rule from the manager message, never by the model', async () => {
  const fake = recordingFetch(() => jsonResponse(completion(GOOD)));
  const plain = await model(fake)(samplePrompt());
  assert.equal(plain.style, 'technical_detail');

  const outage = await model(fake)(
    samplePrompt({ messages: [{ role: 'system', content: 's' }, { role: 'user', content: 'The outage proves you shut people down.' }] })
  );
  assert.equal(outage.style, 'evidence_challenge');

  const closing = await model(fake)(
    samplePrompt({ stage: 'closing', messages: [{ role: 'system', content: 's' }, { role: 'user', content: 'Let us agree a date.' }] })
  );
  assert.equal(closing.style, 'procedural_compliance');
});

test('token usage is bounded: max_tokens is clamped to the ceiling and floor', async () => {
  const fake = recordingFetch(() => jsonResponse(completion(GOOD)));
  await model(fake, { maxTokens: 100000 })(samplePrompt());
  await model(fake, { maxTokens: 50 })(samplePrompt());
  assert.equal(fake.calls[0].body.max_tokens, MAX_TOKENS_CEILING);
  assert.equal(fake.calls[1].body.max_tokens, 50);
});

test('an oversized prompt is refused locally, before any request', async () => {
  const fake = recordingFetch(() => jsonResponse(completion(GOOD)));
  const huge = samplePrompt({ messages: [{ role: 'system', content: 'x'.repeat(MAX_PROMPT_CHARS + 1) }] });
  const failure = await failureOf(() => model(fake)(huge));
  assert.equal(failure.code, 'prompt_too_large');
  assert.equal(fake.calls.length, 0);
});

test('building the client without a key or model id throws instead of calling out', () => {
  const fake = recordingFetch(() => jsonResponse(completion(GOOD)));
  assert.throws(() => createNebiusModel({ apiKey: '', model: NEMOTRON_NANO_MODEL_ID, fetchImpl: fake }));
  assert.throws(() => createNebiusModel({ apiKey: TEST_KEY, model: '', fetchImpl: fake }));
  assert.equal(fake.calls.length, 0);
});

test('empty content fails as empty', async () => {
  await failsWith(recordingFetch(() => jsonResponse(completion(''))), 'empty');
  await failsWith(recordingFetch(() => jsonResponse(completion('   \n '))), 'empty');
});

test('null content with the text under a reasoning field fails and is never shown', async () => {
  const fake = recordingFetch(() => jsonResponse(completion(null, { reasoning: 'He is guarded, so I will say...' })));
  await failsWith(fake, 'empty');
  const fake2 = recordingFetch(() => jsonResponse(completion(undefined, { reasoning_content: 'thinking' })));
  await failsWith(fake2, 'empty');
});

test('a reply cut off by the token limit is refused', async () => {
  await failsWith(recordingFetch(() => jsonResponse(completion(GOOD, {}, { finish_reason: 'length' }))), 'truncated');
});

test('malformed output fails: invalid JSON, missing choices, wrong shapes', async () => {
  await failsWith(recordingFetch(() => jsonResponse('this is not json')), 'malformed');
  await failsWith(recordingFetch(() => jsonResponse({})), 'malformed');
  await failsWith(recordingFetch(() => jsonResponse({ choices: [] })), 'malformed');
  await failsWith(recordingFetch(() => jsonResponse({ choices: [{}] })), 'malformed');
  await failsWith(recordingFetch(() => jsonResponse({ choices: 'nope' })), 'malformed');
  await failsWith(recordingFetch(() => jsonResponse(null)), 'malformed');
});

test('non-text content fails as empty', async () => {
  await failsWith(recordingFetch(() => jsonResponse(completion({ text: 'x' }))), 'empty');
  await failsWith(recordingFetch(() => jsonResponse(completion(['a', 'b']))), 'empty');
});

test('replies that leak the prompt or raise forbidden topics are rejected', async () => {
  await failsWith(recordingFetch(() => jsonResponse(completion('My instructions say to stay composed.'))), 'rejected_reply');
  await failsWith(recordingFetch(() => jsonResponse(completion('Is this about the outage?'))), 'rejected_reply');
  await failsWith(recordingFetch(() => jsonResponse(completion('<think>unfinished'))), 'rejected_reply');
});

test('a hung request times out and aborts', async () => {
  const started = Date.now();
  await failsWith(hangingFetch(), 'timeout', { timeoutMs: 30 });
  assert.ok(Date.now() - started < 2000);
});

test('a body that stalls after the headers also times out', async () => {
  const stalled = (async (_input: unknown, init: RequestInit = {}) => {
    const signal = init.signal as AbortSignal;
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      text: () => new Promise<string>((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))
    } as unknown as Response;
  }) as typeof fetch;
  await failsWith(stalled, 'timeout', { timeoutMs: 30 });
});

test('a network error is reported as unavailable', async () => {
  const failing = (async () => {
    throw new TypeError('fetch failed: ' + TEST_KEY);
  }) as typeof fetch;
  await failsWith(failing, 'unavailable');
});

test('rate limiting: 429 maps to rate_limited and keeps a bounded Retry-After', async () => {
  const withHeader = await failsWith(recordingFetch(() => jsonResponse({ error: 'slow down' }, 429, { 'retry-after': '7' })), 'rate_limited');
  assert.equal(withHeader.retryAfterSeconds, 7);

  const capped = await failsWith(recordingFetch(() => jsonResponse({}, 429, { 'retry-after': '99999' })), 'rate_limited');
  assert.equal(capped.retryAfterSeconds, MAX_RETRY_AFTER_SECONDS);

  const missing = await failsWith(recordingFetch(() => jsonResponse({}, 429)), 'rate_limited');
  assert.equal(missing.retryAfterSeconds, undefined);

  const junk = await failsWith(recordingFetch(() => jsonResponse({}, 429, { 'retry-after': 'tomorrow' })), 'rate_limited');
  assert.equal(junk.retryAfterSeconds, undefined);
});

test('server errors map to unavailable and the upstream body is never echoed', async () => {
  for (const status of [500, 502, 503, 504, 418]) {
    const failure = await failsWith(recordingFetch(() => jsonResponse({ error: 'UPSTREAM-SECRET-BODY ' + TEST_KEY }, status)), 'unavailable');
    assert.ok(!failure.message.includes('UPSTREAM-SECRET-BODY'));
  }
});

test('rejected credentials map to upstream_auth without exposing anything', async () => {
  await failsWith(recordingFetch(() => jsonResponse({ error: 'bad key' }, 401)), 'upstream_auth');
  await failsWith(recordingFetch(() => jsonResponse({ error: 'forbidden' }, 403)), 'upstream_auth');
});

test('an oversized upstream body is treated as malformed', async () => {
  await failsWith(recordingFetch(() => jsonResponse('x'.repeat(200_001))), 'malformed');
});

test('an API key with a trailing newline is trimmed before use', async () => {
  const fake = recordingFetch(() => jsonResponse(completion(GOOD)));
  await createNebiusModel({ apiKey: TEST_KEY + '\n', model: NEMOTRON_NANO_MODEL_ID, fetchImpl: fake })(samplePrompt());
  assert.equal((fake.calls[0].init.headers as Record<string, string>).Authorization, 'Bearer ' + TEST_KEY);
});

test('a key containing whitespace or control characters is refused when building the client', () => {
  const fake = recordingFetch(() => jsonResponse(completion(GOOD)));
  for (const apiKey of ['two parts', 'tab\tkey', 'new\nline-inside', '   ', 'bell\u0007']) {
    assert.throws(() => createNebiusModel({ apiKey, model: NEMOTRON_NANO_MODEL_ID, fetchImpl: fake }), /valid Nebius API key/);
  }
  assert.equal(fake.calls.length, 0);
});

test('a thrown build error never contains the key', () => {
  const fake = recordingFetch(() => jsonResponse(completion(GOOD)));
  try {
    createNebiusModel({ apiKey: TEST_KEY + ' extra', model: NEMOTRON_NANO_MODEL_ID, fetchImpl: fake });
    assert.fail('expected a throw');
  } catch (error) {
    assert.ok(!String((error as Error).message).includes(TEST_KEY));
  }
});

test('redirects are refused so the key can never be sent elsewhere', async () => {
  const fake = recordingFetch(() => jsonResponse(completion(GOOD)));
  await model(fake)(samplePrompt());
  // 'manual', not 'error': the Cloudflare Workers runtime throws on redirect: 'error'.
  assert.equal(fake.calls[0].init.redirect, 'manual');

  // Workers hand back the 3xx itself; it is never followed and fails as unavailable.
  const workerRedirect = recordingFetch(() => jsonResponse('', 302, { location: 'https://elsewhere.example/v1' }));
  await failsWith(workerRedirect, 'unavailable');
  assert.equal(workerRedirect.calls.length, 1, 'the redirect target is never requested');

  // Node returns an opaque redirect (status 0, not ok) for the same case.
  await failsWith((async () => Response.error()) as typeof fetch, 'unavailable');

  const thrown = (async () => {
    throw new TypeError('network failure');
  }) as typeof fetch;
  await failsWith(thrown, 'unavailable');
});

test('fetch is called as a plain function, as the Cloudflare runtime requires', async () => {
  // workerd throws this TypeError when fetch runs with an object as `this`.
  const strictFetch = async function (this: unknown) {
    if (this !== undefined && this !== globalThis) {
      throw new TypeError('Illegal invocation: function called with incorrect `this` reference.');
    }
    return jsonResponse(completion(GOOD));
  } as typeof fetch;
  const reply = await model(strictFetch)(samplePrompt());
  assert.ok(reply.lines.length > 0);
});

test('upstream HTTP failures carry only http_<status> as diagnostic detail', async () => {
  const cases: Array<[number, ModelFailureCode]> = [
    [400, 'unavailable'],
    [404, 'unavailable'],
    [422, 'unavailable'],
    [500, 'unavailable'],
    [302, 'unavailable'],
    [401, 'upstream_auth'],
    [403, 'upstream_auth'],
    [429, 'rate_limited']
  ];
  for (const [status, code] of cases) {
    const body = { error: { message: 'upstream secret detail ' + TEST_KEY } };
    const failure = await failsWith(recordingFetch(() => jsonResponse(body, status)), code);
    assert.equal(failure.upstream, 'http_' + status);
    assert.ok(!JSON.stringify(failure).includes('upstream secret detail'), 'the upstream body is never carried');
  }
});

test('a thrown fetch carries only fetch_<ErrorName>, never the exception message', async () => {
  const secretMessage = 'connect failed to host with ' + TEST_KEY;
  const typeError = await failsWith((async () => { throw new TypeError(secretMessage); }) as typeof fetch, 'unavailable');
  assert.equal(typeError.upstream, 'fetch_TypeError');
  assert.ok(!JSON.stringify(typeError).includes('connect failed'));

  const oddName = new Error(secretMessage);
  oddName.name = 'Bad Name <script>';
  const odd = await failsWith((async () => { throw oddName; }) as typeof fetch, 'unavailable');
  assert.equal(odd.upstream, 'fetch_unknown');

  const notAnError = await failsWith((async () => { throw secretMessage; }) as typeof fetch, 'unavailable');
  assert.equal(notAnError.upstream, 'fetch_unknown');
});

test('a rejected reply carries its rejection code as reason, never the reply text', async () => {
  const truncated = await failsWith(recordingFetch(() => jsonResponse(completion(GOOD, {}, { finish_reason: 'length' }))), 'truncated');
  assert.equal(truncated.reason, 'truncated');
  assert.equal(truncated.upstream, undefined);

  const cases: Array<[string, string]> = [
    ['I think the user wants a different answer here.', 'leak'],
    ['That outage was not something I caused.', 'forbidden_topic'],
    ['I was going to explain that the build', 'unfinished']
  ];
  for (const [text, reason] of cases) {
    const failure = await failsWith(recordingFetch(() => jsonResponse(completion(text))), 'rejected_reply');
    assert.equal(failure.reason, reason);
    assert.ok(!JSON.stringify(failure).includes(text.slice(0, 20)), 'the reply text is never carried');
  }
});

test('timeouts and reply-level failures carry no upstream detail', async () => {
  const timedOut = await failsWith(hangingFetch(), 'timeout', { timeoutMs: 30 });
  assert.equal(timedOut.upstream, undefined);
  const malformed = await failsWith(recordingFetch(() => jsonResponse('not json at all', 200)), 'malformed');
  assert.equal(malformed.upstream, undefined);
});

test('a reply that hit the token limit is refused even when the provider omits finish_reason', async () => {
  const noReason = completion(GOOD, {}, { finish_reason: undefined });
  noReason.usage = { prompt_tokens: 100, completion_tokens: DEFAULT_MAX_TOKENS };
  await failsWith(recordingFetch(() => jsonResponse(noReason)), 'truncated');

  const under = completion(GOOD);
  under.usage = { prompt_tokens: 100, completion_tokens: DEFAULT_MAX_TOKENS - 1 };
  const reply = await model(recordingFetch(() => jsonResponse(under)))(samplePrompt());
  assert.equal(reply.lines.length, 2);
});

test('a reply that stops mid-sentence is refused as a rejected reply', async () => {
  await failsWith(recordingFetch(() => jsonResponse(completion('I answered the question as it was put to'))), 'rejected_reply');
});

test('the reply is labelled with the model the provider reports, not only the one requested', async () => {
  const served = { ...completion(GOOD), model: 'nvidia/some-other-model' };
  const reply = await model(recordingFetch(() => jsonResponse(served)))(samplePrompt());
  assert.equal(reply.model, 'nvidia/some-other-model');

  const unlabelled = await model(recordingFetch(() => jsonResponse(completion(GOOD))))(samplePrompt());
  assert.equal(unlabelled.model, NEMOTRON_NANO_MODEL_ID);

  const absurd = { ...completion(GOOD), model: 'x'.repeat(500) };
  const fallback = await model(recordingFetch(() => jsonResponse(absurd)))(samplePrompt());
  assert.equal(fallback.model, NEMOTRON_NANO_MODEL_ID);
});
