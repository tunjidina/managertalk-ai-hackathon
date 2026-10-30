// src/utils/signOutReset.ts
//
// In-memory scenario state that must not survive a sign-out, so the next
// account on this device starts clean.

import { useActiveScenarioState } from '../store/activeScenarioState';
import { useS02SessionState } from '../store/s02SessionState';

export function resetScenarioStateForSignOut(): void {
  useS02SessionState.getState().resetSession();
  useActiveScenarioState.getState().resetActiveScenario();
}
