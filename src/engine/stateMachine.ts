// -----------------------------
// Imports
// -----------------------------

import { detectBranch } from './branchingEngine';

// -----------------------------
// Types (aligned with your existing engine files)
// -----------------------------

export type ConversationStage =
  | 'opening'
  | 'performance_sbi'
  | 'exploration'
  | 'commitments'
  | 'closing'
  | 'completed';

export type ConversationBranch =
  | 'guarded'
  | 'factual_challenge'
  | 'partial_openness'
  | 'polite_disengagement';

export interface StateMachineInput {
  stage: ConversationStage;
  userMessage: string;
}

export interface StateMachineOutput {
  nextStage: ConversationStage;
  branch: ConversationBranch | null;
  failure: boolean;
  failureReason?: string;
}

// -----------------------------
// Failure Conditions (from Scenario Validation Summary)
// -----------------------------

function checkFailure(stage: ConversationStage, userMessage: string): string | null {
  const msg = userMessage.toLowerCase();

  if (stage === 'opening') {
    if (!msg.includes('promotion') && !msg.includes('outcome')) {
      return 'Opening failed: promotion outcome not acknowledged.';
    }
  }

  if (stage === 'performance_sbi') {
    if (
      !msg.includes('late') &&
      !msg.includes('deadline') &&
      !msg.includes('segmentation') &&
      !msg.includes('report')
    ) {
      return 'Performance section failed: performance issue not named.';
    }
  }

  if (stage === 'closing') {
    if (
      !msg.includes('follow-up') &&
      !msg.includes('follow up') &&
      !msg.includes('next steps')
    ) {
      return 'Closing failed: no follow-up or operational continuity plan.';
    }
  }

  return null;
}

// -----------------------------
// Stage Transition Logic (from JSON Blueprint)
// -----------------------------

export function runStateMachine(input: StateMachineInput): StateMachineOutput {
  const { stage, userMessage } = input;

  // Check failure conditions
  const failureReason = checkFailure(stage, userMessage);
  if (failureReason) {
    return {
      nextStage: stage,
      branch: null,
      failure: true,
      failureReason,
    };
  }

  // Normal transitions
  switch (stage) {
    case 'opening':
      return {
        nextStage: 'performance_sbi',
        branch: null,
        failure: false,
      };

    case 'performance_sbi': {
      const branchResult = detectBranch(userMessage);
      return {
        nextStage: 'exploration',
        branch: branchResult.branch,
        failure: false,
      };
    }

    case 'exploration': {
      const branchResult = detectBranch(userMessage);
      return {
        nextStage: 'commitments',
        branch: branchResult.branch,
        failure: false,
      };
    }

    case 'commitments':
      return {
        nextStage: 'closing',
        branch: null,
        failure: false,
      };

    case 'closing':
      return {
        nextStage: 'completed',
        branch: null,
        failure: false,
      };

    default:
      return {
        nextStage: 'completed',
        branch: null,
        failure: false,
      };
  }
}

