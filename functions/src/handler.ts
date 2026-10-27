// functions/src/handler.ts
//
// POST /api/s02/turn, independent of the HTTP framework so it can be tested
// without Firebase. index.ts adapts the Cloud Functions request to this.
//
// Checks run cheapest and safest first, and each failure stops the request:
//
//   405 method       POST only
//   415 media type   application/json only
//   500 raw body     the runtime must supply the raw bytes; fail closed if not
//   413 size         raw body over MAX_BODY_BYTES, before any parsing
//   401 auth         Bearer Firebase ID token, verified on every request
//   400 body         JSON with exactly the allowed fields and limits
//   429 daily limit   a daily cap (live mode only), named in the X-ManagerTalk-Limit header
//   429 busy          the model provider's own rate limit (no such header)
//   502/504 upstream  the live model failed, timed out or returned an unusable reply
//   200 reply        the model client's reply, re-checked before returning
//   500 internal     anything unexpected
//
// Error bodies are generic: they never echo input, tokens or the reason a
// token failed. The client ignores error bodies and reads only the status.

import { VerifyIdToken, parseBearerToken } from './auth';
import { MAX_MODEL_ID_CHARS_FOR_REPLY } from './limits';
import { TurnLogger, TurnOutcome } from './log';
import { EMPLOYEE_RESPONSE_STYLES, ModelClient, ModelReply } from './mockModel';
import { ModelFailure, ModelFailureCode } from './nebiusModel';
import { buildTrustedPrompt } from './prompts';
import { DailyLimiter } from './rateLimit';
import { MAX_EMPLOYEE_LINES, MAX_EMPLOYEE_LINE_CHARS, validateTurnRequest } from './validate';

export const ROUTE = '/api/s02/turn' as const;

/**
 * Set on a 429 that comes from this service's own daily cap, so the client
 * can say so accurately instead of calling it "busy". Value: daily-user or
 * daily-global. A 429 relayed from the model provider never carries it.
 */
export const LIMIT_HEADER = 'X-ManagerTalk-Limit';

/**
 * 256 KiB. The client's worst case is about 58,000 UTF-16 characters, up to
 * about 175 KB as UTF-8 (see the WIRE CONTRACT comment in the client), so
 * every legitimate request fits.
 */
export const MAX_BODY_BYTES = 256 * 1024;

export interface TurnHttpRequest {
  method: string;
  contentType: string | undefined;
  authorization: string | undefined;
  /** The exact bytes received (a Buffer or any Uint8Array). Anything else fails closed. */
  rawBody: unknown;
}

export type ErrorCode =
  | 'method_not_allowed'
  | 'unsupported_media_type'
  | 'payload_too_large'
  | 'unauthenticated'
  | 'invalid_request'
  | 'rate_limited'
  | 'daily_limit'
  | 'upstream_unavailable'
  | 'internal';

export interface ErrorBody {
  error: { code: ErrorCode; message: string };
}

export type SuccessBody = ModelReply;

export interface TurnHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: SuccessBody | ErrorBody;
}

export interface TurnDeps {
  verifyIdToken: VerifyIdToken;
  model: ModelClient;
  log: TurnLogger;
  /** Which kind of model client `model` is; recorded in the log. Defaults to 'mock'. */
  mode?: 'mock' | 'live';
  /** Daily caps, checked before the model is called. Only the live path sets one. */
  limiter?: DailyLimiter;
  now?: () => number;
}

const BASE_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};

const MESSAGES: Record<ErrorCode, string> = {
  method_not_allowed: 'Use POST for this endpoint.',
  unsupported_media_type: 'Send the request as application/json.',
  payload_too_large: 'The request is too large.',
  unauthenticated: 'Sign in again to continue.',
  invalid_request: 'The request was not valid.',
  rate_limited: 'The conversation service is busy. Please wait a moment.',
  daily_limit: 'The daily limit for the conversation partner has been reached.',
  upstream_unavailable: 'The conversation partner is unavailable right now.',
  internal: 'Something went wrong. Please try again.'
};

/** The media type without parameters, lower-cased: "application/json; charset=utf-8" → "application/json". */
function mediaType(contentType: string | undefined): string {
  return typeof contentType === 'string' ? contentType.split(';')[0].trim().toLowerCase() : '';
}

/** The reply a model client produced, held to the same rules the client applies. */
function isAcceptableReply(reply: ModelReply | null | undefined): reply is ModelReply {
  return (
    !!reply &&
    (EMPLOYEE_RESPONSE_STYLES as readonly string[]).indexOf(reply.style) !== -1 &&
    typeof reply.model === 'string' &&
    reply.model.length > 0 &&
    reply.model.length <= MAX_MODEL_ID_CHARS_FOR_REPLY &&
    Array.isArray(reply.lines) &&
    reply.lines.length > 0 &&
    reply.lines.length <= MAX_EMPLOYEE_LINES &&
    reply.lines.every(
      (line) =>
        typeof line === 'string' &&
        line.trim().length > 0 &&
        line.trim().length <= MAX_EMPLOYEE_LINE_CHARS
    )
  );
}

