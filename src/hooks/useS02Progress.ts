// src/hooks/useS02Progress.ts
//
// The blueprint-flow twin of useScenarioProgress.
//
// Same Firestore collection, same engine, same document shape — only the
// scenario id and the vocabulary of `currentStep` differ. Two hooks rather
// than one because the two flows disagree about what a step IS: MT-S01's
// steps are ScenarioStep values driven by navigationState, MT-S02's are
// S02Stage values driven by its own stage machine. Forcing one hook to
// serve both would mean a mapping that is wrong in one direction.
//
// Only one of the two is ever active: each gates on the active scenario's
// flowKind.

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuthState } from '../store/authState';
import { useActiveScenarioState } from '../store/activeScenarioState';
import { useScenarioProgressState } from '../store/scenarioProgressState';
import { useS02SessionState } from '../store/s02SessionState';
import { S02Stage, S02_STAGE_ORDER } from '../types/scenarioBlueprint';
import { ScenarioProgressStatus } from '../types/scenarioProgress';
import {
  loadScenarioState,
  saveScenarioState,
  markScenarioCompleted
} from '../engine/scenarioState';
import { logAnalyticsEvent } from '../engine/analytics';

export interface UseS02ProgressOptions {
  enabled: boolean;
  /** When false, a saved stage is loaded but the session is not moved to it. */
  resume: boolean;
}

export interface UseS02ProgressApi {
  status: ScenarioProgressStatus;
  saving: boolean;
  lastError: string | null;
  completed: boolean;
  retry: () => void;
}

const FINAL_S02_STAGE: S02Stage = 'feedback';

/** Validates a persisted value against MT-S02's own stage vocabulary. */
function isS02Stage(value: unknown): value is S02Stage {
  return (
    typeof value === 'string' &&
    S02_STAGE_ORDER.indexOf(value as S02Stage) !== -1
  );
}

export function useS02Progress(options: UseS02ProgressOptions): UseS02ProgressApi {
  const { enabled, resume } = options;

  const user = useAuthState((state) => state.user);
  const uid = user ? user.uid : null;

  const scenarioId = useActiveScenarioState((state) => state.scenarioId);
  const flowKind = useActiveScenarioState((state) => state.flowKind);

  const active = enabled && flowKind === 'blueprint';

  const stage = useS02SessionState((state) => state.stage);
  const restoreStage = useS02SessionState((state) => state.restoreStage);

  const status = useScenarioProgressState((state) => state.status);
  const saving = useScenarioProgressState((state) => state.saving);
  const lastError = useScenarioProgressState((state) => state.lastError);
  const completed = useScenarioProgressState((state) => state.completed);

  const beginLoad = useScenarioProgressState((state) => state.beginLoad);
  const loadFailed = useScenarioProgressState((state) => state.loadFailed);
  const beginSave = useScenarioProgressState((state) => state.beginSave);
  const saveFailed = useScenarioProgressState((state) => state.saveFailed);

  const loadedKeyRef = useRef<string | null>(null);
  const savedStageRef = useRef<S02Stage | null>(null);
  const completedRef = useRef(false);

  const [retryToken, setRetryToken] = useState(0);

  const retry = useCallback(() => {
    loadedKeyRef.current = null;
    setRetryToken((token) => token + 1);
  }, []);

  // -----------------------------
  // 1. Load
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

      // currentStepRaw, not currentStep: the coerced field collapses every
      // MT-S02 stage it does not recognise to 'overview', which would drop
      // a manager at stage four back to stage one.
      const savedStage = isS02Stage(result.data.currentStepRaw)
        ? (result.data.currentStepRaw as S02Stage)
        : 'sbi';

      savedStageRef.current = savedStage;
      completedRef.current = result.data.completed;

      useScenarioProgressState.setState({
        status: 'ready',
        scenarioId,
        completed: result.data.completed,
        lastError: null
      });

      if (resume && savedStage !== useS02SessionState.getState().stage) {
        restoreStage(savedStage);
      }
    });

    return () => {
      live = false;
      if (
        loadedKeyRef.current === key &&
        useScenarioProgressState.getState().status === 'loading'
      ) {
        loadedKeyRef.current = null;
      }
    };
  }, [active, uid, scenarioId, status, resume, retryToken, beginLoad, loadFailed, restoreStage]);

  // -----------------------------
  // 2. Save on stage change, 3. Mark completed
  // -----------------------------

  useEffect(() => {
    if (!active || !uid) {
      return;
    }

    if (status !== 'ready') {
      return;
    }

    if (savedStageRef.current === stage) {
      return;
    }

    const reachedEnd = stage === FINAL_S02_STAGE;
    const nextCompleted = completedRef.current || reachedEnd;

    savedStageRef.current = stage;
    completedRef.current = nextCompleted;

    let live = true;
    beginSave();

    const write = reachedEnd
      ? markScenarioCompleted(uid, scenarioId)
      : saveScenarioState(uid, scenarioId, stage, nextCompleted);

    write.then((result) => {
      if (!live) {
        return;
      }

      if (result.ok) {
        useScenarioProgressState.setState({
          saving: false,
          scenarioId,
          completed: nextCompleted,
          lastError: null
        });
        void logAnalyticsEvent(uid, scenarioId, 'step_reached', stage);
        return;
      }

      savedStageRef.current = null;
      saveFailed(result.message);
      void logAnalyticsEvent(uid, scenarioId, 'progress_sync_failed', stage);
    });

    return () => {
      live = false;
    };
  }, [active, uid, scenarioId, status, stage, beginSave, saveFailed]);

  // -----------------------------
  // 3. Clear refs on sign-out
  // -----------------------------

  useEffect(() => {
    if (uid) {
      return;
    }
    loadedKeyRef.current = null;
    savedStageRef.current = null;
    completedRef.current = false;
  }, [uid]);

  return { status, saving, lastError, completed, retry };
}
