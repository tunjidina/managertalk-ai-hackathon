// src/engine/analytics.ts
//
// Progress analytics for ManagerTalk.
//
// Collection: scenarioAnalytics/{userId}_{scenarioId}_{timestampMs}
//
// Style follows src/engine/scenarioState.ts exactly: nothing throws, every
// call returns a discriminated result, and Firebase errors are duck-typed
// rather than matched with instanceof (this project targets ES5, where
// instanceof against a subclassed Error is unreliable).
//
// Nothing in this module touches conversationState, navigationState or the
// scenario progress logic. It is additive instrumentation only.
//
// COST NOTE: one Firestore document write per event. Log intent — step
// reached, scenario completed, validator rejected — not activity. A
// keystroke-level instrumentation pass gets expensive quickly.

import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

import { getFirebaseDb } from '../lib/firebase';

// -----------------------------
// Result type
// -----------------------------

export type AnalyticsErrorCode =
  | 'permission-denied'
  | 'unauthenticated'
  | 'unavailable'
  | 'not-configured'
  | 'invalid-argument'
  | 'unknown';

export type AnalyticsResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: AnalyticsErrorCode; message: string };

/** What a successful write returns, so a caller can log or assert on it. */
export interface AnalyticsWriteInfo {
  docId: string;
  event: string;
  step: string;
}

// -----------------------------
// Optional vocabulary
// -----------------------------
//
// `event` and `step` are plain strings in the signature below, as
// specified. These aliases exist so call sites can opt into a checked
// vocabulary later without changing the function:
//
//   logAnalyticsEvent(uid, id, 'step_reached' as AnalyticsEvent, step)
//
// Free strings drift — 'closing_failed', 'closingFailed' and
// 'closing-failed' all end up in the same collection and nothing tells
// you they are the same event. Worth tightening before the data matters.

export type AnalyticsEvent =
  | 'step_reached'
  | 'scenario_started'
  | 'scenario_completed'
  | 'scenario_reset'
  | 'closing_rejected'
  | 'commitment_added'
  | 'progress_sync_failed';

export type AnalyticsStep =
  | 'overview'
  | 'evidence'
  | 'conversation'
  | 'commitments'
  | 'closing'
  | 'scoring'
  | 'feedback';

// -----------------------------
// Internals
// -----------------------------

/**
 * Firebase errors carry a `code` string. Duck-typed for the ES5 reason
 * given at the top of the file.
 */
function readErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return String((error as { code: unknown }).code);
  }
  return '';
}

function classify(error: unknown): {
  code: AnalyticsErrorCode;
  message: string;
} {
  const raw = readErrorCode(error);

  if (raw === 'permission-denied') {
    return {
      code: 'permission-denied',
      message:
        'The analytics event was rejected by the database. Check the ' +
        'Firestore rules for scenarioAnalytics.'
    };
  }

  if (raw === 'unauthenticated') {
    return {
      code: 'unauthenticated',
      message: 'Your session expired. The analytics event was not written.'
    };
  }

  if (raw === 'unavailable' || raw === 'deadline-exceeded') {
    return {
      code: 'unavailable',
      message: 'Could not reach the database. The analytics event was not written.'
    };
  }

  if (raw === 'invalid-argument') {
    return {
      code: 'invalid-argument',
      message: 'The analytics event contained a value Firestore cannot store.'
    };
  }

  if (raw.indexOf('not configured') !== -1) {
    return { code: 'not-configured', message: 'Firebase is not configured.' };
  }

  return {
    code: 'unknown',
    message: 'Something went wrong writing the analytics event.'
  };
}

/**
 * Guarantees the millisecond used in the document ID is never reused
 * within this tab.
 *
 * Without it, two events in the same millisecond — 'step_reached' and
 * 'scenario_completed' both firing when the user lands on Feedback —
 * produce the same ID, and the second setDoc silently overwrites the
 * first. Losing exactly the completion event you care most about.
 *
 * This does not protect against two tabs colliding, which is rare enough
 * to accept; if you want it impossible, switch to addDoc() (see notes).
 */
let lastStampMs = 0;

function nextStampMs(): number {
  const now = Date.now();
  lastStampMs = now > lastStampMs ? now : lastStampMs + 1;
  return lastStampMs;
}

export function analyticsDocId(
  userId: string,
  scenarioId: string,
  stampMs: number
): string {
  return userId + '_' + scenarioId + '_' + stampMs;
}

const MAX_METADATA_KEYS = 20;
const MAX_STRING_LENGTH = 500;

/**
 * Firestore rejects `undefined` outright and stores NaN/Infinity as
 * unusable values, so both are handled here rather than trusted at the
 * call site. Nested objects and arrays are passed through untouched —
 * Firestore accepts them — but flat metadata queries far better.
 */
function sanitiseMetadata(metadata?: Record<string, any>): Record<string, any> {
  const clean: Record<string, any> = {};

  if (!metadata) {
    return clean;
  }

  const keys = Object.keys(metadata).slice(0, MAX_METADATA_KEYS);

  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const value = metadata[key];

    if (value === undefined) {
      continue;
    }

    if (typeof value === 'string') {
      clean[key] = value.slice(0, MAX_STRING_LENGTH);
      continue;
    }

    if (typeof value === 'number') {
      clean[key] = isFinite(value) ? value : 0;
      continue;
    }

    clean[key] = value;
  }

  return clean;
}

// -----------------------------
// Public API
// -----------------------------

/**
 * Writes one analytics event.
 *
 * Fire-and-forget at the call site — the returned promise exists so tests
 * can await it and so a caller can inspect a failure, not because anything
 * in the UI should block on it:
 *
 *   logAnalyticsEvent(uid, 'MT-S01', 'step_reached', 'closing');
 *
 * `userId` must be the signed-in user's uid. The security rule matches
 * request.resource.data.userId against request.auth.uid, so passing any
 * other value returns a permission-denied result.
 */
export async function logAnalyticsEvent(
  userId: string,
  scenarioId: string,
  event: string,
  step: string,
  metadata?: Record<string, any>
): Promise<AnalyticsResult<AnalyticsWriteInfo>> {
  if (!userId) {
    return {
      ok: false,
      code: 'unauthenticated',
      message: 'No signed-in user.'
    };
  }

  if (!scenarioId || !event || !step) {
    return {
      ok: false,
      code: 'invalid-argument',
      message: 'scenarioId, event and step are all required.'
    };
  }

  try {
    const docId = analyticsDocId(userId, scenarioId, nextStampMs());
    const ref = doc(getFirebaseDb(), 'scenarioAnalytics', docId);

    // No { merge: true } here, unlike scenarioState: every event is a new
    // document, and merging would mask an ID collision instead of
    // surfacing it.
    await setDoc(ref, {
      userId,
      scenarioId,
      event,
      step,
      metadata: sanitiseMetadata(metadata),
      timestamp: serverTimestamp()
    });

    return { ok: true, data: { docId, event, step } };
  } catch (error) {
    const classified = classify(error);
    return { ok: false, code: classified.code, message: classified.message };
  }
}
