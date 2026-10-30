// functions/src/log.ts
//
// The only thing /api/s02/turn logs. The entry type has no free-form
// field, so conversation text, headers, tokens, user ids and secrets
// cannot be logged by accident: anything not listed here never reaches
// the logger.

export type TurnOutcome =
  | 'ok'
  | 'method_not_allowed'
  | 'unsupported_media_type'
  | 'raw_body_unavailable'
  | 'payload_too_large'
  | 'missing_token'
  | 'invalid_token'
  | 'invalid_json'
  | 'not_an_object'
  | 'unexpected_fields'
  | 'scenario_not_allowed'
  | 'stage_not_allowed'
  | 'manager_input_invalid'
  | 'prior_turns_invalid'
  | 'model_error'
  | 'invalid_model_reply'
  | 'limiter_error'
  | 'quota_user'
  | 'quota_global'
  | 'model_timeout'
  | 'model_rate_limited'
  | 'model_unavailable'
  | 'model_auth_error'
  | 'model_malformed'
  | 'model_empty'
  | 'reply_rejected'
  | 'worker_error';

export interface TurnLogEntry {
  route: '/api/s02/turn';
  /** 'live' only when a real model client answered or was attempted. */
  mode: 'mock' | 'live';
  status: number;
  outcome: TurnOutcome;
  latencyMs: number;
  /** Upstream failure detail, only ever http_<status> or fetch_<ErrorName>. Never sent to the browser. */
  upstream?: string;
  /** Why a model reply was rejected, from REJECTION_REASONS only. Never sent to the browser. */
  reason?: string;
}

const UPSTREAM_PATTERN = /^(?:http_\d{1,3}|fetch_[A-Za-z]{1,40})$/;

/** The detail if it has exactly the allowed shape, otherwise undefined. */
export function sanitizeUpstream(value: unknown): string | undefined {
  return typeof value === 'string' && UPSTREAM_PATTERN.test(value) ? value : undefined;
}

/** 'truncated' plus every replyValidation RejectionReason. */
export const REJECTION_REASONS = [
  'truncated',
  'not_text',
  'empty',
  'unterminated_reasoning',
  'leak',
  'forbidden_topic',
  'mock_marker',
  'control_characters',
  'link',
  'unfinished',
  'too_long',
  'too_many_lines'
] as const;

export function sanitizeReason(value: unknown): string | undefined {
  return typeof value === 'string' && (REJECTION_REASONS as readonly string[]).indexOf(value) !== -1 ? value : undefined;
}

export type TurnLogger = (entry: TurnLogEntry) => void;
