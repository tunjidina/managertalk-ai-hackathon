import { create } from 'zustand';

import {
  ScenarioStep,
  ScenarioProgressStatus
} from '../types/scenarioProgress';
import { SCENARIO_REGISTRY } from '../data/scenarioRegistry';

// -----------------------------
// Why this store exists
// -----------------------------
//
// navigationState already knows which screen is showing. This store knows
// something different: what the DATABASE believes, and whether the two are
// in sync. Keeping them apart matters because:
//
//   - the header needs a "Saving…" / "Sync failed" indicator, which is a
//     property of the network call, not of the screen;
//   - the load must complete before any save fires, or an empty local
//     state overwrites real saved progress;
//   - `completed` is scenario-level truth that outlives one navigation.
//
// It holds no conversation content. conversationState stays the single
// source of truth for the scenario itself.

export interface ScenarioProgressState {
  scenarioId: string;

  /** Lifecycle of the Firestore read. Saves are blocked until 'ready'. */
  status: ScenarioProgressStatus;

  /** What Firestore last confirmed. Not necessarily the visible screen. */
  currentStep: ScenarioStep;
  completed: boolean;

  /** True while a write is in flight — drives the header indicator. */
  saving: boolean;

  /** Human-readable text from the last failed read or write, or null. */
  lastError: string | null;

  // Actions
  beginLoad: () => void;
  loadSucceeded: (step: ScenarioStep, completed: boolean) => void;
  loadFailed: (message: string) => void;

  beginSave: () => void;
  saveSucceeded: (step: ScenarioStep, completed: boolean) => void;
  saveFailed: (message: string) => void;

  clearError: () => void;
  resetProgress: () => void;
}

export const useScenarioProgressState = create<ScenarioProgressState>((set) => ({
  // Which scenario this progress belongs to. Overwritten by whichever
  // progress hook is active; the registry's first entry is only the seed.
  scenarioId: SCENARIO_REGISTRY[0].scenarioId,
  status: 'idle',
  currentStep: 'overview',
  completed: false,
  saving: false,
  lastError: null,

  beginLoad: () => set({ status: 'loading', lastError: null }),

  loadSucceeded: (step, completed) =>
    set({
      status: 'ready',
      currentStep: step,
      completed,
      lastError: null
    }),

  loadFailed: (message) => set({ status: 'error', lastError: message }),

  beginSave: () => set({ saving: true }),

  saveSucceeded: (step, completed) =>
    set({
      saving: false,
      currentStep: step,
      completed,
      lastError: null
    }),

  saveFailed: (message) => set({ saving: false, lastError: message }),

  clearError: () => set({ lastError: null }),

  resetProgress: () =>
    set({
      status: 'idle',
      currentStep: 'overview',
      completed: false,
      saving: false,
      lastError: null
    })
}));
