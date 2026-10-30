// src/engine/assessmentRecords.ts
//
// One immutable record per completed MT-S02 run.
//
// Document path: assessmentRecords/{userId}_{scenarioId}_{runId}
// The deterministic id means a retry or a double click addresses the same
// document, so a run can never be recorded twice. The write is a
// transaction (read, then create only if absent), and the Firestore rules
// refuse any update or delete.
//
// Privacy: a record holds ids, the rubric version, the tier, 17 boolean
// criteria and the feedback branch name. It never holds the manager's
// words, Tomás's replies, commitments, evidence quotations or any other
// free text. buildAssessmentRecord copies by whitelist, so a new field
// elsewhere cannot leak in by accident.
//
// Nothing here throws. A failure comes back as a typed result.

import { collection, doc, getDocs, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';

import { getFirebaseDb } from '../lib/firebase';
import { S02_RUBRIC_VERSION } from './s02/rubricVersion';
import { S02CriterionKey, S02_CRITERION_KEYS, criteriaFromSignals } from './s02/criteria';
import { S02ScoreResult } from './s02/scoringEngine';
import { FeedbackSelection } from './s02/feedbackSelector';

export const ASSESSMENT_COLLECTION = 'assessmentRecords';

export interface AssessmentRecord {
  userId: string;
  scenarioId: string;
  runId: string;
  rubricVersion: string;
  tier: string;
  criteria: Record<S02CriterionKey, boolean>;
  feedbackBranch: string;
}

export type AssessmentErrorCode =
  | 'permission-denied'
  | 'unauthenticated'
  | 'unavailable'
  | 'not-configured'
  | 'unknown';

export type SaveAssessmentResult =
  | { ok: true; duplicate: boolean }
  | { ok: false; code: AssessmentErrorCode; message: string };

export function assessmentDocId(userId: string, scenarioId: string, runId: string): string {
  return userId + '_' + scenarioId + '_' + runId;
}

export function buildAssessmentRecord(
  userId: string,
  scenarioId: string,
  runId: string,
  score: S02ScoreResult,
  feedback: FeedbackSelection
): AssessmentRecord {
  return {
    userId,
    scenarioId,
    runId,
    rubricVersion: S02_RUBRIC_VERSION,
    tier: score.tier,
    criteria: criteriaFromSignals(score.signals),
    feedbackBranch: feedback.branch
  };
}

/** A record as read back: the stored fields plus its commit time in ms (null while pending). */
export interface StoredAssessment extends AssessmentRecord {
  createdAtMs: number | null;
}

export type ListAssessmentsResult =
  | { ok: true; records: StoredAssessment[]; unreadable: number }
  | { ok: false; code: AssessmentErrorCode; message: string };

function readErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return String((error as { code: unknown }).code);
  }
  return '';
}

function classify(error: unknown): { code: AssessmentErrorCode; message: string } {
  const raw = readErrorCode(error);

  if (raw === 'permission-denied') {
    return {
      code: 'permission-denied',
      message: 'Your assessment could not be saved because the database rejected the request.'
    };
  }
  if (raw === 'unauthenticated') {
    return { code: 'unauthenticated', message: 'Your session expired. Sign in again to save your assessment.' };
  }
  if (raw === 'unavailable' || raw === 'deadline-exceeded' || raw === 'failed-precondition') {
    return { code: 'unavailable', message: 'Could not reach the database. Your assessment is not saved.' };
  }
  if (String(error instanceof Error ? error.message : '').indexOf('not configured') !== -1) {
    return { code: 'not-configured', message: 'Firebase is not configured.' };
  }
  return { code: 'unknown', message: 'Something went wrong saving your assessment.' };
}

