// src/screens/s02/s02Navigation.ts
//
// Bridges the MT-S02 stage machine to the app's navigation store.
//
// The stage machine in engine/s02/stageMachine.ts is authoritative: it is
// the only thing that decides what stage comes next, and it refuses skips.
// navigationState.currentScreen is derived from it, never the reverse —
// App.tsx runs one effect that follows the stage. Without that rule there
// would be two sources of truth for where the manager is, and a component
// could jump to scoring by setting a screen.

import { Screen } from '../../store/navigationState';
import { S02InputStage, S02Stage, S02_INPUT_STAGES } from '../../types/scenarioBlueprint';

export const S02_STAGE_TO_SCREEN: Record<S02Stage, Screen> = {
  sbi: 's02_sbi',
  exploration: 's02_exploration',
  hypotheses: 's02_hypotheses',
  commitments: 's02_commitments',
  closing: 's02_closing',
  scoring: 's02_scoring',
  feedback: 's02_feedback'
};

/** True for any screen belonging to the MT-S02 flow. */
export function isS02Screen(screen: Screen): boolean {
  return String(screen).indexOf('s02_') === 0;
}

/** The resume prompt's explanation for a saved, unfinished stage. */
export function s02ResumeMessage(stage: S02Stage | null): string | undefined {
  if (!stage) {
    return undefined;
  }
  const position = S02_INPUT_STAGES.indexOf(stage as S02InputStage);
  const where = position === -1 ? 'the scoring step' : 'Step ' + (position + 1) + ' of ' + S02_INPUT_STAGES.length;
  return (
    'Your progress in this scenario is saved at ' + where + '. Continue from there, or start over from Step 1. ' +
    'Earlier messages in the conversation are not kept either way.'
  );
}
