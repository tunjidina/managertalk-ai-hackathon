// src/utils/sessionPersistence.test.ts
//
// Focused regression tests for the MT-S01 / MT-S02 session-recovery collision.
//
// Background: sessionPersistence is the MT-S01 localStorage autosave.
// It subscribes to useNavigationState and writes a snapshot on every screen
// change. If it captured an s02_* screen, "Continue where you left off?" would
// appear on refresh, set localSessionRestored=true in App, and silently block
// Firestore from restoring the correct MT-S02 stage.
//
// The fix: saveSession() is a no-op when the current screen is an s02_* screen.

import {
  saveSession,
  loadSession,
  clearSession,
  hasSavedSession
} from './sessionPersistence';
import { useNavigationState } from '../store/navigationState';
import { useConversationState } from '../store/conversationState';

// ---------------------------------------------------------------------------
// localStorage stub (jsdom provides window.localStorage; Jest runs with jsdom)
// ---------------------------------------------------------------------------

beforeEach(() => {
  window.localStorage.clear();
  // Reset both stores to their initial state between tests.
  useNavigationState.setState({ currentScreen: 'scenario_overview' });
  useConversationState.setState({
    stage: 'opening',
    branch: null,
    lastManagerMessage: '',
    failure: false,
    failureReason: null,
    managerCommitment: null,
    employeeCommitment: null,
    scores: { clarity: 0, empathy: 0, directness: 0 },
    scoreResult: null,
    feedbackTier: null
  });
});

afterEach(() => {
  window.localStorage.clear();
});

// ---------------------------------------------------------------------------
// MT-S02 screens must NOT be saved to localStorage
// ---------------------------------------------------------------------------

describe('saveSession: MT-S02 screens are excluded from autosave', () => {
  const s02Screens = [
    's02_sbi',
    's02_exploration',
    's02_hypotheses',
    's02_commitments',
    's02_closing',
    's02_scoring',
    's02_feedback'
  ] as const;

  test.each(s02Screens)(
    'does not write to localStorage when screen is %s',
    (screen) => {
      useNavigationState.setState({ currentScreen: screen });
      saveSession();
      expect(window.localStorage.getItem('managertalk.session')).toBeNull();
    }
  );

  test('a prior MT-S01 snapshot is not overwritten by an S02 navigation', () => {
    // First capture a valid MT-S01 snapshot.
    useNavigationState.setState({ currentScreen: 'conversation' });
    saveSession();
    const original = window.localStorage.getItem('managertalk.session');
    expect(original).not.toBeNull();

    // Navigate to MT-S02. saveSession() must not touch the snapshot.
    useNavigationState.setState({ currentScreen: 's02_sbi' });
    saveSession();
    expect(window.localStorage.getItem('managertalk.session')).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// MT-S01 screens ARE still saved (regression guard — existing behaviour)
// ---------------------------------------------------------------------------

describe('saveSession: MT-S01 screens are still captured', () => {
  const mt01Screens = [
    'scenario_overview',
    'evidence',
    'conversation_flow',
    'conversation',
    'commitment_builder',
    'closing',
    'scoring',
    'feedback',
    'scenario_select'
  ] as const;

  test.each(mt01Screens)(
    'writes to localStorage when screen is %s',
    (screen) => {
      useNavigationState.setState({ currentScreen: screen });
      saveSession();
      expect(window.localStorage.getItem('managertalk.session')).not.toBeNull();
    }
  );
});

// ---------------------------------------------------------------------------
// hasSavedSession and loadSession return null after navigating into MT-S02
// ---------------------------------------------------------------------------

describe('loadSession: no snapshot produced when leaving for MT-S02', () => {
  test('hasSavedSession is false when the only save attempt was from an S02 screen', () => {
    useNavigationState.setState({ currentScreen: 's02_sbi' });
    saveSession();
    expect(hasSavedSession()).toBe(false);
  });

  test('loadSession returns null when the only save attempt was from an S02 screen', () => {
    useNavigationState.setState({ currentScreen: 's02_exploration' });
    saveSession();
    expect(loadSession()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// clearSession is unaffected
// ---------------------------------------------------------------------------

describe('clearSession: removes any existing snapshot regardless of screen', () => {
  test('removes a previously written MT-S01 snapshot', () => {
    useNavigationState.setState({ currentScreen: 'conversation' });
    saveSession();
    expect(hasSavedSession()).toBe(true);
    clearSession();
    expect(hasSavedSession()).toBe(false);
  });
});
