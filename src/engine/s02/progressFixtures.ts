// Test fixtures for assessment records. Not used by the application.

import { StoredAssessment } from '../assessmentRecords';
import { S02CriterionKey, S02_CRITERION_KEYS } from './criteria';
import { S02_RUBRIC_VERSION } from './rubricVersion';

export function rec(
  runId: string,
  createdAtMs: number | null,
  met: S02CriterionKey[] = [],
  options: { version?: string; tier?: string } = {}
): StoredAssessment {
  const criteria = {} as Record<S02CriterionKey, boolean>;
  S02_CRITERION_KEYS.forEach((key) => {
    criteria[key] = met.indexOf(key) !== -1;
  });
  return {
    userId: 'user-a',
    scenarioId: 'MT-S02',
    runId,
    rubricVersion: options.version || S02_RUBRIC_VERSION,
    tier: options.tier || 'adequate',
    criteria,
    feedbackBranch: 'poor',
    createdAtMs
  };
}
