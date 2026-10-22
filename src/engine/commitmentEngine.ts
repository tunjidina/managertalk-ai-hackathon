// -----------------------------
// Types (from your documents)
// -----------------------------

export interface Commitment {
  action: string;
  owner: 'manager' | 'employee';
  date: string;
}

export interface CommitmentValidation {
  isComplete: boolean;
  missingFields: string[];
}

export interface DualCommitmentValidation {
  manager: CommitmentValidation;
  employee: CommitmentValidation;
  allComplete: boolean;
  valid: boolean;
  error: string | null;
}

// -----------------------------
// Validation Rules (from JSON Blueprint)
// -----------------------------
//
// A commitment is incomplete if ANY of the following are missing:
// - action
// - owner
// - date
//
// "No commitment is considered complete merely because the manager or employee
// expresses general agreement."
//
// Both commitments must be complete before closing is allowed.
//

function validateSingleCommitment(commitment: Commitment | null): CommitmentValidation {
  const missing: string[] = [];

  if (!commitment) {
    return {
      isComplete: false,
      missingFields: ['action', 'owner', 'date'],
    };
  }

  if (!commitment.action || commitment.action.trim().length === 0) {
    missing.push('action');
  }

  if (!commitment.owner) {
    missing.push('owner');
  }

  if (!commitment.date || commitment.date.trim().length === 0) {
    missing.push('date');
  }

  return {
    isComplete: missing.length === 0,
    missingFields: missing,
  };
}

// -----------------------------
// Dual Commitment Validation
// -----------------------------

export function validateCommitments(
  managerCommitment: Commitment | null,
  employeeCommitment: Commitment | null
): DualCommitmentValidation {
  const manager = validateSingleCommitment(managerCommitment);
  const employee = validateSingleCommitment(employeeCommitment);
  const allComplete = manager.isComplete && employee.isComplete;

  const problems: string[] = [];
  if (!manager.isComplete) {
    problems.push('Manager commitment missing: ' + manager.missingFields.join(', '));
  }
  if (!employee.isComplete) {
    problems.push('Employee commitment missing: ' + employee.missingFields.join(', '));
  }

  return {
    manager,
    employee,
    allComplete,
    valid: allComplete,
    error: problems.length > 0 ? problems.join(' | ') : null,
  };
}

// -----------------------------
// Commitment Examples (from JSON Blueprint)
// -----------------------------
//
// Manager permitted examples:
// - Scope clarification
// - Visibility action
// - Development step
// - Operational continuity action
//
// Employee permitted examples:
// - Quality control step
// - Reporting timeline adjustment
// - Handover milestone
//
// These are validated by the UI layer, not the engine.
// The engine only checks structural completeness.
//

export function isManagerCommitmentTypeValid(action: string): boolean {
  const allowed = [
    'scope clarification',
    'visibility action',
    'development step',
    'operational continuity action',
  ];

  return allowed.some((type) => action.toLowerCase().includes(type));
}

export function isEmployeeCommitmentTypeValid(action: string): boolean {
  const allowed = [
    'quality control step',
    'reporting timeline adjustment',
    'handover milestone',
  ];

  return allowed.some((type) => action.toLowerCase().includes(type));
}