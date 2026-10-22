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
import { S02Stage } from '../../types/scenarioBlueprint';

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
