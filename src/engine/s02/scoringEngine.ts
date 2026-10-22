// src/engine/s02/scoringEngine.ts
//
// Turns a completed MT-S02 run into a tier, using the blueprint rubric.
//
//   excellent — every excellent criterion met and no poor criterion tripped
//   adequate  — the four adequate criteria met and no poor criterion tripped
//   poor      — any poor criterion tripped, or the adequate floor missed
//
// A poor criterion is disqualifying. "Outage used as evidence" is not a
// deduction that a strong closing can offset: the rubric lists it as what
// poor *is*.

import {
  ScoreTier,
  ScoringRubric
} from '../../types/scenarioBlueprint';
import {
  S02Commitment,
  checkCommitmentSet,
  commitmentsFitCheckpoint
} from './commitmentValidator';
import {
  CAUSALITY_MARKERS,
  FORMAL_PROCESS_MARKERS,
  MANAGER_CONTRIBUTION_MARKERS,
  NAMED_SOURCE_MARKERS,
  NON_EMPLOYEE_CAUSE_MARKERS,
  OUTAGE_MARKERS,
  PERSONALITY_MARKERS,
  REASSURANCE_MARKERS,
  REBUTTAL_MARKERS,
  RESOLUTION_MARKERS,
  containsAny,
  containsExplicitDate,
  countListItems,
  countQuestions,
  wordCount
} from './textSignals';

// -----------------------------
// Run input
// -----------------------------

export interface S02RunInput {
  sbi: string;
  exploration: string;
  hypotheses: string;
  managerCommitment: S02Commitment | null;
  employeeCommitment: S02Commitment | null;
  closing: string;
  /** ISO date captured on the closing screen. */
  checkpointDate: string;
  /** Who initiates the follow-up. */
  checkpointInitiator: string;
}

// -----------------------------
// Signals
// -----------------------------

export interface S02Signals {
  // Excellent criteria
  behaviourNamed: boolean;
  impactWithoutCausality: boolean;
  explorationBeforeRebuttal: boolean;
  managerContributionNamed: boolean;
  multipleHypothesesHeld: boolean;
  bilateralCommitments: boolean;
  datedCheckpoint: boolean;

  // Adequate floor
  recognisableBehaviouralStatement: boolean;
  someExploration: boolean;
  oneConcreteCommitment: boolean;
  someNextStep: boolean;

  // Poor criteria
  outageUsedAsEvidence: boolean;
  causalityAsserted: boolean;
  evidenceTraded: boolean;
  attitudinalCommitmentAccepted: boolean;
  reassuranceInsteadOfStructure: boolean;
  noDatedCheckpoint: boolean;

  // Escalation signals (feedback branch, not scoring)
  personalityDiagnosed: boolean;
  namedSourceUsedAsEvidence: boolean;
  formalProcessInvoked: boolean;

  // Avoidance signals (feedback branch, not scoring)
  compressedStages: string[];
}

/** Below this, a stage's input is treated as compressed rather than attempted. */
export const MIN_STAGE_WORDS = 12;

