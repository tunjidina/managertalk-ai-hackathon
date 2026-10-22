import { create } from 'zustand';

import {
  SCENARIO_REGISTRY,
  ScenarioFlowKind,
  getRegistryEntry
} from '../data/scenarioRegistry';

// -----------------------------
// Which scenario is running
// -----------------------------
//
// Before this store, 'MT-S01' was a compile-time constant read directly by
// the progress layer, the analytics calls and the certificate. Adding a
// second scenario made that constant a lie in three places at once.
//
// The rule now: nothing reads a scenario id from a constant. Everything
// that needs one reads it from here, and the selector is the only thing
// that writes it.

export interface ActiveScenarioState {
  scenarioId: string;
  flowKind: ScenarioFlowKind;
  title: string;

  setActiveScenario: (scenarioId: string) => void;
  resetActiveScenario: () => void;
}

/** The first registry entry. MT-S01, unless the registry is reordered. */
const DEFAULT_ENTRY = SCENARIO_REGISTRY[0];

export const useActiveScenarioState = create<ActiveScenarioState>((set) => ({
  scenarioId: DEFAULT_ENTRY.scenarioId,
  flowKind: DEFAULT_ENTRY.flowKind,
  title: DEFAULT_ENTRY.title,

  setActiveScenario: (scenarioId) => {
    const entry = getRegistryEntry(scenarioId);
    if (!entry) {
      // An unknown id must not silently switch the app to a scenario that
      // does not exist — the current one stays selected.
      return;
    }
    set({
      scenarioId: entry.scenarioId,
      flowKind: entry.flowKind,
      title: entry.title
    });
  },

  resetActiveScenario: () =>
    set({
      scenarioId: DEFAULT_ENTRY.scenarioId,
      flowKind: DEFAULT_ENTRY.flowKind,
      title: DEFAULT_ENTRY.title
    })
}));

/** Non-React accessor, for engines and event handlers. */
export function activeScenarioId(): string {
  return useActiveScenarioState.getState().scenarioId;
}
