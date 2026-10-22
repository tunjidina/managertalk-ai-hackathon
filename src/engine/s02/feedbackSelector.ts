// src/engine/s02/feedbackSelector.ts
//
// Selects which of the blueprint's four feedback branches applies.
//
// The branches are NOT the scoring tiers. feedback_logic has four keys
// (good / poor / avoidance / escalation) and scoring_rubric has three
// (excellent / adequate / poor), and they are orthogonal: a run can score
// adequate AND have escalated incorrectly. Tier and branch are therefore
// resolved independently, and the feedback screen shows both.
//
// Precedence, most specific first:
//
//   escalation — a structural misuse of evidence or process happened, and
//                that is the thing worth saying regardless of tier
//   avoidance  — nothing was misused; stages were skipped or compressed
//   good       — the run scored excellent
//   poor       — everything else

import { FeedbackBranch, FeedbackLogic, ScoreTier } from '../../types/scenarioBlueprint';
import { S02Signals } from './scoringEngine';

export interface FeedbackSelection {
  branch: FeedbackBranch;
  /** The authored focus list for that branch, verbatim. */
  focus: string[];
  /** Which signals put the run in this branch. Not rendered as copy. */
  reasons: string[];
}

/** Stage count below which a run reads as avoidance rather than attempt. */
export const AVOIDANCE_STAGE_THRESHOLD = 2;

export function selectFeedbackBranch(
  signals: S02Signals,
  tier: ScoreTier
): FeedbackBranch {
  // Escalation: evidence or process used beyond its limits.
  if (
    signals.outageUsedAsEvidence ||
    signals.namedSourceUsedAsEvidence ||
    signals.formalProcessInvoked ||
    signals.personalityDiagnosed ||
    signals.causalityAsserted
  ) {
    return 'escalation';
  }

  // Avoidance: stages compressed rather than attempted.
  if (signals.compressedStages.length >= AVOIDANCE_STAGE_THRESHOLD) {
    return 'avoidance';
  }

  if (tier === 'excellent') {
    return 'good';
  }

  return 'poor';
}

function collectReasons(signals: S02Signals, branch: FeedbackBranch): string[] {
  const reasons: string[] = [];

  if (branch === 'escalation') {
    if (signals.outageUsedAsEvidence) {
      reasons.push('outage-referenced');
    }
    if (signals.namedSourceUsedAsEvidence) {
      reasons.push('named-source-in-opening');
    }
    if (signals.formalProcessInvoked) {
      reasons.push('formal-process-invoked');
    }
    if (signals.personalityDiagnosed) {
      reasons.push('personality-diagnosed');
    }
    if (signals.causalityAsserted) {
      reasons.push('causality-asserted');
    }
    return reasons;
  }

  if (branch === 'avoidance') {
    return signals.compressedStages.slice();
  }

  if (branch === 'good') {
    if (signals.explorationBeforeRebuttal) {
      reasons.push('exploration-before-rebuttal');
    }
    if (signals.managerContributionNamed) {
      reasons.push('manager-contribution-named');
    }
    if (signals.multipleHypothesesHeld) {
      reasons.push('hypotheses-held-open');
    }
    if (signals.bilateralCommitments) {
      reasons.push('bilateral-commitments');
    }
    if (signals.datedCheckpoint) {
      reasons.push('dated-checkpoint');
    }
    return reasons;
  }

  if (!signals.behaviourNamed) {
    reasons.push('behaviour-not-named');
  }
  if (!signals.explorationBeforeRebuttal) {
    reasons.push('exploration-incomplete');
  }
  if (!signals.multipleHypothesesHeld) {
    reasons.push('single-explanation');
  }
  if (!signals.bilateralCommitments) {
    reasons.push('commitments-not-bilateral');
  }
  if (signals.attitudinalCommitmentAccepted) {
    reasons.push('attitudinal-commitment');
  }
  if (signals.reassuranceInsteadOfStructure) {
    reasons.push('reassurance-used');
  }
  if (!signals.datedCheckpoint) {
    reasons.push('no-dated-checkpoint');
  }

  return reasons;
}

export function selectFeedback(
  signals: S02Signals,
  tier: ScoreTier,
  logic: FeedbackLogic
): FeedbackSelection {
  const branch = selectFeedbackBranch(signals, tier);

  return {
    branch,
    focus: logic[branch].focus,
    reasons: collectReasons(signals, branch)
  };
}

/**
 * The four headings the feedback screen renders, from the blueprint's
 * display_template. Kept here so the screen never hardcodes them.
 */
export function feedbackSections(template: string[]): string[] {
  return template.slice();
}
