// src/engine/s02/commitmentValidator.ts
//
// Enforces the commitment constraints from the blueprint and the
// Implementation Notes:
//
//   observable · owned · dated · feasible
//   at least one manager-owned commitment addressing her process failure
//   at least one employee commitment addressing behaviour in a defined context
//   no attitudinal commitments
//   no commitments requiring Aoife's undisclosed cooperation
//   no commitments requiring concession of technical position
//
// Commitments are captured as structured records rather than prose. Prose
// cannot be checked for a date or an owner without guessing, and guessing
// wrong here tells a manager their commitment is malformed when it is not.

import {
  ATTITUDINAL_MARKERS,
  AOIFE_MARKERS,
  CONCESSION_MARKERS,
  containsAny,
  matchedMarkers,
  wordCount
} from './textSignals';

export type CommitmentOwner = 'manager' | 'employee';

export interface S02Commitment {
  owner: CommitmentOwner;
  /** What will be done. Must describe an action, not a disposition. */
  action: string;
  /** ISO date (yyyy-mm-dd) from the date input. */
  date: string;
  /** Where the action is observable — a named meeting, forum or artefact. */
  context: string;
}

export type CommitmentViolation =
  | 'missing-action'
  | 'missing-date'
  | 'missing-context'
  | 'date-in-past'
  | 'date-beyond-window'
  | 'attitudinal'
  | 'requires-aoife'
  | 'requires-concession'
  | 'not-observable';

export interface CommitmentCheck {
  owner: CommitmentOwner;
  valid: boolean;
  violations: CommitmentViolation[];
  /** Which markers fired, for the feedback stage. Never rendered as copy. */
  markers: string[];
}

export interface CommitmentSetCheck {
  manager: CommitmentCheck;
  employee: CommitmentCheck;
  /** Both present, both valid, one owner each. */
  bilateral: boolean;
  /** Any commitment tripped the attitudinal detector. */
  attitudinalPresent: boolean;
  valid: boolean;
}

/** Feasibility window: a commitment must be testable before a checkpoint. */
export const MAX_COMMITMENT_WINDOW_DAYS = 90;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Parses an ISO date at UTC midnight. Returns null for anything the date
 * input did not produce — a blank field reads as missing, not as invalid.
 */
function parseIsoDate(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const ms = Date.parse(value + 'T00:00:00Z');
  return isNaN(ms) ? null : ms;
}

function startOfTodayUtc(now: number): number {
  const date = new Date(now);
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );
}

/**
 * A single commitment. `now` is injectable so the checks are testable
 * without freezing the clock.
 */
export function checkCommitment(
  commitment: S02Commitment,
  now: number = Date.now()
): CommitmentCheck {
  const violations: CommitmentViolation[] = [];
  const markers: string[] = [];

  const action = commitment.action || '';
  const context = commitment.context || '';

  if (wordCount(action) < 3) {
    violations.push('missing-action');
  }

  if (wordCount(context) < 1) {
    violations.push('missing-context');
  }

  // Dated, and feasible before a checkpoint.
  const dateMs = parseIsoDate(commitment.date || '');
  if (dateMs === null) {
    violations.push('missing-date');
  } else {
    const today = startOfTodayUtc(now);
    if (dateMs < today) {
      violations.push('date-in-past');
    } else if (dateMs - today > MAX_COMMITMENT_WINDOW_DAYS * MS_PER_DAY) {
      violations.push('date-beyond-window');
    }
  }

  // Attitudinal: a disposition rather than an act.
  const attitudinalHits = matchedMarkers(action, ATTITUDINAL_MARKERS);
  if (attitudinalHits.length > 0) {
    violations.push('attitudinal');
    markers.push.apply(markers, attitudinalHits);
  }

  // Requires a third party who has not been consulted.
  if (containsAny(action, AOIFE_MARKERS) || containsAny(context, AOIFE_MARKERS)) {
    violations.push('requires-aoife');
    markers.push.apply(markers, matchedMarkers(action, AOIFE_MARKERS));
  }

  // Requires conceding the technical position.
  const concessionHits = matchedMarkers(action, CONCESSION_MARKERS);
  if (concessionHits.length > 0) {
    violations.push('requires-concession');
    markers.push.apply(markers, concessionHits);
  }

  // Observability: an action with no verb and no context cannot be seen
  // happening by a third party.
  if (
    violations.indexOf('missing-action') === -1 &&
    violations.indexOf('missing-context') === -1 &&
    violations.indexOf('attitudinal') === -1 &&
    wordCount(action) < 4
  ) {
    violations.push('not-observable');
  }

  return {
    owner: commitment.owner,
    valid: violations.length === 0,
    violations,
    markers
  };
}

/**
 * The pair. Bilateral is the structural requirement — "Both parties must
 * commit" — and "Assigning all commitments to Tomás" is prohibited, so a
 * set with two employee commitments and no manager commitment fails even
 * if both are individually well formed.
 */
export function checkCommitmentSet(
  managerCommitment: S02Commitment | null,
  employeeCommitment: S02Commitment | null,
  now: number = Date.now()
): CommitmentSetCheck {
  const emptyManager: S02Commitment = {
    owner: 'manager',
    action: '',
    date: '',
    context: ''
  };
  const emptyEmployee: S02Commitment = {
    owner: 'employee',
    action: '',
    date: '',
    context: ''
  };

  const manager = checkCommitment(managerCommitment || emptyManager, now);
  const employee = checkCommitment(employeeCommitment || emptyEmployee, now);

  const bilateral =
    managerCommitment !== null &&
    employeeCommitment !== null &&
    manager.valid &&
    employee.valid;

  const attitudinalPresent =
    manager.violations.indexOf('attitudinal') !== -1 ||
    employee.violations.indexOf('attitudinal') !== -1;

  return {
    manager,
    employee,
    bilateral,
    attitudinalPresent,
    valid: bilateral
  };
}

/**
 * Commitment dates must fall on or before the checkpoint named at closing.
 * Checked at the closing stage, because the checkpoint does not exist yet
 * when the commitments are written.
 */
export function commitmentsFitCheckpoint(
  commitments: Array<S02Commitment | null>,
  checkpointIso: string
): boolean {
  const checkpoint = parseIsoDate(checkpointIso);
  if (checkpoint === null) {
    return false;
  }

  for (let i = 0; i < commitments.length; i += 1) {
    const commitment = commitments[i];
    if (!commitment) {
      return false;
    }
    const date = parseIsoDate(commitment.date);
    if (date === null || date > checkpoint) {
      return false;
    }
  }

  return true;
}
