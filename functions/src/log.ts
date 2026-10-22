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
  | 'invalid_model_reply';

export interface TurnLogEntry {
  route: '/api/s02/turn';
  mode: 'mock';
  status: number;
  outcome: TurnOutcome;
  latencyMs: number;
}

export type TurnLogger = (entry: TurnLogEntry) => void;
