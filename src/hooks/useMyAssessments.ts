// src/hooks/useMyAssessments.ts
//
// Loads the signed-in user's own MT-S02 assessment records for the My
// progress screen. A failed read is its own state: it is never presented
// as an empty history.

import { useCallback, useEffect, useState } from 'react';

import { StoredAssessment, listMyAssessments } from '../engine/assessmentRecords';
import { S02_SCENARIO_ID } from '../data/scenarioRegistry';
import { useAuthState } from '../store/authState';

export type MyAssessmentsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; records: StoredAssessment[]; unreadable: number };

export function useMyAssessments(): MyAssessmentsState & { retry: () => void } {
  const uid = useAuthState((state) => (state.user ? state.user.uid : null));
  const [state, setState] = useState<MyAssessmentsState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!uid) {
      setState({ status: 'error', message: 'Sign in to see your progress.' });
      return;
    }

    let current = true;
    setState({ status: 'loading' });

    listMyAssessments(uid, S02_SCENARIO_ID).then((result) => {
      if (!current) {
        return;
      }
      setState(
        result.ok
          ? { status: 'ready', records: result.records, unreadable: result.unreadable }
          : { status: 'error', message: result.message }
      );
    });

    return () => {
      current = false;
    };
  }, [uid, attempt]);

  return { ...state, retry };
}
