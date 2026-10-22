// src/types/scenarioProgress.ts
//
// The vocabulary for scenario progress, and the translation between the
// app's Screen union and the persisted step names.
//
// Why a separate ScenarioStep type instead of persisting Screen directly:
// Screen carries UI aliases ('overview' and 'scenario_overview' are the
// same place, so are 'conversation' and 'conversation_flow'). Writing raw
// Screen values to Firestore would put two different strings in the
// database for one logical step. ScenarioStep is the canonical, stable
// name — safe to store, safe to compare, safe to render in a progress UI.

import { Timestamp } from 'firebase/firestore';

import { Screen } from '../store/navigationState';

// -----------------------------
// Scenario identity
// -----------------------------

/**
 * MT-S01's id.
 *
 * DO NOT use this as "the current scenario" — it is the legacy scenario's
 * own identifier and nothing more. Everything that needs to know which
 * scenario is running reads store/activeScenarioState instead. This
 * constant remains only so the registry and MT-S01's own screens have a
 * name for themselves.
 */
export const SCENARIO_ID = 'MT-S01';

export type ScenarioId = typeof SCENARIO_ID;

// -----------------------------
// Steps
// -----------------------------

export type ScenarioStep =
  | 'overview'
  | 'evidence'
  | 'conversation'
  | 'commitments'
  | 'closing'
  | 'scoring'
  | 'feedback';

/** Canonical order. Index positions drive the progress bar and any
 *  "furthest reached" logic. */
export const SCENARIO_STEP_ORDER: ScenarioStep[] = [
  'overview',
  'evidence',
  'conversation',
  'commitments',
  'closing',
  'scoring',
  'feedback'
];

export const FINAL_STEP: ScenarioStep = 'feedback';

// -----------------------------
// Persisted document shape
// -----------------------------

/**
 * Exactly what lives in Firestore at userScenarioState/{userId}_{scenarioId},
 * minus the server-written timestamps. Keep this in sync with the security
 * rules: `userId` must be present on every write or the rule denies it.
 */
export interface ScenarioProgress {
  userId: string;
  scenarioId: string;

  /**
   * MT-S01's step, coerced to a known value. Meaningless for a blueprint
   * scenario, whose stages are not in this union — read currentStepRaw
   * there instead.
   */
  currentStep: ScenarioStep;

  /**
   * Exactly what is stored, uncoerced. Added so a second scenario's stage
   * names survive a round trip: MT-S02 persists 'sbi' / 'exploration' /
   * 'hypotheses', none of which are ScenarioStep values, and coercing them
   * to 'overview' would silently reset a manager to stage one.
   */
  currentStepRaw: string;

  completed: boolean;

  /**
   * Server-written completion stamp, present only once
   * markScenarioCompleted() has run. Optional because a scenario in
   * progress has no completion time, and null when the field exists but
   * has not yet resolved server-side.
   *
   * Kept as a Firestore Timestamp rather than a number so callers can use
   * toMillis() / toDate() directly.
   */
  completedAt?: Timestamp | null;
}

export type ScenarioProgressStatus = 'idle' | 'loading' | 'ready' | 'error';

// -----------------------------
// Screen <-> Step translation
// -----------------------------

const SCREEN_TO_STEP: Record<Screen, ScenarioStep> = {
  scenario_overview: 'overview',
  overview: 'overview',
  evidence: 'evidence',
  conversation_flow: 'conversation',
  conversation: 'conversation',
  commitment_builder: 'commitments',
  closing: 'closing',
  scoring: 'scoring',
  feedback: 'feedback',

  // The certificate is not its own step. Mapping it to 'feedback' means
  // opening it writes no new progress document and fires no duplicate
  // 'step_reached' event — the saved step is already 'feedback'.
  certificate: 'feedback',

  // MT-S02 screens map onto the nearest MT-S01 step purely so this Record
  // stays exhaustive. MT-S02 progress is NOT tracked by this mapping — its
  // stage lives in s02SessionState and is not yet persisted to Firestore.
  scenario_select: 'overview',
  screen_profile: 'overview',
  s02_sbi: 'conversation',
  s02_exploration: 'conversation',
  s02_hypotheses: 'conversation',
  s02_commitments: 'commitments',
  s02_closing: 'closing',
  s02_scoring: 'scoring',
  s02_feedback: 'feedback'
};

/** The canonical Screen for each step — the alias App.tsx's switch handles. */
const STEP_TO_SCREEN: Record<ScenarioStep, Screen> = {
  overview: 'scenario_overview',
  evidence: 'evidence',
  conversation: 'conversation_flow',
  commitments: 'commitment_builder',
  closing: 'closing',
  scoring: 'scoring',
  feedback: 'feedback'
};

export function screenToStep(screen: Screen): ScenarioStep {
  return SCREEN_TO_STEP[screen] || 'overview';
}

export function stepToScreen(step: ScenarioStep): Screen {
  return STEP_TO_SCREEN[step] || 'scenario_overview';
}

// -----------------------------
// Guards and helpers
// -----------------------------

/**
 * Firestore returns `any`. Anything read back from the network is treated
 * as untrusted until it passes this — a document hand-edited in the console,
 * or written by an older build, must not put an unknown value into the
 * navigation store.
 */
export function isScenarioStep(value: unknown): value is ScenarioStep {
  return (
    typeof value === 'string' &&
    SCENARIO_STEP_ORDER.indexOf(value as ScenarioStep) !== -1
  );
}

export function stepIndex(step: ScenarioStep): number {
  return SCENARIO_STEP_ORDER.indexOf(step);
}

/**
 * True for the screens that belong to MT-S01's own flow.
 *
 * SCREEN_TO_STEP maps every Screen to a step so the Record stays
 * exhaustive, which means 'scenario_select' maps to 'overview'. Without
 * this guard, a manager sitting on 'closing' who opened the scenario list
 * would have 'overview' written over their saved step — their progress
 * reset by a button that only navigates. The save effect checks this
 * before writing.
 */
const LEGACY_SCREENS: Screen[] = [
  'scenario_overview',
  'overview',
  'evidence',
  'conversation_flow',
  'conversation',
  'commitment_builder',
  'closing',
  'scoring',
  'feedback',
  'certificate'
];

export function isLegacyScreen(screen: Screen): boolean {
  return LEGACY_SCREENS.indexOf(screen) !== -1;
}

/** True when `next` is further through the scenario than `current`. */
export function isForward(current: ScenarioStep, next: ScenarioStep): boolean {
  return stepIndex(next) > stepIndex(current);
}
