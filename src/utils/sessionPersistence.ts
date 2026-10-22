// src/utils/sessionPersistence.ts
//
// Session autosave + restore for ManagerTalk.
//
// Reads and writes the existing Zustand stores through their public
// getState / setState / subscribe API. No store, engine or JSON file is
// modified. localStorage is the only storage used.

import {
  useConversationState,
  ConversationStage,
  ConversationBranch,
  FeedbackTier,
  Commitment,
  Scores,
  ScoreResult
} from '../store/conversationState';

import { useNavigationState, Screen } from '../store/navigationState';

// -----------------------------
// Storage key + schema version
// -----------------------------

const STORAGE_KEY = 'managertalk.session';
const SCHEMA_VERSION = 1;

// -----------------------------
// Snapshot shape
// -----------------------------

export interface SavedConversation {
  stage: ConversationStage;
  branch: ConversationBranch | null;
  lastManagerMessage: string;
  failure: boolean;
  failureReason: string | null;
  managerCommitment: Commitment | null;
  employeeCommitment: Commitment | null;
  scores: Scores;
  scoreResult: ScoreResult | null;
  feedbackTier: FeedbackTier | null;
}

export interface SavedNavigation {
  currentScreen: Screen;
}

export interface SavedSession {
  version: number;
  savedAt: number;
  conversation: SavedConversation;
  navigation: SavedNavigation;
}

// -----------------------------
// Allowed values (mirrors the store's own unions)
// -----------------------------

const STAGES: ConversationStage[] = [
  'opening',
  'performance_sbi',
  'exploration',
  'commitments',
  'closing',
  'completed'
];

const BRANCHES: ConversationBranch[] = [
  'guarded',
  'factual_challenge',
  'partial_openness',
  'polite_disengagement'
];

const TIERS: FeedbackTier[] = ['good', 'mid', 'poor'];

const SCREENS: Screen[] = [
  'scenario_overview',
  'overview',
  'evidence',
  'conversation_flow',
  'conversation',
  'commitment_builder',
  'closing',
  'scoring',
  'feedback',
  'certificate',
  'scenario_select',
  'screen_profile',
  's02_sbi',
  's02_exploration',
  's02_hypotheses',
  's02_commitments',
  's02_closing',
  's02_scoring',
  's02_feedback'
];

// -----------------------------
// Validation helpers
// -----------------------------

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === 'string';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function isCommitment(value: unknown): value is Commitment {
  if (value === null) return true;
  if (!isObject(value)) return false;
  return (
    isString(value.action) &&
    (value.owner === 'manager' || value.owner === 'employee') &&
    isString(value.date)
  );
}

function isScores(value: unknown): value is Scores {
  if (!isObject(value)) return false;
  return (
    isFiniteNumber(value.clarity) &&
    isFiniteNumber(value.empathy) &&
    isFiniteNumber(value.directness)
  );
}

function isScoreResult(value: unknown): value is ScoreResult {
  if (value === null) return true;
  if (!isObject(value)) return false;
  return (
    TIERS.indexOf(value.tier as FeedbackTier) !== -1 &&
    isFiniteNumber(value.clarity) &&
    isFiniteNumber(value.empathy) &&
    isFiniteNumber(value.directness)
  );
}

function isValidSession(value: unknown): value is SavedSession {
  if (!isObject(value)) return false;
  if (value.version !== SCHEMA_VERSION) return false;
  if (!isFiniteNumber(value.savedAt)) return false;

  const conversation = value.conversation;
  const navigation = value.navigation;

  if (!isObject(conversation) || !isObject(navigation)) return false;

  if (SCREENS.indexOf(navigation.currentScreen as Screen) === -1) return false;
  if (STAGES.indexOf(conversation.stage as ConversationStage) === -1) return false;

  if (
    conversation.branch !== null &&
    BRANCHES.indexOf(conversation.branch as ConversationBranch) === -1
  ) {
    return false;
  }

  if (
    conversation.feedbackTier !== null &&
    TIERS.indexOf(conversation.feedbackTier as FeedbackTier) === -1
  ) {
    return false;
  }

  if (!isString(conversation.lastManagerMessage)) return false;
  if (typeof conversation.failure !== 'boolean') return false;
  if (conversation.failureReason !== null && !isString(conversation.failureReason)) {
    return false;
  }

  if (!isCommitment(conversation.managerCommitment)) return false;
  if (!isCommitment(conversation.employeeCommitment)) return false;
  if (!isScores(conversation.scores)) return false;
  if (!isScoreResult(conversation.scoreResult)) return false;

  return true;
}

// -----------------------------
// Read / write
// -----------------------------

export function loadSession(): SavedSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!isValidSession(parsed)) {
      // Unreadable or outdated snapshot: drop it rather than half-restore.
      clearSession();
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function hasSavedSession(): boolean {
  return loadSession() !== null;
}

export function saveSession(): void {
  try {
    const conversation = useConversationState.getState();
    const navigation = useNavigationState.getState();

    const snapshot: SavedSession = {
      version: SCHEMA_VERSION,
      savedAt: Date.now(),
      conversation: {
        stage: conversation.stage,
        branch: conversation.branch,
        lastManagerMessage: conversation.lastManagerMessage,
        failure: conversation.failure,
        failureReason: conversation.failureReason,
        managerCommitment: conversation.managerCommitment,
        employeeCommitment: conversation.employeeCommitment,
        scores: conversation.scores,
        scoreResult: conversation.scoreResult,
        feedbackTier: conversation.feedbackTier
      },
      navigation: {
        currentScreen: navigation.currentScreen
      }
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Private mode, quota exceeded, storage disabled: autosave is best-effort.
  }
}

export function clearSession(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore: nothing else to do if storage is unavailable.
  }
}

// -----------------------------
// Restore
// -----------------------------

export function applySession(session: SavedSession): void {
  // setState on a Zustand store merges a partial state; the stores'
  // own action functions are left untouched.
  useConversationState.setState({
    stage: session.conversation.stage,
    branch: session.conversation.branch,
    lastManagerMessage: session.conversation.lastManagerMessage,
    failure: session.conversation.failure,
    failureReason: session.conversation.failureReason,
    managerCommitment: session.conversation.managerCommitment,
    employeeCommitment: session.conversation.employeeCommitment,
    scores: session.conversation.scores,
    scoreResult: session.conversation.scoreResult,
    feedbackTier: session.conversation.feedbackTier
  });

  useNavigationState.setState({
    currentScreen: session.navigation.currentScreen
  });
}

// -----------------------------
// Autosave
// -----------------------------

/**
 * Subscribes to both stores and writes a snapshot on every change.
 * Returns an unsubscribe function.
 *
 * Start this only AFTER the restore decision has been made, otherwise the
 * app's initial empty state overwrites the saved snapshot on first render.
 */
export function startAutosave(): () => void {
  const unsubscribeConversation = useConversationState.subscribe(saveSession);
  const unsubscribeNavigation = useNavigationState.subscribe(saveSession);

  return () => {
    unsubscribeConversation();
    unsubscribeNavigation();
  };
}