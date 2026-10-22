import React, { Suspense, useEffect, useState } from 'react';
import { useNavigationState, Screen } from './store/navigationState';
import { useConversationState } from './store/conversationState';

import { signOut } from 'firebase/auth';
import { getFirebaseAuth } from './lib/firebase';
import { useAuthState } from './store/authState';

import { useScenarioProgress } from './hooks/useScenarioProgress';
import { useScenarioProgressState } from './store/scenarioProgressState';
import { logAnalyticsEvent } from './engine/analytics';
import { screenToStep } from './types/scenarioProgress';
import { useActiveScenarioState } from './store/activeScenarioState';
import { useS02Progress } from './hooks/useS02Progress';
import { useS02SessionState } from './store/s02SessionState';
import { S02_STAGE_TO_SCREEN, isS02Screen } from './screens/s02/s02Navigation';

import AuthGate from './components/AuthGate';
import ErrorBoundary from './components/ErrorBoundary';
import LoadingOverlay from './components/LoadingOverlay';
import LoadingFallback from './components/LoadingFallback';
import ResetModal from './components/ResetModal';
import RestoreModal from './components/RestoreModal';

import {
  SavedSession,
  loadSession,
  applySession,
  clearSession,
  startAutosave
} from './utils/sessionPersistence';

// Screens
import ScenarioOverviewScreen from './screens/ScenarioOverviewScreen';
import EvidenceScreen from './screens/EvidenceScreen';
import ConversationFlowScreen from './screens/ConversationFlowScreen';
import CommitmentBuilderScreen from './screens/CommitmentBuilderScreen';
import ClosingScreen from './screens/ClosingScreen';
import ScoringScreen from './screens/ScoringScreen';
import FeedbackScreen from './screens/FeedbackScreen';
import CertificateScreen from './screens/CertificateScreen';
import ScenarioSelectScreen from './screens/ScenarioSelectScreen';
import ProfileScreen from './screens/ProfileScreen';
import S02SbiScreen from './screens/s02/S02SbiScreen';
import S02ExplorationScreen from './screens/s02/S02ExplorationScreen';
import S02HypothesesScreen from './screens/s02/S02HypothesesScreen';
import S02CommitmentsScreen from './screens/s02/S02CommitmentsScreen';
import S02ClosingScreen from './screens/s02/S02ClosingScreen';
import S02ScoringScreen from './screens/s02/S02ScoringScreen';
import S02FeedbackScreen from './screens/s02/S02FeedbackScreen';

// -----------------------------
// Display-only step metadata (no navigation)
// -----------------------------

const TOTAL_STEPS = 7;

const stepInfo: Record<Screen, { step: number; label: string }> = {
  scenario_overview: { step: 1, label: 'Scenario Overview' },
  overview: { step: 1, label: 'Scenario Overview' },
  evidence: { step: 2, label: 'Evidence Review' },
  conversation_flow: { step: 3, label: 'Conversation' },
  conversation: { step: 3, label: 'Conversation' },
  commitment_builder: { step: 4, label: 'Commitments' },
  closing: { step: 5, label: 'Closing' },
  scoring: { step: 6, label: 'Scoring' },
  feedback: { step: 7, label: 'Feedback' },

  // Step 7, not 8: the certificate is a post-completion artefact, not an
  // eighth thing to do. Numbering it 8 would make Feedback read "7 of 8"
  // and show 88% at the exact moment the user has finished the scenario.
  certificate: { step: 7, label: 'Certificate' },

  // MT-S02 has five authored stages plus scoring and feedback, so its
  // labels come from its own flow rather than MT-S01's seven steps.
  scenario_select: { step: 1, label: 'Scenarios' },
  screen_profile: { step: 1, label: 'Profile' },
  s02_sbi: { step: 1, label: 'SBI' },
  s02_exploration: { step: 2, label: 'Exploration' },
  s02_hypotheses: { step: 3, label: 'Hypotheses' },
  s02_commitments: { step: 4, label: 'Commitments' },
  s02_closing: { step: 5, label: 'Closing' },
  s02_scoring: { step: 6, label: 'Scoring' },
  s02_feedback: { step: 7, label: 'Feedback' }
};

