import { create } from 'zustand';

import {
  S02InputStage,
  S02Stage,
  ScoreTier
} from '../types/scenarioBlueprint';
import { S02Commitment } from '../engine/s02/commitmentValidator';
import { EngineTurn } from '../engine/s02/conversationEngine';
import { S02ScoreResult } from '../engine/s02/scoringEngine';
import { FeedbackSelection } from '../engine/s02/feedbackSelector';
import { canTransition, nextStage } from '../engine/s02/stageMachine';
import { S02_SCENARIO_ID } from '../data/scenarioRegistry';

// -----------------------------
// State
// -----------------------------

export type S02RequestStatus = 'idle' | 'sending' | 'error';

export interface S02SessionState {
  scenarioId: string;
  stage: S02Stage;

  /** Manager input, one entry per authored stage. */
  inputs: Record<S02InputStage, string>;

  /** Structured commitments. Prose cannot be checked for owner or date. */
  managerCommitment: S02Commitment | null;
  employeeCommitment: S02Commitment | null;

  /** Captured on the closing screen; the checkpoint every commitment must precede. */
  checkpointDate: string;
  checkpointInitiator: string;

  /** Tomás's turns, in order. */
  turns: EngineTurn[];

  /** Blueprint prohibitions the most recent input tripped, verbatim. */
  lastViolations: string[];

  requestStatus: S02RequestStatus;
  lastError: string | null;

  score: S02ScoreResult | null;
  feedback: FeedbackSelection | null;

  // Actions
  setInput: (stage: S02InputStage, value: string) => void;
  setManagerCommitment: (commitment: S02Commitment | null) => void;
  setEmployeeCommitment: (commitment: S02Commitment | null) => void;
  setCheckpoint: (date: string, initiator: string) => void;

  beginRequest: () => void;
  recordTurn: (turn: EngineTurn, violations: string[]) => void;
  requestFailed: (message: string) => void;

  /** Advances exactly one stage, and only if the stage machine allows it. */
  advance: () => void;
  goToStage: (stage: S02Stage) => void;

  /**
   * Puts the session back at a stage loaded from Firestore. This bypasses
   * the stage machine deliberately: restoring a saved position is not a
   * transition, and canTransition would reject a jump from 'sbi' to
   * 'closing' — which is exactly what resuming a half-finished run is.
   * Only the progress hook calls this.
   */
  restoreStage: (stage: S02Stage) => void;

  setScore: (score: S02ScoreResult) => void;
  setFeedback: (feedback: FeedbackSelection) => void;

  resetSession: () => void;
}

const EMPTY_INPUTS: Record<S02InputStage, string> = {
  sbi: '',
  exploration: '',
  hypotheses: '',
  commitments: '',
  closing: ''
};

// -----------------------------
// Store
// -----------------------------
//
// Separate from conversationState, which belongs to MT-S01 and has a
// different shape (stages, branches, SBI scores). Sharing it would mean
// bending one scenario's model around the other's.

export const useS02SessionState = create<S02SessionState>((set, get) => ({
  scenarioId: S02_SCENARIO_ID,
  stage: 'sbi',

  inputs: { ...EMPTY_INPUTS },

  managerCommitment: null,
  employeeCommitment: null,

  checkpointDate: '',
  checkpointInitiator: '',

  turns: [],
  lastViolations: [],

  requestStatus: 'idle',
  lastError: null,

  score: null,
  feedback: null,

  setInput: (stage, value) =>
    set((state) => ({
      inputs: { ...state.inputs, [stage]: value }
    })),

  setManagerCommitment: (commitment) => set({ managerCommitment: commitment }),
  setEmployeeCommitment: (commitment) => set({ employeeCommitment: commitment }),

  setCheckpoint: (date, initiator) =>
    set({ checkpointDate: date, checkpointInitiator: initiator }),

  beginRequest: () => set({ requestStatus: 'sending', lastError: null }),

  recordTurn: (turn, violations) =>
    set((state) => ({
      turns: state.turns.concat([turn]),
      lastViolations: violations,
      requestStatus: 'idle',
      lastError: null
    })),

  requestFailed: (message) => set({ requestStatus: 'error', lastError: message }),

  // The stage machine is the only route forward. A component cannot skip
  // to scoring by setting state directly, because advance() consults it.
  advance: () => {
    const current = get().stage;
    const next = nextStage(current);
    if (next && canTransition(current, next)) {
      set({ stage: next, lastViolations: [] });
    }
  },

  goToStage: (stage) => {
    const current = get().stage;
    if (canTransition(current, stage)) {
      set({ stage });
    }
  },

  restoreStage: (stage) => set({ stage, lastViolations: [] }),

  setScore: (score) => set({ score }),
  setFeedback: (feedback) => set({ feedback }),

  resetSession: () =>
    set({
      stage: 'sbi',
      inputs: { ...EMPTY_INPUTS },
      managerCommitment: null,
      employeeCommitment: null,
      checkpointDate: '',
      checkpointInitiator: '',
      turns: [],
      lastViolations: [],
      requestStatus: 'idle',
      lastError: null,
      score: null,
      feedback: null
    })
}));

/** Assembles the run input the scoring engine consumes. */
export function currentRunInput(state: S02SessionState) {
  return {
    sbi: state.inputs.sbi,
    exploration: state.inputs.exploration,
    hypotheses: state.inputs.hypotheses,
    managerCommitment: state.managerCommitment,
    employeeCommitment: state.employeeCommitment,
    closing: state.inputs.closing,
    checkpointDate: state.checkpointDate,
    checkpointInitiator: state.checkpointInitiator
  };
}

export type { ScoreTier };
