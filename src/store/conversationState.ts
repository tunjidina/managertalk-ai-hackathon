import { create } from 'zustand';

// -----------------------------
// Types
// -----------------------------

export type ConversationStage =
  | 'opening'
  | 'performance_sbi'
  | 'exploration'
  | 'commitments'
  | 'closing'
  | 'completed';

export type ConversationBranch =
  | 'guarded'
  | 'factual_challenge'
  | 'partial_openness'
  | 'polite_disengagement';

export type FeedbackTier = 'good' | 'mid' | 'poor';

export interface Commitment {
  action: string;
  owner: 'manager' | 'employee';
  date: string;
}

export interface Scores {
  clarity: number;
  empathy: number;
  directness: number;
}

export interface ScoreResult {
  tier: FeedbackTier;
  clarity: number;
  empathy: number;
  directness: number;
}

export interface ConversationState {
  stage: ConversationStage;
  branch: ConversationBranch | null;

  // Conversation flow tracking
  lastManagerMessage: string;
  failure: boolean;
  failureReason: string | null;

  // Commitments
  managerCommitment: Commitment | null;
  employeeCommitment: Commitment | null;

  // Scoring
  scores: Scores;
  scoreResult: ScoreResult | null;
  feedbackTier: FeedbackTier | null;

  // Actions
  setStage: (stage: ConversationStage) => void;
  setBranch: (branch: ConversationBranch | null) => void;

  setLastManagerMessage: (msg: string) => void;
  setFailure: (failed: boolean, reason?: string | null) => void;

  setManagerCommitment: (commitment: Commitment) => void;
  setEmployeeCommitment: (commitment: Commitment) => void;

  setScores: (scores: Partial<Scores>) => void;
  setScoreResult: (result: ScoreResult) => void;
  setFeedbackTier: (tier: FeedbackTier) => void;

  resetConversation: () => void;
}

// -----------------------------
// Zustand Store
// -----------------------------

export const useConversationState = create<ConversationState>((set) => ({
  stage: 'opening',
  branch: null,

  lastManagerMessage: '',
  failure: false,
  failureReason: null,

  managerCommitment: null,
  employeeCommitment: null,

  scores: {
    clarity: 0,
    empathy: 0,
    directness: 0,
  },

  scoreResult: null,
  feedbackTier: null,

  setStage: (stage) => set({ stage }),
  setBranch: (branch) => set({ branch }),

  setLastManagerMessage: (msg) => set({ lastManagerMessage: msg }),
  setFailure: (failed, reason = null) =>
    set({ failure: failed, failureReason: reason }),

  setManagerCommitment: (commitment) => set({ managerCommitment: commitment }),
  setEmployeeCommitment: (commitment) => set({ employeeCommitment: commitment }),

  setScores: (scores) =>
    set((state) => ({
      scores: { ...state.scores, ...scores },
    })),

  setScoreResult: (result) => set({ scoreResult: result }),
  setFeedbackTier: (tier) => set({ feedbackTier: tier }),

  resetConversation: () =>
    set({
      stage: 'opening',
      branch: null,
      lastManagerMessage: '',
      failure: false,
      failureReason: null,
      managerCommitment: null,
      employeeCommitment: null,
      scores: { clarity: 0, empathy: 0, directness: 0 },
      scoreResult: null,
      feedbackTier: null,
    }),
}));
