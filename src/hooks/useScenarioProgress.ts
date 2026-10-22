// src/hooks/useScenarioProgress.ts
//
// One hook, mounted once in App.tsx, that keeps Firestore in step with the
// navigation store.
//
// Why here and not in each screen:
// ManagerTalk has no router. Every screen change is one value changing in
// navigationState, which means a single subscription sees all seven
// transitions. Putting a useEffect in each of the seven screens would be
// seven copies of the same code, seven chances for the guards to drift,
// and a save that silently stops working the day a screen is renamed.
//
// The screens are not modified at all. They keep calling
// setCurrentScreen(...) exactly as they do today.

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuthState } from '../store/authState';
import { useNavigationState } from '../store/navigationState';
import { useScenarioProgressState } from '../store/scenarioProgressState';
import { useActiveScenarioState } from '../store/activeScenarioState';
import {
  FINAL_STEP,
  ScenarioStep,
  ScenarioProgressStatus,
  isLegacyScreen,
  screenToStep,
  stepToScreen
} from '../types/scenarioProgress';
import {
  loadScenarioState,
  saveScenarioState,
  markScenarioCompleted
} from '../engine/scenarioState';
import { logAnalyticsEvent } from '../engine/analytics';

export interface UseScenarioProgressOptions {
  /**
   * Gate for the whole hook. Pass false until the user is signed in AND
   * any local-session restore prompt has been answered — otherwise the
   * Firestore read races the localStorage restore and one overwrites the
   * other.
   */
  enabled: boolean;

  /**
   * When true, a saved step navigates the app there on load. Pass false
   * when the user has just chosen to continue a locally saved session:
   * that snapshot holds the full conversation, so it outranks the step
   * pointer in Firestore.
   */
  resume: boolean;
}

export interface UseScenarioProgressApi {
  status: ScenarioProgressStatus;
  saving: boolean;
  lastError: string | null;
  completed: boolean;
  /** Re-runs the initial load after a failure. */
  retry: () => void;
}

