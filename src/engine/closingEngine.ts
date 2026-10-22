// -----------------------------
// Types
// -----------------------------

export interface ClosingInput {
  managerMessage: string;
  managerCommitmentComplete: boolean;
  employeeCommitmentComplete: boolean;
}

export interface ClosingResult {
  canClose: boolean;
  violations: string[];
  requiredNextSteps: string[];
}

// -----------------------------
// Rule Detection Helpers
// -----------------------------

// Maps Unicode dash variants onto the plain ASCII hyphen so that typed or
// pasted input matches the hyphenated signal strings. Covers the hyphen
// (U+2010), non-breaking hyphen (U+2011), figure dash (U+2012), en dash
// (U+2013) and em dash (U+2014).
function normalizeHyphens(text: string): string {
  return text.replace(/[‐‑‒–—]/g, '-');
}

function detectFalseReassurance(msg: string): boolean {
  const reassuranceSignals = [
    "you'll be fine",
    'everything is okay',
    "don't worry",
    'it will all work out',
    "you're doing great",
  ];
  const lower = msg.toLowerCase();
  return reassuranceSignals.some((s) => lower.includes(s));
}

function detectPromotionPromise(msg: string): boolean {
  const promiseSignals = [
    'next promotion',
    'you will be promoted',
    'i will get you promoted',
    "i promise you'll move up",
    'your promotion is coming',
  ];
  const lower = msg.toLowerCase();
  return promiseSignals.some((s) => lower.includes(s));
}

function detectFollowUp(msg: string): boolean {
  const followUpSignals = [
    'follow-up',
    'follow up',
    'check-in',
    'next meeting',
    'review together',
    'touch base',
  ];
  const lower = normalizeHyphens(msg.toLowerCase());
  return followUpSignals.some((s) => lower.includes(s));
}

function detectContinuityPlan(msg: string): boolean {
  const continuitySignals = [
    'documentation',
    'cross-training',
    'handover',
    'reduce dependency',
    'knowledge transfer',
  ];
  const lower = msg.toLowerCase();
  return continuitySignals.some((s) => lower.includes(s));
}

// -----------------------------
// Main Closing Engine
// -----------------------------

export function evaluateClosing(input: ClosingInput): ClosingResult {
  const { managerMessage, managerCommitmentComplete, employeeCommitmentComplete } = input;

  const violations: string[] = [];
  const requiredNextSteps: string[] = [];

  if (detectFalseReassurance(managerMessage)) {
    violations.push('False reassurance detected.');
  }

  if (detectPromotionPromise(managerMessage)) {
    violations.push('Unauthorized promotion promise detected.');
  }

  if (!detectFollowUp(managerMessage)) {
    requiredNextSteps.push('Follow-up checkpoint must be scheduled.');
  }

  if (!detectContinuityPlan(managerMessage)) {
    requiredNextSteps.push('Documentation + cross-training plan must be initiated.');
  }

  if (!managerCommitmentComplete || !employeeCommitmentComplete) {
    requiredNextSteps.push('Both commitments must be complete before closing.');
  }

  const canClose =
    violations.length === 0 &&
    requiredNextSteps.length === 0 &&
    managerCommitmentComplete &&
    employeeCommitmentComplete;

  return {
    canClose,
    violations,
    requiredNextSteps,
  };
}

// -----------------------------
// Wrapper for ClosingScreen.tsx
// -----------------------------

export function closingValidation(
  message: string,
  managerCommitmentComplete: boolean,
  employeeCommitmentComplete: boolean
) {
  // This wrapper allows ClosingScreen to call a simple function.
  // Commitment completeness is supplied by the caller, which reads the
  // commitments from the store and checks them with validateCommitments.
  const result = evaluateClosing({
    managerMessage: message,
    managerCommitmentComplete,
    employeeCommitmentComplete,
  });

  return {
    valid: result.canClose,
    reason: result.violations[0] || result.requiredNextSteps[0] || null,
  };
}