interface FailureMapping {
  status: number;
  code: ErrorCode;
  outcome: TurnOutcome;
}

const MODEL_FAILURES: Record<ModelFailureCode, FailureMapping> = {
  timeout: { status: 504, code: 'upstream_unavailable', outcome: 'model_timeout' },
  rate_limited: { status: 429, code: 'rate_limited', outcome: 'model_rate_limited' },
  unavailable: { status: 502, code: 'upstream_unavailable', outcome: 'model_unavailable' },
  upstream_auth: { status: 502, code: 'upstream_unavailable', outcome: 'model_auth_error' },
  malformed: { status: 502, code: 'upstream_unavailable', outcome: 'model_malformed' },
  empty: { status: 502, code: 'upstream_unavailable', outcome: 'model_empty' },
  truncated: { status: 502, code: 'upstream_unavailable', outcome: 'reply_rejected' },
  rejected_reply: { status: 502, code: 'upstream_unavailable', outcome: 'reply_rejected' },
  prompt_too_large: { status: 502, code: 'upstream_unavailable', outcome: 'model_unavailable' }
};

/** The generic 500 for a failure outside handleTurn, in the same shape as every other error. */
export function internalErrorResponse(): TurnHttpResponse {
  return {
    status: 500,
    headers: { ...BASE_HEADERS },
    body: { error: { code: 'internal', message: MESSAGES.internal } }
  };
}

export async function handleTurn(
  request: TurnHttpRequest,
  deps: TurnDeps
): Promise<TurnHttpResponse> {
  const now = deps.now || Date.now;
  const started = now();

  const finish = (
    status: number,
    outcome: TurnOutcome,
    body: SuccessBody | ErrorBody,
    extraHeaders: Record<string, string> = {}
  ): TurnHttpResponse => {
    deps.log({ route: ROUTE, mode: deps.mode || 'mock', status, outcome, latencyMs: now() - started });
    return { status, headers: { ...BASE_HEADERS, ...extraHeaders }, body };
  };

  const fail = (
    status: number,
    code: ErrorCode,
    outcome: TurnOutcome,
    extraHeaders: Record<string, string> = {}
  ): TurnHttpResponse =>
    finish(status, outcome, { error: { code, message: MESSAGES[code] } }, extraHeaders);

  try {
    if (request.method !== 'POST') {
      return fail(405, 'method_not_allowed', 'method_not_allowed', { Allow: 'POST' });
    }

    if (mediaType(request.contentType) !== 'application/json') {
      return fail(415, 'unsupported_media_type', 'unsupported_media_type');
    }

    // Never fall back to an already-parsed body: without the raw bytes the
    // size limit cannot be enforced, so the request is refused instead.
    const rawBody = request.rawBody;
    if (!(rawBody instanceof Uint8Array)) {
      return fail(500, 'internal', 'raw_body_unavailable');
    }

    if (rawBody.length > MAX_BODY_BYTES) {
      return fail(413, 'payload_too_large', 'payload_too_large');
    }

    const token = parseBearerToken(request.authorization);
    if (!token) {
      return fail(401, 'unauthenticated', 'missing_token');
    }

    let uid: string;
    try {
      uid = (await deps.verifyIdToken(token)).uid;
    } catch (error) {
      return fail(401, 'unauthenticated', 'invalid_token');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { ignoreBOM: true }).decode(rawBody));
    } catch (error) {
      return fail(400, 'invalid_request', 'invalid_json');
    }

    const validation = validateTurnRequest(parsed);
    if (!validation.ok) {
      return fail(400, 'invalid_request', validation.reason);
    }

    const prompt = buildTrustedPrompt(validation.value);

    // Charged only after the request is known to be valid, and before any
    // model call. A limiter that cannot answer fails closed: an unmetered
    // live call is the one thing this guard exists to prevent.
    if (deps.limiter) {
      let decision;
      try {
        decision = await deps.limiter.consume(uid);
      } catch (error) {
        return fail(503, 'upstream_unavailable', 'limiter_error');
      }
      if (!decision.allowed) {
        const global = decision.scope === 'global';
        return fail(429, 'daily_limit', global ? 'quota_global' : 'quota_user', {
          [LIMIT_HEADER]: global ? 'daily-global' : 'daily-user'
        });
      }
    }

    let reply: ModelReply;
    try {
      reply = await deps.model(prompt);
    } catch (error) {
      if (error instanceof ModelFailure) {
        const mapping = MODEL_FAILURES[error.code];
        const headers: Record<string, string> =
          error.retryAfterSeconds !== undefined
            ? { 'Retry-After': String(error.retryAfterSeconds) }
            : {};
        return fail(mapping.status, mapping.code, mapping.outcome, headers);
      }
      return fail(500, 'internal', 'model_error');
    }

    if (!isAcceptableReply(reply)) {
      return fail(500, 'internal', 'invalid_model_reply');
    }

    return finish(200, 'ok', {
      style: reply.style,
      lines: reply.lines.map((line) => line.trim()),
      model: reply.model
    });
  } catch (error) {
    return fail(500, 'internal', 'model_error');
  }
}