export function useScenarioProgress(
  options: UseScenarioProgressOptions
): UseScenarioProgressApi {
  const { enabled, resume } = options;

  const user = useAuthState((state) => state.user);
  const uid = user ? user.uid : null;

  // The scenario id is no longer a constant. It comes from the selector,
  // and the document this hook reads and writes is keyed by it.
  const scenarioId = useActiveScenarioState((state) => state.scenarioId);
  const flowKind = useActiveScenarioState((state) => state.flowKind);

  // This hook tracks the legacy (MT-S01) flow only. A blueprint scenario's
  // stages are not ScenarioStep values, and screenToStep would map them
  // onto the wrong step — useS02Progress handles those.
  const active = enabled && flowKind === 'legacy';

  const currentScreen = useNavigationState((state) => state.currentScreen);
  const setCurrentScreen = useNavigationState((state) => state.setCurrentScreen);

  const status = useScenarioProgressState((state) => state.status);
  const saving = useScenarioProgressState((state) => state.saving);
  const lastError = useScenarioProgressState((state) => state.lastError);
  const completed = useScenarioProgressState((state) => state.completed);

  const beginLoad = useScenarioProgressState((state) => state.beginLoad);
  const loadSucceeded = useScenarioProgressState((state) => state.loadSucceeded);
  const loadFailed = useScenarioProgressState((state) => state.loadFailed);
  const beginSave = useScenarioProgressState((state) => state.beginSave);
  const saveSucceeded = useScenarioProgressState((state) => state.saveSucceeded);
  const saveFailed = useScenarioProgressState((state) => state.saveFailed);

  // Which uid+scenario has been loaded already. Keying on uid alone was
  // correct with one scenario and wrong with two: switching scenarios
  // would leave the previous scenario's step in the store.
  const loadedKeyRef = useRef<string | null>(null);

  // The step Firestore already holds. Compared against the visible screen
  // to decide whether a write is actually needed.
  const savedStepRef = useRef<ScenarioStep | null>(null);

  // Sticky: once the scenario is completed it stays completed, even if the
  // user navigates back through the screens afterwards.
  const completedRef = useRef(false);

  const [retryToken, setRetryToken] = useState(0);

  const retry = useCallback(() => {
    loadedKeyRef.current = null;
    setRetryToken((token) => token + 1);
  }, []);

  // -----------------------------
  // 1. Load on entry
  // -----------------------------

  useEffect(() => {
    if (!active || !uid) {
      return;
    }

    const key = uid + '_' + scenarioId;

    // The memo that stops this effect refetching on every render. It must
    // NOT survive a reset: the selector calls resetProgress() when
    // switching scenarios, which puts the store back to 'idle'. Without
    // the status check, returning to a scenario already loaded once this
    // session hits this early return, never calls beginLoad(), and leaves
    // the store on 'idle' forever — which App renders as a permanent
    // loading screen.
    if (loadedKeyRef.current === key && status !== 'idle') {
      return;
    }

    loadedKeyRef.current = key;

    let live = true;
    beginLoad();

    loadScenarioState(uid, scenarioId).then((result) => {
      if (!live) {
        return;
      }

      if (!result.ok) {
        loadFailed(result.message);
        return;
      }

      const saved = result.data;

      savedStepRef.current = saved.currentStep;
      completedRef.current = saved.completed;
      loadSucceeded(saved.currentStep, saved.completed);

      // Only move the user if the saved position differs from where the
      // app currently is. Setting the same screen would be a no-op render
      // but is skipped anyway to keep the intent obvious.
      if (resume && saved.currentStep !== screenToStep(currentScreen)) {
        setCurrentScreen(stepToScreen(saved.currentStep));
      }
    });

    return () => {
      live = false;

      // React 18/19 StrictMode mounts, unmounts and remounts effects in
      // development. Without this, the first run would be discarded while
      // loadedKeyRef still blocked the second, leaving status stuck on
      // 'loading' forever in dev.
      if (
        loadedKeyRef.current === key &&
        useScenarioProgressState.getState().status === 'loading'
      ) {
        loadedKeyRef.current = null;
      }
    };
    // currentScreen is read, not tracked: including it would re-run the
    // load every time the user changes screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, uid, scenarioId, status, resume, retryToken, beginLoad, loadSucceeded, loadFailed, setCurrentScreen]);

  // -----------------------------
  // 2. Save on step change  3. Mark completed
  // -----------------------------

  useEffect(() => {
    if (!active || !uid) {
      return;
    }

    // Never write before the read has finished. Saving first would push
    // the app's default 'overview' over a real saved step.
    if (status !== 'ready') {
      return;
    }

    // Only MT-S01's own screens move MT-S01's step. The scenario list and
    // every MT-S02 screen map to a step for type exhaustiveness, not
    // because being there means the manager has gone back to stage one.
    if (!isLegacyScreen(currentScreen)) {
      return;
    }

    const step = screenToStep(currentScreen);

    if (savedStepRef.current === step) {
      return;
    }

    const reachedEnd = step === FINAL_STEP;
    const nextCompleted = completedRef.current || reachedEnd;

    // Claim the step immediately. Two rapid transitions must not both fire
    // a write for the same value.
    savedStepRef.current = step;
    completedRef.current = nextCompleted;

    let live = true;
    beginSave();

    const write = reachedEnd
      ? markScenarioCompleted(uid, scenarioId)
      : saveScenarioState(uid, scenarioId, step, nextCompleted);

    write.then((result) => {
      if (!live) {
        return;
      }

      if (result.ok) {
        saveSucceeded(step, nextCompleted);

        // Fire-and-forget. Deliberately not awaited and not error-handled:
        // logAnalyticsEvent never throws, and a failed event must not
        // affect a save that already succeeded.
        void logAnalyticsEvent(uid, scenarioId, 'step_reached', step);
        return;
      }

      // Release the claim so a later navigation retries the write.
      savedStepRef.current = null;
      saveFailed(result.message);

      // Logged even though the save failed — if the write failed because
      // of permissions or connectivity this will usually fail too, which
      // is itself the signal. Same fire-and-forget contract.
      void logAnalyticsEvent(uid, scenarioId, 'progress_sync_failed', step);
    });

    return () => {
      live = false;
    };
  }, [active, uid, scenarioId, status, currentScreen, beginSave, saveSucceeded, saveFailed]);

  // -----------------------------
  // 3. Clear refs when the user changes
  // -----------------------------

  useEffect(() => {
    if (uid) {
      return;
    }
    loadedKeyRef.current = null;
    savedStepRef.current = null;
    completedRef.current = false;
  }, [uid]);

  return { status, saving, lastError, completed, retry };
}
