// src/engine/s02/progressAnalysis.ts
//
// Pure analysis of a user's stored MT-S02 assessments for the My progress
// screen. No numbers are invented: only the stored tier and the stored
// true/false criteria are used.
//
// Version rule: records are compared only with records from the SAME rubric
// version, and only when that version is the current one. A record from any
// other version is listed in the history, marked "Earlier rubric — not
// compared", and never contributes to a baseline or a comparison.

import { StoredAssessment } from '../assessmentRecords';
import { EXCELLENT_CRITERIA, POOR_CRITERIA, S02CriterionKey } from './criteria';
import { S02_RUBRIC_VERSION } from './rubricVersion';

export type CriterionChange = 'newly-met' | 'no-longer-met' | 'unchanged';

export interface ExcellentCriterionView {
  key: S02CriterionKey;
  metInLatest: boolean;
  /** Null when there is no valid same-version baseline to compare with. */
  change: CriterionChange | null;
}

export interface HistoryEntry {
  record: StoredAssessment;
  current: boolean;
}

export interface ProgressAnalysis {
  /** The most recent record of any version, or null when there are none. */
  latest: StoredAssessment | null;
  latestIsCurrent: boolean;
  /** Earliest current-version record. Null when there is none. */
  baseline: StoredAssessment | null;
  /** True when the latest and the baseline are two different current-version records. */
  canCompare: boolean;
  excellent: ExcellentCriterionView[];
  priorities: S02CriterionKey[];
  flaggedPoor: S02CriterionKey[];
  comparison: { newlyMet: S02CriterionKey[]; noLongerMet: S02CriterionKey[]; unchanged: S02CriterionKey[] } | null;
  /** Newest first. */
  history: HistoryEntry[];
}

/** A record with no commit time yet is the newest: it is a write still settling. */
function timeOf(record: StoredAssessment): number {
  return record.createdAtMs === null ? Number.POSITIVE_INFINITY : record.createdAtMs;
}

export function analyseProgress(
  records: StoredAssessment[],
  currentVersion: string = S02_RUBRIC_VERSION
): ProgressAnalysis {
  const ascending = records.slice().sort((a, b) => timeOf(a) - timeOf(b));

  const latest = ascending.length > 0 ? ascending[ascending.length - 1] : null;
  const latestIsCurrent = latest !== null && latest.rubricVersion === currentVersion;

  const currentRecords = ascending.filter((record) => record.rubricVersion === currentVersion);
  const baseline = currentRecords.length > 0 ? currentRecords[0] : null;

  const canCompare =
    latestIsCurrent && baseline !== null && latest !== null && baseline.runId !== latest.runId;

  const comparable = latestIsCurrent && latest !== null;

  const excellent: ExcellentCriterionView[] = EXCELLENT_CRITERIA.map((key) => {
    if (!comparable || latest === null) {
      return { key, metInLatest: false, change: null };
    }
    const now = latest.criteria[key];
    let change: CriterionChange | null = null;
    if (canCompare && baseline !== null) {
      const before = baseline.criteria[key];
      change = now === before ? 'unchanged' : now ? 'newly-met' : 'no-longer-met';
    }
    return { key, metInLatest: now, change };
  });

  const comparison = canCompare
    ? {
        newlyMet: excellent.filter((item) => item.change === 'newly-met').map((item) => item.key),
        noLongerMet: excellent.filter((item) => item.change === 'no-longer-met').map((item) => item.key),
        unchanged: excellent.filter((item) => item.change === 'unchanged').map((item) => item.key)
      }
    : null;

  const priorities = comparable ? excellent.filter((item) => !item.metInLatest).map((item) => item.key) : [];

  const flaggedPoor =
    comparable && latest !== null ? POOR_CRITERIA.filter((key) => latest.criteria[key]) : [];

  const history = ascending
    .slice()
    .reverse()
    .map((record) => ({ record, current: record.rubricVersion === currentVersion }));

  return { latest, latestIsCurrent, baseline, canCompare, excellent, priorities, flaggedPoor, comparison, history };
}