export function deriveSignals(
  run: S02RunInput,
  now: number = Date.now()
): S02Signals {
  const commitments = checkCommitmentSet(
    run.managerCommitment,
    run.employeeCommitment,
    now
  );

  const allText = [run.sbi, run.exploration, run.hypotheses, run.closing].join('\n');

  // --- Stage 1 -------------------------------------------------------
  const outageInSbi = containsAny(run.sbi, OUTAGE_MARKERS);
  const causalityInSbi = containsAny(run.sbi, CAUSALITY_MARKERS);

  const behaviourNamed =
    wordCount(run.sbi) >= MIN_STAGE_WORDS && !outageInSbi && !causalityInSbi;

  const impactWithoutCausality =
    wordCount(run.sbi) >= MIN_STAGE_WORDS && !causalityInSbi;

  const recognisableBehaviouralStatement = wordCount(run.sbi) >= MIN_STAGE_WORDS;

  // --- Stage 2 -------------------------------------------------------
  const questions = countQuestions(run.exploration);

  const explorationBeforeRebuttal =
    questions >= 3 && !containsAny(run.exploration, REBUTTAL_MARKERS);

  const someExploration = questions >= 1 || wordCount(run.exploration) >= MIN_STAGE_WORDS;

  // --- Stage 3 -------------------------------------------------------
  const hypothesisCount = countListItems(run.hypotheses);

  const managerContributionNamed = containsAny(
    run.hypotheses + '\n' + run.exploration,
    MANAGER_CONTRIBUTION_MARKERS
  );

  const multipleHypothesesHeld =
    hypothesisCount >= 3 &&
    containsAny(run.hypotheses, NON_EMPLOYEE_CAUSE_MARKERS) &&
    managerContributionNamed;

  // --- Stage 4 -------------------------------------------------------
  const bilateralCommitments = commitments.bilateral;

  const oneConcreteCommitment = commitments.manager.valid || commitments.employee.valid;

  // --- Stage 5 -------------------------------------------------------
  const hasCheckpointDate =
    /^\d{4}-\d{2}-\d{2}$/.test(run.checkpointDate || '') ||
    containsExplicitDate(run.closing);

  const hasInitiator = wordCount(run.checkpointInitiator) >= 1;

  const datedCheckpoint =
    hasCheckpointDate &&
    hasInitiator &&
    commitmentsFitCheckpoint(
      [run.managerCommitment, run.employeeCommitment],
      run.checkpointDate
    );

  const someNextStep = hasCheckpointDate || wordCount(run.closing) >= MIN_STAGE_WORDS;

  const reassuranceInsteadOfStructure =
    containsAny(run.closing, REASSURANCE_MARKERS) ||
    containsAny(run.closing, RESOLUTION_MARKERS);

  // --- Poor criteria --------------------------------------------------
  const outageUsedAsEvidence = outageInSbi || containsAny(allText, OUTAGE_MARKERS);
  const causalityAsserted = containsAny(allText, CAUSALITY_MARKERS);
  const evidenceTraded = containsAny(run.exploration, REBUTTAL_MARKERS);

  // --- Escalation and avoidance ---------------------------------------
  const compressedStages: string[] = [];
  if (wordCount(run.sbi) < MIN_STAGE_WORDS) {
    compressedStages.push('sbi');
  }
  if (questions < 3 && wordCount(run.exploration) < MIN_STAGE_WORDS) {
    compressedStages.push('exploration');
  }
  if (hypothesisCount < 3) {
    compressedStages.push('hypotheses');
  }
  if (!commitments.bilateral) {
    compressedStages.push('commitments');
  }
  if (!hasCheckpointDate || !hasInitiator) {
    compressedStages.push('closing');
  }

  return {
    behaviourNamed,
    impactWithoutCausality,
    explorationBeforeRebuttal,
    managerContributionNamed,
    multipleHypothesesHeld,
    bilateralCommitments,
    datedCheckpoint,

    recognisableBehaviouralStatement,
    someExploration,
    oneConcreteCommitment,
    someNextStep,

    outageUsedAsEvidence,
    causalityAsserted,
    evidenceTraded,
    attitudinalCommitmentAccepted: commitments.attitudinalPresent,
    reassuranceInsteadOfStructure,
    noDatedCheckpoint: !datedCheckpoint,

    personalityDiagnosed: containsAny(allText, PERSONALITY_MARKERS),
    namedSourceUsedAsEvidence: containsAny(run.sbi, NAMED_SOURCE_MARKERS),
    formalProcessInvoked: containsAny(allText, FORMAL_PROCESS_MARKERS),

    compressedStages
  };
}

// -----------------------------
// Tiering
// -----------------------------

export interface S02ScoreResult {
  tier: ScoreTier;
  signals: S02Signals;
  /** Rubric criteria met, verbatim from the blueprint. */
  met: string[];
  /** Rubric criteria missed or tripped, verbatim from the blueprint. */
  missed: string[];
}

export function scoreRun(
  run: S02RunInput,
  rubric: ScoringRubric,
  now: number = Date.now()
): S02ScoreResult {
  const signals = deriveSignals(run, now);

  // Rubric order matches the blueprint's arrays exactly, so met/missed
  // can be reported using the authored strings rather than paraphrases.
  const excellentChecks: boolean[] = [
    signals.behaviourNamed,
    signals.impactWithoutCausality,
    signals.explorationBeforeRebuttal,
    signals.managerContributionNamed,
    signals.multipleHypothesesHeld,
    signals.bilateralCommitments,
    signals.datedCheckpoint
  ];

  const adequateChecks: boolean[] = [
    signals.recognisableBehaviouralStatement,
    signals.someExploration,
    signals.oneConcreteCommitment,
    signals.someNextStep
  ];

  const poorChecks: boolean[] = [
    signals.outageUsedAsEvidence,
    signals.causalityAsserted,
    signals.evidenceTraded,
    signals.attitudinalCommitmentAccepted,
    signals.reassuranceInsteadOfStructure,
    signals.noDatedCheckpoint
  ];

  const poorTripped = poorChecks.some((tripped) => tripped);
  const allExcellent = excellentChecks.every((met) => met);
  const allAdequate = adequateChecks.every((met) => met);

  let tier: ScoreTier;
  if (poorTripped || !allAdequate) {
    tier = 'poor';
  } else if (allExcellent) {
    tier = 'excellent';
  } else {
    tier = 'adequate';
  }

  const met: string[] = [];
  const missed: string[] = [];

  const source = tier === 'poor' ? rubric.adequate.criteria : rubric.excellent.criteria;
  const checks = tier === 'poor' ? adequateChecks : excellentChecks;

  for (let i = 0; i < source.length && i < checks.length; i += 1) {
    if (checks[i]) {
      met.push(source[i]);
    } else {
      missed.push(source[i]);
    }
  }

  // Tripped poor criteria are reported verbatim alongside what was missed.
  for (let i = 0; i < rubric.poor.criteria.length && i < poorChecks.length; i += 1) {
    if (poorChecks[i]) {
      missed.push(rubric.poor.criteria[i]);
    }
  }

  return { tier, signals, met, missed };
}
