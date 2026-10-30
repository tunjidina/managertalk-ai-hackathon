// src/engine/s02/criteria.ts
//
// The scored rubric checks, by stable key, grouped by tier. These keys are
// what an assessment record stores, so renaming one is a rubric change and
// needs a new S02_RUBRIC_VERSION.

import { S02Signals } from './scoringEngine';

export const EXCELLENT_CRITERIA = [
  'behaviourNamed',
  'impactWithoutCausality',
  'explorationBeforeRebuttal',
  'managerContributionNamed',
  'multipleHypothesesHeld',
  'bilateralCommitments',
  'datedCheckpoint'
] as const;

export const ADEQUATE_CRITERIA = [
  'recognisableBehaviouralStatement',
  'someExploration',
  'oneConcreteCommitment',
  'someNextStep'
] as const;

export const POOR_CRITERIA = [
  'outageUsedAsEvidence',
  'causalityAsserted',
  'evidenceTraded',
  'attitudinalCommitmentAccepted',
  'reassuranceInsteadOfStructure',
  'noDatedCheckpoint'
] as const;

export type S02CriterionKey =
  | (typeof EXCELLENT_CRITERIA)[number]
  | (typeof ADEQUATE_CRITERIA)[number]
  | (typeof POOR_CRITERIA)[number];

export const S02_CRITERION_KEYS: S02CriterionKey[] = [
  ...EXCELLENT_CRITERIA,
  ...ADEQUATE_CRITERIA,
  ...POOR_CRITERIA
];

/** Booleans only: every key present, nothing else copied from the signals. */
export function criteriaFromSignals(signals: S02Signals): Record<S02CriterionKey, boolean> {
  const criteria = {} as Record<S02CriterionKey, boolean>;
  for (const key of S02_CRITERION_KEYS) {
    criteria[key] = signals[key] === true;
  }
  return criteria;
}
