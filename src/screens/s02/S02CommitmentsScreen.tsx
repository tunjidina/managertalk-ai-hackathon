import React from 'react';

import S02StageScreen, { styles } from './S02StageScreen';
import { S02BlueprintMissing, useS02Blueprint } from './S02BlueprintGuard';
import { useS02SessionState } from '../../store/s02SessionState';
import {
  CommitmentOwner,
  S02Commitment,
  checkCommitmentSet
} from '../../engine/s02/commitmentValidator';

/**
 * Stage 4 — Commitment Builder.
 *
 * Commitments are captured as structured records, not prose. The
 * constraints require observable / owned / dated / feasible, and prose
 * cannot be checked for a date or an owner without guessing — guessing
 * wrong tells a manager their commitment is malformed when it is not.
 */
const S02CommitmentsScreen: React.FC = () => {
  const blueprint = useS02Blueprint();

  const managerCommitment = useS02SessionState((state) => state.managerCommitment);
  const employeeCommitment = useS02SessionState((state) => state.employeeCommitment);
  const setManagerCommitment = useS02SessionState((state) => state.setManagerCommitment);
  const setEmployeeCommitment = useS02SessionState((state) => state.setEmployeeCommitment);

  if (!blueprint) {
    return <S02BlueprintMissing />;
  }

  const expectations = blueprint.commitment_expectations;
  const check = checkCommitmentSet(managerCommitment, employeeCommitment);

  const update = (
    owner: CommitmentOwner,
    field: 'action' | 'date' | 'context',
    value: string
  ) => {
    const existing =
      owner === 'manager' ? managerCommitment : employeeCommitment;

    const next: S02Commitment = {
      owner,
      action: existing ? existing.action : '',
      date: existing ? existing.date : '',
      context: existing ? existing.context : ''
    };

    if (field === 'action') {
      next.action = value;
    } else if (field === 'date') {
      next.date = value;
    } else {
      next.context = value;
    }

    if (owner === 'manager') {
      setManagerCommitment(next);
    } else {
      setEmployeeCommitment(next);
    }
  };

  const renderGroup = (owner: CommitmentOwner, commitment: S02Commitment | null) => {
    const state = owner === 'manager' ? check.manager : check.employee;

    return (
      <div style={styles.fieldGroup}>
        <h3 style={styles.fieldGroupTitle}>{owner}</h3>

        <div style={styles.field}>
          <label style={styles.fieldLabel} htmlFor={owner + '-action'}>
            action
          </label>
          <input
            id={owner + '-action'}
            style={styles.input}
            value={commitment ? commitment.action : ''}
            onChange={(event) => update(owner, 'action', event.target.value)}
          />
        </div>

        <div style={styles.field}>
          <label style={styles.fieldLabel} htmlFor={owner + '-context'}>
            context
          </label>
          <input
            id={owner + '-context'}
            style={styles.input}
            value={commitment ? commitment.context : ''}
            onChange={(event) => update(owner, 'context', event.target.value)}
          />
        </div>

        <div style={styles.field}>
          <label style={styles.fieldLabel} htmlFor={owner + '-date'}>
            date
          </label>
          <input
            id={owner + '-date'}
            type="date"
            style={styles.input}
            value={commitment ? commitment.date : ''}
            onChange={(event) => update(owner, 'date', event.target.value)}
          />
        </div>

        {state.violations.length > 0 && (
          <ul style={styles.list}>
            {state.violations.map((violation) => (
              <li key={violation} style={styles.violationItem}>
                {violation}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  const extras = (
    <div>
      <div style={styles.fieldGrid}>
        {renderGroup('manager', managerCommitment)}
        {renderGroup('employee', employeeCommitment)}
      </div>

      <div style={styles.cardNeutral}>
        <ul style={styles.list}>
          {expectations.unacceptable.map((item, index) => (
            <li key={index} style={styles.listItem}>
              {item}
            </li>
          ))}
          {expectations.structural.map((item, index) => (
            <li key={'s' + index} style={styles.listItem}>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  return (
    <S02StageScreen
      blueprint={blueprint}
      stage="commitments"
      extras={extras}
      canAdvance={check.bilateral}
    />
  );
};

export default S02CommitmentsScreen;
