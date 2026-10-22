// functions/src/validate.ts
//
// Validates the body of POST /api/s02/turn against the exact shape the
// client sends (src/engine/s02/conversationEngine.ts, WIRE CONTRACT):
//
//   { scenarioId, stage, managerInput, priorTurns: [{ stage, managerInput, employeeLines }] }
//
// Keys must match exactly. Unknown keys — including the `system` and
// prompt-text fields older clients sent — are rejected, never ignored, so
// client-supplied prompt text cannot reach the model. Limits mirror the
// client's: it checks the same bounds before sending, so a legitimate
// client never trips these.

import { S02InputStage, S02_INPUT_STAGES } from './shared/types/scenarioBlueprint';

export const ALLOWED_SCENARIO_IDS = ['MT-S02'] as const;
export type AllowedScenarioId = (typeof ALLOWED_SCENARIO_IDS)[number];

/** UTF-16 code units, the unit the client's `.length` check uses. */
export const MAX_MANAGER_INPUT_CHARS = 2000;
export const MAX_PRIOR_TURNS = 10;
export const MAX_EMPLOYEE_LINES = 6;
export const MAX_EMPLOYEE_LINE_CHARS = 600;

export interface ValidPriorTurn {
  stage: S02InputStage;
  managerInput: string;
  employeeLines: string[];
}

export interface ValidTurnRequest {
  scenarioId: AllowedScenarioId;
  stage: S02InputStage;
  managerInput: string;
  priorTurns: ValidPriorTurn[];
}

/** Why a body was rejected. Codes only: never the offending value. */
export type ValidationFailure =
  | 'not_an_object'
  | 'unexpected_fields'
  | 'scenario_not_allowed'
  | 'stage_not_allowed'
  | 'manager_input_invalid'
  | 'prior_turns_invalid';

export type ValidationResult =
  | { ok: true; value: ValidTurnRequest }
  | { ok: false; reason: ValidationFailure };

const TOP_LEVEL_KEYS = ['managerInput', 'priorTurns', 'scenarioId', 'stage'];
const PRIOR_TURN_KEYS = ['employeeLines', 'managerInput', 'stage'];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, i) => key === expected[i]);
}

function isInputStage(value: unknown): value is S02InputStage {
  return typeof value === 'string' && (S02_INPUT_STAGES as string[]).indexOf(value) !== -1;
}

function isAllowedScenarioId(value: unknown): value is AllowedScenarioId {
  return typeof value === 'string' && (ALLOWED_SCENARIO_IDS as readonly string[]).indexOf(value) !== -1;
}

/** At least one non-whitespace character and within the length cap, as the client requires. */
function isManagerInput(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= MAX_MANAGER_INPUT_CHARS
  );
}

function isEmployeeLines(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_EMPLOYEE_LINES) {
    return false;
  }
  return value.every(
    (line) =>
      typeof line === 'string' &&
      line.trim().length > 0 &&
      line.length <= MAX_EMPLOYEE_LINE_CHARS
  );
}

function parsePriorTurn(value: unknown): ValidPriorTurn | null {
  if (!isPlainObject(value) || !hasExactKeys(value, PRIOR_TURN_KEYS)) {
    return null;
  }
  if (!isInputStage(value.stage) || !isManagerInput(value.managerInput) || !isEmployeeLines(value.employeeLines)) {
    return null;
  }
  return {
    stage: value.stage,
    managerInput: value.managerInput,
    employeeLines: value.employeeLines.slice()
  };
}

export function validateTurnRequest(body: unknown): ValidationResult {
  if (!isPlainObject(body)) {
    return { ok: false, reason: 'not_an_object' };
  }
  if (!hasExactKeys(body, TOP_LEVEL_KEYS)) {
    return { ok: false, reason: 'unexpected_fields' };
  }
  if (!isAllowedScenarioId(body.scenarioId)) {
    return { ok: false, reason: 'scenario_not_allowed' };
  }
  if (!isInputStage(body.stage)) {
    return { ok: false, reason: 'stage_not_allowed' };
  }
  if (!isManagerInput(body.managerInput)) {
    return { ok: false, reason: 'manager_input_invalid' };
  }
  if (!Array.isArray(body.priorTurns) || body.priorTurns.length > MAX_PRIOR_TURNS) {
    return { ok: false, reason: 'prior_turns_invalid' };
  }

  const priorTurns: ValidPriorTurn[] = [];
  for (const item of body.priorTurns) {
    const turn = parsePriorTurn(item);
    if (!turn) {
      return { ok: false, reason: 'prior_turns_invalid' };
    }
    priorTurns.push(turn);
  }

  return {
    ok: true,
    value: {
      scenarioId: body.scenarioId,
      stage: body.stage,
      managerInput: body.managerInput,
      priorTurns
    }
  };
}
