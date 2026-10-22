// src/engine/s02/styleSelection.ts
//
// Which of Tomás's four response styles a manager message calls for.
//
// Pure by design: no Firebase, network or browser APIs. The server
// (functions/) uses this same file, copied into functions/src/shared/ by
// functions/scripts/sync-shared.mjs, so the style that picks the portrait
// pose is decided by rule on both sides and never by a model. Keep its
// imports to the blueprint types and ./textSignals.

import { S02InputStage } from '../../types/scenarioBlueprint';
import {
  CAUSALITY_MARKERS,
  FORMAL_PROCESS_MARKERS,
  NAMED_SOURCE_MARKERS,
  OUTAGE_MARKERS,
  containsAny
} from './textSignals';

/** The four response styles named in implementation_notes.branching_constraints. */
export type EmployeeResponseStyle =
  | 'technical_detail'
  | 'evidence_challenge'
  | 'procedural_compliance'
  | 'composed_disagreement';

/** Every style the endpoint may return; anything else is rejected. */
export const EMPLOYEE_RESPONSE_STYLES: EmployeeResponseStyle[] = [
  'technical_detail',
  'evidence_challenge',
  'procedural_compliance',
  'composed_disagreement'
];

export function chooseStyle(
  stage: S02InputStage,
  managerInput: string
): EmployeeResponseStyle {
  if (containsAny(managerInput, OUTAGE_MARKERS) || containsAny(managerInput, NAMED_SOURCE_MARKERS)) {
    return 'evidence_challenge';
  }
  if (containsAny(managerInput, CAUSALITY_MARKERS) || containsAny(managerInput, FORMAL_PROCESS_MARKERS)) {
    return 'composed_disagreement';
  }
  if (stage === 'commitments' || stage === 'closing') {
    return 'procedural_compliance';
  }
  return 'technical_detail';
}
