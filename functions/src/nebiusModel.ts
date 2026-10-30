// functions/src/nebiusModel.ts
//
// The live model client: one chat completion against Nebius Token Factory.
//
// LIVE MODE IS OFF BY DEFAULT. Nothing in this file runs unless index.ts
// builds it, which it does only when S02_ENGINE_MODE is "live" and the
// NEBIUS_API_KEY secret is present. A test must pass its own fetch; there is
// no default network path that tests could reach by accident.
//
// What is fixed here, and why:
//   - The URL is a constant. No request field can redirect the call, so the
//     bearer key can only ever go to Token Factory.
//   - The body carries exactly model, messages, max_tokens, temperature,
//     top_p and stream:false. Reasoning toggles are not sent: whether the
//     platform honours them is unverified (see scripts/smoke-live.mjs).
//   - Token usage is bounded: max_tokens is clamped to a ceiling, and an
//     oversized prompt is refused locally before any request.
//   - A reply is used only if choices[0].message.content is non-empty text
//     that passes replyValidation. Reasoning fields are never read.
//   - The key never appears in an error, a log entry or a reply. Upstream
//     response bodies are never echoed.

import { MAX_MODEL_ID_CHARS_FOR_REPLY } from './limits';
import { ModelClient } from './mockModel';
import { TrustedPrompt } from './prompts';
import { parseModelText } from './replyValidation';
import { chooseStyle } from './shared/engine/s02/styleSelection';

export const NEBIUS_CHAT_COMPLETIONS_URL =
  'https://api.tokenfactory.nebius.com/v1/chat/completions';

/**
 * Model identifiers as recorded in the project's tests and the Nebius
 * catalogue research. NOT verified against the live model list: Nebius pages
 * disagree on the casing of the Nano ID. The smoke script checks them
 * against GET /v1/models before any product run.
 */
export const NEMOTRON_NANO_MODEL_ID = 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B';
export const NEMOTRON_SUPER_MODEL_ID = 'nvidia/nemotron-3-super-120b-a12b';

export const DEFAULT_TIMEOUT_MS = 12_000;
export const DEFAULT_MAX_TOKENS = 600;
/** Hard ceiling on completion tokens, whatever a caller configures. */
export const MAX_TOKENS_CEILING = 1024;
export const DEFAULT_TEMPERATURE = 0.8;
export const DEFAULT_TOP_P = 0.95;
/** A prompt larger than this is refused locally; the request validator already bounds it far below. */
export const MAX_PROMPT_CHARS = 200_000;
/** An upstream body larger than this is treated as malformed. */
export const MAX_RESPONSE_CHARS = 200_000;
/** Longest Retry-After, in seconds, passed back to the client. */
export const MAX_RETRY_AFTER_SECONDS = 300;

export type ModelFailureCode =
  | 'timeout'
  | 'rate_limited'
  | 'unavailable'
  | 'upstream_auth'
  | 'malformed'
  | 'empty'
  | 'truncated'
  | 'rejected_reply'
  | 'prompt_too_large';

/**
 * A failure with a code and nothing else: no upstream body, no key, no headers.
 * `upstream` is only ever http_<status> or fetch_<ErrorName>, and `reason` a
 * rejection code (never reply text), both for the log only.
 */
export class ModelFailure extends Error {
  readonly code: ModelFailureCode;
  readonly retryAfterSeconds?: number;
  readonly upstream?: string;
  readonly reason?: string;

  constructor(code: ModelFailureCode, retryAfterSeconds?: number, upstream?: string, reason?: string) {
    super('model_failure:' + code);
    this.name = 'ModelFailure';
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
    this.upstream = upstream;
    this.reason = reason;
  }
}

function httpTag(status: number): string {
  return Number.isInteger(status) && status >= 0 && status <= 999 ? 'http_' + status : 'http_0';
}

/** The thrown value's type name only; its message is never read. */
function fetchErrorTag(error: unknown): string {
  const name = error instanceof Error ? error.name : undefined;
  return typeof name === 'string' && /^[A-Za-z]{1,40}$/.test(name) ? 'fetch_' + name : 'fetch_unknown';
}

export interface NebiusConfig {
  apiKey: string;
  model: string;
  fetchImpl: typeof fetch;
  timeoutMs?: number;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  /** Sent as `chat_template_kwargs` only when supplied (e.g. { enable_thinking: false } for Nano). */
  chatTemplateKwargs?: Record<string, unknown>;
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return undefined;
  }
  return Math.min(Math.ceil(seconds), MAX_RETRY_AFTER_SECONDS);
}

function promptChars(prompt: TrustedPrompt): number {
  return prompt.messages.reduce((total, message) => total + message.content.length, 0);
}

function lastManagerInput(prompt: TrustedPrompt): string {
  for (let i = prompt.messages.length - 1; i >= 0; i -= 1) {
    if (prompt.messages[i].role === 'user') {
      return prompt.messages[i].content;
    }
  }
  return '';
}

