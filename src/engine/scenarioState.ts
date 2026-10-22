// src/engine/scenarioState.ts
//
// Firestore read/write for one user's progress through one scenario.
//
// Document path: userScenarioState/{userId}_{scenarioId}
// Deterministic ID means no query, no index, and one round trip per read.
//
// Nothing in here throws. Every call returns a discriminated result so the
// caller decides what a failure means. A progress-save failing must never
// take down a training session the user is halfway through.

import { doc, getDoc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';

import { getFirebaseDb } from '../lib/firebase';
import { logAnalyticsEvent } from './analytics';
import {
  ScenarioProgress,
  ScenarioStep,
  isScenarioStep
} from '../types/scenarioProgress';

// -----------------------------
// Result type
// -----------------------------

export type ScenarioStateErrorCode =
  | 'permission-denied'
  | 'unauthenticated'
  | 'unavailable'
  | 'not-configured'
  | 'unknown';

export type ScenarioStateResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ScenarioStateErrorCode; message: string };

// -----------------------------
// Internals
// -----------------------------

function progressDocId(userId: string, scenarioId: string): string {
  return userId + '_' + scenarioId;
}

/**
 * Firebase errors carry a `code` string. Duck-typed rather than using
 * `instanceof FirebaseError` because this project compiles to ES5, where
 * instanceof against a subclassed Error is unreliable.
 */
function readErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return String((error as { code: unknown }).code);
  }
  return '';
}

function classify(error: unknown): {
  code: ScenarioStateErrorCode;
  message: string;
} {
  const raw = readErrorCode(error);

  if (raw === 'permission-denied') {
    return {
      code: 'permission-denied',
      message:
        'Your progress could not be saved because the database rejected the ' +
        'request. Check the Firestore rules for userScenarioState.'
    };
  }

  if (raw === 'unauthenticated') {
    return {
      code: 'unauthenticated',
      message: 'Your session expired. Sign in again to save progress.'
    };
  }

  if (raw === 'unavailable' || raw === 'deadline-exceeded') {
    return {
      code: 'unavailable',
      message: 'Could not reach the database. Your progress is not saved.'
    };
  }

  if (raw.indexOf('not configured') !== -1) {
    return { code: 'not-configured', message: 'Firebase is not configured.' };
  }

  return {
    code: 'unknown',
    message: 'Something went wrong saving your progress.'
  };
}

/**
 * Firestore returns `any`. A serverTimestamp() field reads back as null
 * while it is still pending server resolution, and a document written by
 * an older build (or edited in the console) may hold a string or number
 * where a Timestamp is expected. Duck-typed on toMillis so none of those
 * reach a caller as a broken Timestamp.
 */
function readTimestamp(value: unknown): Timestamp | null {
  if (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { toMillis?: unknown }).toMillis === 'function'
  ) {
    return value as Timestamp;
  }
  return null;
}

/** The state a user who has never opened this scenario starts from. */
export function defaultScenarioProgress(
  userId: string,
  scenarioId: string
): ScenarioProgress {
  return {
    userId,
    scenarioId,
    currentStep: 'overview',
    currentStepRaw: 'overview',
    completed: false
  };
}

// -----------------------------
// Read
// -----------------------------

/**
 * Loads saved progress. A missing document is a success, not an error —
 * it simply means this is the user's first run, so the default is returned.
 *
 * `currentStep` is validated before it is trusted: a value that is not a
 * known step falls back to 'overview' rather than steering navigation to
 * a screen that does not exist.
 */
export async function loadScenarioState(
  userId: string,
  scenarioId: string
): Promise<ScenarioStateResult<ScenarioProgress>> {
  if (!userId) {
    return {
      ok: false,
      code: 'unauthenticated',
      message: 'No signed-in user.'
    };
  }

  try {
    const ref = doc(getFirebaseDb(), 'userScenarioState', progressDocId(userId, scenarioId));
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      return { ok: true, data: defaultScenarioProgress(userId, scenarioId) };
    }

    const raw = snap.data();

    return {
      ok: true,
      data: {
        userId,
        scenarioId,
        currentStep: isScenarioStep(raw.currentStep) ? raw.currentStep : 'overview',
        // Uncoerced, so a blueprint scenario's stage names survive.
        currentStepRaw: typeof raw.currentStep === 'string' ? raw.currentStep : 'overview',
        completed: raw.completed === true,
        completedAt: readTimestamp(raw.completedAt)
      }
    };
  } catch (error) {
    const classified = classify(error);
    return { ok: false, code: classified.code, message: classified.message };
  }
}

// -----------------------------
// Write
// -----------------------------

/**
 * Upserts progress. `merge: true` means the same call works for the first
 * write and every later one, so there is no create/update branch.
 *
 * `userId` is written on every call because the security rule matches
 * request.resource.data.userId against the caller's uid — omitting it on
 * an update makes the rule deny the write.
 */
export async function saveScenarioState(
  userId: string,
  scenarioId: string,
  // Widened from ScenarioStep to string so a blueprint scenario can persist
  // its own stage names. MT-S01 callers pass a ScenarioStep as before and
  // are unaffected; the read side validates per scenario.
  currentStep: ScenarioStep | string,
  completed: boolean = false
): Promise<ScenarioStateResult<null>> {
  if (!userId) {
    return {
      ok: false,
      code: 'unauthenticated',
      message: 'No signed-in user.'
    };
  }

  try {
    const ref = doc(getFirebaseDb(), 'userScenarioState', progressDocId(userId, scenarioId));

    await setDoc(
      ref,
      {
        userId,
        scenarioId,
        currentStep,
        completed,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    return { ok: true, data: null };
  } catch (error) {
    const classified = classify(error);
    return { ok: false, code: classified.code, message: classified.message };
  }
}

/**
 * Marks the scenario finished. Separate from saveScenarioState so the
 * completion write is explicit at the call site and also stamps
 * completedAt, which is what any future "scenarios completed" list or
 * certificate would read.
 */
export async function markScenarioCompleted(
  userId: string,
  scenarioId: string
): Promise<ScenarioStateResult<null>> {
  if (!userId) {
    return {
      ok: false,
      code: 'unauthenticated',
      message: 'No signed-in user.'
    };
  }

  try {
    const ref = doc(getFirebaseDb(), 'userScenarioState', progressDocId(userId, scenarioId));

    await setDoc(
      ref,
      {
        userId,
        scenarioId,
        currentStep: 'feedback',
        completed: true,
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    // Fire-and-forget. Not awaited, so the completion result returns as
    // soon as the progress write lands; logAnalyticsEvent never throws,
    // so there is nothing here to catch.
    void logAnalyticsEvent(userId, scenarioId, 'scenario_completed', 'feedback');

    return { ok: true, data: null };
  } catch (error) {
    const classified = classify(error);
    return { ok: false, code: classified.code, message: classified.message };
  }
}
