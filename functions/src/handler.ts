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
//   200 reply        the model client's reply, re-checked before returning
//   500 internal     anything unexpected
//
// Error bodies are generic: they never echo input, tokens or the reason a
// token failed. The client ignores error bodies and reads only the status.

import { VerifyIdToken, parseBearerToken } from './auth';
import { TurnLogger, TurnOutcome } from './log';
import { EMPLOYEE_RESPONSE_STYLES, ModelClient, ModelReply } from './mockModel';
import { buildTrustedPrompt } from './prompts';
import { MAX_EMPLOYEE_LINES, MAX_EMPLOYEE_LINE_CHARS, validateTurnRequest } from './validate';

export const ROUTE = '/api/s02/turn' as const;

/**
 * 256 KiB. The client's worst case is about 58,000 UTF-16 characters, up to
 * about 175 KB as UTF-8 (see the WIRE CONTRACT comment in the client), so
 * every legitimate request fits.
 */
export const MAX_BODY_BYTES = 256 * 1024;

const MAX_MODEL_ID_CHARS = 120;

export interface TurnHttpRequest {
  method: string;
  contentType: string | undefined;
  authorization: string | undefined;
  /** The exact bytes received. Anything other than a Buffer fails closed. */
  rawBody: unknown;
}

export type ErrorCode =
  | 'method_not_allowed'
  | 'unsupported_media_type'
  | 'payload_too_large'
  | 'unauthenticated'
  | 'invalid_request'
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
    reply.model.length <= MAX_MODEL_ID_CHARS &&
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
    deps.log({ route: ROUTE, mode: 'mock', status, outcome, latencyMs: now() - started });
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
    if (!Buffer.isBuffer(request.rawBody)) {
      return fail(500, 'internal', 'raw_body_unavailable');
    }

    if (request.rawBody.length > MAX_BODY_BYTES) {
      return fail(413, 'payload_too_large', 'payload_too_large');
    }

    const token = parseBearerToken(request.authorization);
    if (!token) {
      return fail(401, 'unauthenticated', 'missing_token');
    }

    try {
      await deps.verifyIdToken(token);
    } catch (error) {
      return fail(401, 'unauthenticated', 'invalid_token');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(request.rawBody.toString('utf8'));
    } catch (error) {
      return fail(400, 'invalid_request', 'invalid_json');
    }

    const validation = validateTurnRequest(parsed);
    if (!validation.ok) {
      return fail(400, 'invalid_request', validation.reason);
    }

    const prompt = buildTrustedPrompt(validation.value);

    let reply: ModelReply;
    try {
      reply = await deps.model(prompt);
    } catch (error) {
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