export function createNebiusModel(config: NebiusConfig): ModelClient {
  // A secret pasted with a trailing newline would make every request fail
  // with an invalid header, which would look like an outage. Trim it, and
  // refuse a key that still holds whitespace or control characters.
  const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : '';
  if (!apiKey || /[\s\u0000-\u001F\u007F]/.test(apiKey)) {
    throw new Error('A valid Nebius API key is required to build the live model client.');
  }
  if (!config.model || config.model.length > MAX_MODEL_ID_CHARS_FOR_REPLY) {
    throw new Error('A valid model id is required to build the live model client.');
  }

  const timeoutMs = config.timeoutMs || DEFAULT_TIMEOUT_MS;
  const maxTokens = Math.max(
    1,
    Math.min(config.maxTokens || DEFAULT_MAX_TOKENS, MAX_TOKENS_CEILING)
  );
  const temperature = config.temperature === undefined ? DEFAULT_TEMPERATURE : config.temperature;
  const topP = config.topP === undefined ? DEFAULT_TOP_P : config.topP;
  // Called as a plain function: Cloudflare Workers throw "Illegal invocation" when fetch runs with `this` set to config.
  const doFetch = config.fetchImpl;

  return async (prompt) => {
    if (promptChars(prompt) > MAX_PROMPT_CHARS) {
      throw new ModelFailure('prompt_too_large');
    }

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      let response: Response;
      try {
        response = await doFetch(NEBIUS_CHAT_COMPLETIONS_URL, {
          method: 'POST',
          // A redirect would carry the request, and the key, somewhere this
          // client never chose. 'manual' never follows it, and the 3xx (not ok)
          // fails below. Cloudflare Workers reject redirect: 'error' outright.
          redirect: 'manual',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: 'Bearer ' + apiKey
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: config.model,
            messages: prompt.messages,
            max_tokens: maxTokens,
            temperature,
            top_p: topP,
            stream: false,
            ...(config.chatTemplateKwargs ? { chat_template_kwargs: config.chatTemplateKwargs } : {})
          })
        });
      } catch (error) {
        throw timedOut ? new ModelFailure('timeout') : new ModelFailure('unavailable', undefined, fetchErrorTag(error));
      }

      if (response.status === 429) {
        throw new ModelFailure('rate_limited', parseRetryAfter(response.headers.get('retry-after')), httpTag(response.status));
      }
      if (response.status === 401 || response.status === 403) {
        throw new ModelFailure('upstream_auth', undefined, httpTag(response.status));
      }
      if (!response.ok) {
        throw new ModelFailure('unavailable', undefined, httpTag(response.status));
      }

      let text: string;
      try {
        text = await response.text();
      } catch (error) {
        throw new ModelFailure(timedOut ? 'timeout' : 'malformed');
      }
      if (timedOut) {
        throw new ModelFailure('timeout');
      }
      if (text.length > MAX_RESPONSE_CHARS) {
        throw new ModelFailure('malformed');
      }

      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch (error) {
        throw new ModelFailure('malformed');
      }

      const choices = (body as { choices?: unknown } | null)?.choices;
      const choice = Array.isArray(choices) ? (choices[0] as Record<string, unknown> | undefined) : undefined;
      const message = choice && typeof choice === 'object' ? (choice.message as Record<string, unknown> | undefined) : undefined;
      if (!message || typeof message !== 'object') {
        throw new ModelFailure('malformed');
      }

      // A reply cut off by the token limit is cut mid-thought: refuse it,
      // whether the provider says so (finish_reason) or only shows it in the
      // token count. replyValidation also rejects a reply that stops mid-sentence.
      const usage = (body as { usage?: { completion_tokens?: unknown } }).usage;
      if (
        (choice && choice.finish_reason === 'length') ||
        (typeof usage?.completion_tokens === 'number' && usage.completion_tokens >= maxTokens)
      ) {
        throw new ModelFailure('truncated', undefined, undefined, 'truncated');
      }

      const content = message.content;
      if (typeof content !== 'string' || content.trim().length === 0) {
        throw new ModelFailure('empty');
      }

      const parsed = parseModelText(content);
      if (!parsed.ok) {
        throw new ModelFailure('rejected_reply', undefined, undefined, parsed.reason);
      }

      // Label the reply with the model the provider says answered, so a
      // substitution is shown rather than hidden; fall back to the model asked for.
      const reported = (body as { model?: unknown }).model;
      const servedModel =
        typeof reported === 'string' && reported.length > 0 && reported.length <= MAX_MODEL_ID_CHARS_FOR_REPLY
          ? reported
          : config.model;

      return {
        style: chooseStyle(prompt.stage, lastManagerInput(prompt)),
        lines: parsed.lines,
        model: servedModel
      };
    } finally {
      clearTimeout(timer);
    }
  };
}
