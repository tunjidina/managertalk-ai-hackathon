// src/engine/s02/stageMachine.ts
//
// Strict stage progression for MT-S02:
//
//   sbi → exploration → hypotheses → commitments → closing → scoring → feedback
//
// Forward movement is one step at a time and only from a stage that has
// been satisfied. Backward movement is permitted for review but cannot
// skip forward again: nextStage() is the only way forward, so revisiting
// stage two does not let the manager jump to closing.

import { S02Stage, S02_STAGE_ORDER } from '../../types/scenarioBlueprint';

export function stageIndex(stage: S02Stage): number {
  return S02_STAGE_ORDER.indexOf(stage);
}

export function isStage(value: unknown): value is S02Stage {
  return (
    typeof value === 'string' &&
    S02_STAGE_ORDER.indexOf(value as S02Stage) !== -1
  );
}

/** The stage after this one, or null at the end of the flow. */
export function nextStage(stage: S02Stage): S02Stage | null {
  const index = stageIndex(stage);
  if (index === -1 || index >= S02_STAGE_ORDER.length - 1) {
    return null;
  }
  return S02_STAGE_ORDER[index + 1];
}

/** The stage before this one, or null at the start. */
export function previousStage(stage: S02Stage): S02Stage | null {
  const index = stageIndex(stage);
  if (index <= 0) {
    return null;
  }
  return S02_STAGE_ORDER[index - 1];
}

/**
 * A transition is legal when it moves exactly one stage forward, or any
 * distance backward. Anything else — a skip, a jump to scoring, a
 * repeated stage — is rejected.
 */
export function canTransition(from: S02Stage, to: S02Stage): boolean {
  const fromIndex = stageIndex(from);
  const toIndex = stageIndex(to);

  if (fromIndex === -1 || toIndex === -1) {
    return false;
  }

  if (toIndex < fromIndex) {
    return true;
  }

  return toIndex === fromIndex + 1;
}

export function isTerminalStage(stage: S02Stage): boolean {
  return stage === 'feedback';
}

/** True once the five authored stages are behind the current position. */
export function hasCompletedConversation(stage: S02Stage): boolean {
  return stageIndex(stage) >= stageIndex('scoring');
}