function classifyRead(error: unknown): { code: AssessmentErrorCode; message: string } {
  const raw = readErrorCode(error);

  if (raw === 'permission-denied') {
    return {
      code: 'permission-denied',
      message: 'Your assessments could not be read because the database rejected the request.'
    };
  }
  if (raw === 'unauthenticated') {
    return { code: 'unauthenticated', message: 'Your session expired. Sign in again to see your progress.' };
  }
  if (raw === 'unavailable' || raw === 'deadline-exceeded') {
    return { code: 'unavailable', message: 'Could not reach the database, so your assessments could not be loaded.' };
  }
  return { code: 'unknown', message: 'Something went wrong loading your assessments.' };
}

/** Accepts a stored document only if every field has the shape P1 writes; anything else is unreadable. */
function parseStored(data: Record<string, unknown>): StoredAssessment | null {
  const { userId, scenarioId, runId, rubricVersion, tier, criteria, feedbackBranch, createdAt } = data;
  if (
    typeof userId !== 'string' ||
    typeof scenarioId !== 'string' ||
    typeof runId !== 'string' ||
    typeof rubricVersion !== 'string' ||
    typeof tier !== 'string' ||
    typeof feedbackBranch !== 'string' ||
    typeof criteria !== 'object' ||
    criteria === null
  ) {
    return null;
  }
  const source = criteria as Record<string, unknown>;
  const parsed = {} as Record<S02CriterionKey, boolean>;
  for (const key of S02_CRITERION_KEYS) {
    if (typeof source[key] !== 'boolean') {
      return null;
    }
    parsed[key] = source[key] as boolean;
  }
  const toMillis = (createdAt as { toMillis?: unknown } | null | undefined)?.toMillis;
  const createdAtMs = typeof toMillis === 'function' ? (toMillis as () => number).call(createdAt) : null;
  return { userId, scenarioId, runId, rubricVersion, tier, criteria: parsed, feedbackBranch, createdAtMs };
}

/**
 * The signed-in user's own assessment records for one scenario. The query
 * is filtered by userId, which is what the security rules require. No
 * ordering is requested from Firestore (that would need a composite index);
 * callers sort. A document that does not have the expected shape is counted
 * as unreadable, never guessed at or dropped silently.
 */
export async function listMyAssessments(userId: string, scenarioId: string): Promise<ListAssessmentsResult> {
  if (!userId) {
    return { ok: false, code: 'unauthenticated', message: 'No signed-in user.' };
  }

  try {
    const snapshot = await getDocs(
      query(collection(getFirebaseDb(), ASSESSMENT_COLLECTION), where('userId', '==', userId))
    );
    const records: StoredAssessment[] = [];
    let unreadable = 0;
    snapshot.forEach((entry) => {
      const parsed = parseStored(entry.data() as Record<string, unknown>);
      if (parsed && parsed.userId === userId && parsed.scenarioId === scenarioId) {
        records.push(parsed);
      } else if (!parsed) {
        unreadable += 1;
      }
    });
    return { ok: true, records, unreadable };
  } catch (error) {
    const { code, message } = classifyRead(error);
    return { ok: false, code, message };
  }
}

/**
 * Creates the record unless one with the same id already exists. An existing
 * record counts as success (`duplicate: true`): the run is recorded, once.
 * `ok: true` is returned only after the server has committed the write.
 */
export async function saveAssessment(record: AssessmentRecord): Promise<SaveAssessmentResult> {
  if (!record.userId) {
    return { ok: false, code: 'unauthenticated', message: 'No signed-in user.' };
  }

  try {
    const ref = doc(
      getFirebaseDb(),
      ASSESSMENT_COLLECTION,
      assessmentDocId(record.userId, record.scenarioId, record.runId)
    );

    const duplicate = await runTransaction(getFirebaseDb(), async (transaction) => {
      const existing = await transaction.get(ref);
      if (existing.exists()) {
        return true;
      }
      transaction.set(ref, { ...record, createdAt: serverTimestamp() });
      return false;
    });

    return { ok: true, duplicate };
  } catch (error) {
    const { code, message } = classify(error);
    return { ok: false, code, message };
  }
}