/**
 * The only screens that show the signed-in email.
 *
 * A whitelist, not a blacklist, and deliberately so: with a blacklist, a
 * screen added later shows the email until someone remembers to exclude
 * it. This way a new screen hides it by default and has to opt in.
 *
 * The selector and the profile screen are the two places where "which
 * account am I in?" is a question worth answering. Neither is a training
 * screen the user might be sharing or projecting.
 */
const SCREENS_SHOWING_EMAIL: Screen[] = ['scenario_select', 'screen_profile'];

const App: React.FC = () => {
  const { currentScreen, resetNavigation, setCurrentScreen } = useNavigationState();
  const { resetConversation } = useConversationState();
  const { status: authStatus, user } = useAuthState();

  const signedIn = authStatus === 'signed_in';

  // Simple local state for the global overlay. Wrap any future async work
  // (fetching a scenario, saving a session) in setIsLoading(true/false).
  const [isLoading, setIsLoading] = useState(false);

  // Confirmation gate for user-initiated resets.
  const [resetRequested, setResetRequested] = useState(false);

  // Session restore: pendingSession holds the snapshot awaiting a decision.
  const [pendingSession, setPendingSession] = useState<SavedSession | null>(null);
  const [restoreResolved, setRestoreResolved] = useState(false);

  // True when the user chose "Continue" on the local snapshot. That snapshot
  // carries the whole conversation, so it outranks the step pointer stored
  // in Firestore — the cloud step must not yank them somewhere else.
  const [localSessionRestored, setLocalSessionRestored] = useState(false);

  const resetProgress = useScenarioProgressState((state) => state.resetProgress);

  // Which scenario is running. Every analytics call below uses this rather
  // than a constant, so an event fired during MT-S02 is not filed under
  // MT-S01.
  const scenarioId = useActiveScenarioState((state) => state.scenarioId);
  const flowKind = useActiveScenarioState((state) => state.flowKind);

  // Firestore progress. Held back until auth has resolved and the local
  // restore prompt has been answered, so the two restore paths never race.
  const cloudProgress = useScenarioProgress({
    enabled: signedIn && restoreResolved,
    resume: !localSessionRestored
  });

  // The blueprint-flow twin. Exactly one of the two hooks is ever active:
  // each gates internally on the active scenario's flowKind.
  const s02Progress = useS02Progress({
    enabled: signedIn && restoreResolved,
    resume: !localSessionRestored
  });

  const activeProgress = flowKind === 'blueprint' ? s02Progress : cloudProgress;

  const progressLoading =
    activeProgress.status === 'loading' || activeProgress.status === 'idle';

  // Look for a saved session once the user is signed in. Running this
  // before auth resolves would offer a scenario to a signed-out visitor.
  useEffect(() => {
    if (!signedIn) {
      return;
    }
    const saved = loadSession();
    if (saved) {
      setPendingSession(saved);
    } else {
      setRestoreResolved(true);
    }
  }, [signedIn]);

  // Autosave starts only after the restore decision, so the app's initial
  // empty state never overwrites a snapshot the user has not answered for.
  useEffect(() => {
    if (!signedIn || !restoreResolved) {
      return;
    }
    return startAutosave();
  }, [signedIn, restoreResolved]);

  // MT-S02: the stage machine decides, navigation follows. One direction
  // only — see screens/s02/s02Navigation.ts for why.
  const s02Stage = useS02SessionState((state) => state.stage);

  useEffect(() => {
    if (!isS02Screen(currentScreen)) {
      return;
    }
    const target = S02_STAGE_TO_SCREEN[s02Stage];
    if (target !== currentScreen) {
      setCurrentScreen(target);
    }
  }, [s02Stage, currentScreen, setCurrentScreen]);

  const renderScreen = () => {
    switch (currentScreen) {
      case 'scenario_overview':
        return <ScenarioOverviewScreen />;

      case 'evidence':
        return <EvidenceScreen />;

      case 'conversation_flow':
        return <ConversationFlowScreen />;

      case 'commitment_builder':
        return <CommitmentBuilderScreen />;

      case 'closing':
        return <ClosingScreen />;

      case 'scoring':
        return <ScoringScreen />;

      case 'feedback':
        return <FeedbackScreen />;

      case 'certificate':
        return <CertificateScreen />;

      case 'scenario_select':
        return <ScenarioSelectScreen />;

      case 'screen_profile':
        return <ProfileScreen />;

      // MT-S02. Which of these renders is decided by the S02 stage
      // machine, which the effect below follows.
      case 's02_sbi':
        return <S02SbiScreen />;

      case 's02_exploration':
        return <S02ExplorationScreen />;

      case 's02_hypotheses':
        return <S02HypothesesScreen />;

      case 's02_commitments':
        return <S02CommitmentsScreen />;

      case 's02_closing':
        return <S02ClosingScreen />;

      case 's02_scoring':
        return <S02ScoringScreen />;

      case 's02_feedback':
        return <S02FeedbackScreen />;

      default:
        return <ScenarioOverviewScreen />;
    }
  };

  // The actual reset: the stores' own reset actions.
  const performReset = () => {
    setIsLoading(true);
    resetConversation();
    resetNavigation();
    setIsLoading(false);
  };

  // User-initiated reset: ask first.
  const requestReset = () => setResetRequested(true);
  const cancelReset = () => setResetRequested(false);

  const confirmReset = () => {
    setResetRequested(false);

    // Logged before performReset(), so the step recorded is where the user
    // actually was when they reset — not 'overview', which is where
    // resetNavigation() is about to put them. Fire-and-forget.
    if (user) {
      void logAnalyticsEvent(
        user.uid,
        scenarioId,
        'scenario_reset',
        screenToStep(currentScreen)
      );
    }

    clearSession();
    performReset();
  };

  // Error-boundary recovery resets directly, without the confirmation step:
  // the boundary clears its own error state as soon as onReset returns, so a
  // pending dialog would let the broken screen render again behind it.
  const handleBoundaryReset = () => {
    clearSession();
    performReset();
  };

  // Restore decisions.
  const handleContinueSession = () => {
    if (pendingSession) {
      applySession(pendingSession);
      setLocalSessionRestored(true);
    }
    setPendingSession(null);
    setRestoreResolved(true);
  };

  const handleStartOver = () => {
    clearSession();
    performReset();
    setLocalSessionRestored(false);
    setPendingSession(null);
    setRestoreResolved(true);
  };

  // Sign-out also clears the saved scenario, so the next person on this
  // device does not inherit the previous user's run.
  const handleSignOut = async () => {
    // Logged first, while the user is still authenticated: signOut() below
    // revokes the token, and a Firestore write dispatched after that is
    // rejected. Fire-and-forget as specified — see the note in the handover
    // about the residual race if the write has not left the queue in time.
    if (user) {
      void logAnalyticsEvent(
        user.uid,
        scenarioId,
        'scenario_reset',
        screenToStep(currentScreen)
      );
    }

    clearSession();
    performReset();
    resetProgress();
    setRestoreResolved(false);
    setLocalSessionRestored(false);
    setPendingSession(null);
    await signOut(getFirebaseAuth());
  };

  const current = stepInfo[currentScreen] || stepInfo.scenario_overview;
  const progress = Math.round((current.step / TOTAL_STEPS) * 100);

  // The app has no router, so this is the equivalent of a route check:
  // navigationState.currentScreen IS the current location.
  const showEmail = SCREENS_SHOWING_EMAIL.indexOf(currentScreen) !== -1;

  return (
    <div style={styles.app}>
      {/* Top frame */}
      <header style={styles.topBar}>
        <div style={styles.topBarInner}>
          <div style={styles.brand}>
            <span style={styles.brandMark} aria-hidden="true" />
            <span style={styles.brandName}>ManagerTalk</span>
          </div>

          {signedIn && (
            <div style={styles.headerRight}>
              <div style={styles.progressGroup}>
                <span style={styles.stepText}>
                  Step {current.step} of {TOTAL_STEPS} · {current.label}
                </span>
                <div style={styles.progressTrack} aria-hidden="true">
                  <div style={{ ...styles.progressFill, width: `${progress}%` }} />
                </div>
              </div>

              <div style={styles.account}>
                {/* Sync indicator. Text only — no spinner in the header, so
                    a slow network never makes the chrome jump about. */}
                {activeProgress.lastError ? (
                  <button
                    style={styles.syncError}
                    onClick={activeProgress.retry}
                    title={activeProgress.lastError}
                  >
                    Progress not saved · Retry
                  </button>
                ) : activeProgress.saving ? (
                  <span style={styles.syncNote}>Saving…</span>
                ) : activeProgress.completed ? (
                  <span style={styles.syncNote}>Scenario complete</span>
                ) : null}

                {showEmail && user?.email && (
                  <span style={styles.accountEmail}>{user.email}</span>
                )}
                <button
                  style={styles.resetButton}
                  onClick={() => setCurrentScreen('scenario_select')}
                >
                  Scenarios
                </button>
                <button style={styles.resetButton} onClick={requestReset}>
                  Restart
                </button>
                <button style={styles.resetButton} onClick={handleSignOut}>
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Screen surface */}
      <main style={styles.main}>
        <AuthGate>
          <ErrorBoundary onReset={handleBoundaryReset}>
            <Suspense fallback={<LoadingFallback />}>
              {/* The screen is held back until Firestore has answered, so a
                  user resuming at step 5 never sees step 1 flash first.
                  A failed load still renders the app — progress saving is
                  degraded, the scenario is not. */}
              {progressLoading && restoreResolved ? (
                <LoadingFallback message="Loading your progress…" />
              ) : (
                renderScreen()
              )}
            </Suspense>
          </ErrorBoundary>
        </AuthGate>
      </main>

      {/* Global overlay */}
      <LoadingOverlay visible={isLoading} />

      {/* Session reset confirmation */}
      <ResetModal
        visible={resetRequested}
        onCancel={cancelReset}
        onConfirm={confirmReset}
      />

      {/* Saved session restore */}
      <RestoreModal
        visible={pendingSession !== null}
        savedAt={pendingSession ? pendingSession.savedAt : undefined}
        onContinue={handleContinueSession}
        onStartOver={handleStartOver}
      />
    </div>
  );
};

export default App;

// -----------------------------
// Styles
// -----------------------------

const styles: Record<string, React.CSSProperties> = {
  app: {
    width: '100%',
    minHeight: '100vh',
    backgroundColor: '#f5f6f7',
    fontFamily: 'Inter, sans-serif',
    color: '#1a1a1a',
    boxSizing: 'border-box'
  },
  topBar: {
    position: 'sticky',
    top: 0,
    zIndex: 10,
    backgroundColor: '#fff',
    borderBottom: '1px solid #e6e6e6'
  },
  topBarInner: {
    maxWidth: 'var(--mt-page-max-width, 900px)',
    margin: '0 auto',
    padding: '16px var(--mt-page-padding, 40px)',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '16px',
    alignItems: 'center',
    justifyContent: 'space-between',
    boxSizing: 'border-box'
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  brandMark: {
    width: '10px',
    height: '10px',
    borderRadius: '3px',
    backgroundColor: '#0078D4'
  },
  brandName: {
    fontSize: '16px',
    fontWeight: 700,
    letterSpacing: '-0.01em'
  },
  headerRight: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '20px'
  },
  progressGroup: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '6px',
    minWidth: '200px'
  },
  stepText: {
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: '#6b7280'
  },
  progressTrack: {
    width: '200px',
    height: '4px',
    borderRadius: '999px',
    backgroundColor: '#ededed',
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    borderRadius: '999px',
    backgroundColor: '#0078D4'
  },
  account: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '12px'
  },
  syncNote: {
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.04em',
    color: '#6b7280',
    whiteSpace: 'nowrap'
  },
  syncError: {
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    backgroundColor: '#fff5f5',
    color: '#9b2c2c',
    border: '1px solid #f3c2c2',
    borderRadius: '999px',
    cursor: 'pointer',
    whiteSpace: 'nowrap'
  },
  accountEmail: {
    fontSize: '13px',
    color: '#6b7280',
    maxWidth: '22ch',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  resetButton: {
    padding: '9px 16px',
    fontSize: '14px',
    fontWeight: 600,
    backgroundColor: '#fff',
    color: '#374151',
    border: '1px solid #d4d4d4',
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif'
  },
  main: {
    // Screens own their own 900px column and 40px padding,
    // so the shell adds surface and vertical rhythm only.
    paddingBottom: '48px'
  }
};