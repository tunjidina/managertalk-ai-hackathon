import React from 'react';
import { Commitment, validateCommitments } from '../engine/commitmentEngine';

interface Props {
  managerCommitment: Commitment | null;
  employeeCommitment: Commitment | null;
  onManagerCommitmentChange: (c: Commitment) => void;
  onEmployeeCommitmentChange: (c: Commitment) => void;
  onContinue: () => void;
}

const CommitmentForm: React.FC<Props> = ({
  managerCommitment,
  employeeCommitment,
  onManagerCommitmentChange,
  onEmployeeCommitmentChange,
  onContinue,
}) => {
  const validation = validateCommitments(managerCommitment, employeeCommitment);
  const canContinue = validation.allComplete;

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Commitment Builder</h2>

      {/* Manager Commitment */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Manager Commitment</h3>

        <label htmlFor="commitment-manager-action" style={styles.label}>Action</label>
        <input
          id="commitment-manager-action"
          style={styles.input}
          value={managerCommitment?.action || ''}
          onChange={(e) =>
            onManagerCommitmentChange({
              action: e.target.value,
              owner: 'manager',
              date: managerCommitment?.date || '',
            })
          }
        />

        <label htmlFor="commitment-manager-owner" style={styles.label}>Owner</label>
        <input id="commitment-manager-owner" style={styles.input} value="manager" disabled />

        <label htmlFor="commitment-manager-date" style={styles.label}>Date</label>
        <input
          id="commitment-manager-date"
          type="date"
          style={styles.input}
          value={managerCommitment?.date || ''}
          onChange={(e) =>
            onManagerCommitmentChange({
              action: managerCommitment?.action || '',
              owner: 'manager',
              date: e.target.value,
            })
          }
        />

        {validation.manager.missingFields.length > 0 && (
          <p style={styles.error}>
            Missing: {validation.manager.missingFields.join(', ')}
          </p>
        )}
      </div>

      {/* Employee Commitment */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Employee Commitment</h3>

        <label htmlFor="commitment-employee-action" style={styles.label}>Action</label>
        <input
          id="commitment-employee-action"
          style={styles.input}
          value={employeeCommitment?.action || ''}
          onChange={(e) =>
            onEmployeeCommitmentChange({
              action: e.target.value,
              owner: 'employee',
              date: employeeCommitment?.date || '',
            })
          }
        />

        <label htmlFor="commitment-employee-owner" style={styles.label}>Owner</label>
        <input id="commitment-employee-owner" style={styles.input} value="employee" disabled />

        <label htmlFor="commitment-employee-date" style={styles.label}>Date</label>
        <input
          id="commitment-employee-date"
          type="date"
          style={styles.input}
          value={employeeCommitment?.date || ''}
          onChange={(e) =>
            onEmployeeCommitmentChange({
              action: employeeCommitment?.action || '',
              owner: 'employee',
              date: e.target.value,
            })
          }
        />

        {validation.employee.missingFields.length > 0 && (
          <p style={styles.error}>
            Missing: {validation.employee.missingFields.join(', ')}
          </p>
        )}
      </div>

      {/* Continue Button */}
      <button
        style={{
          ...styles.cta,
          backgroundColor: canContinue ? '#0078D4' : '#999',
          cursor: canContinue ? 'pointer' : 'not-allowed',
        }}
        disabled={!canContinue}
        onClick={onContinue}
      >
        Continue to Closing
      </button>
    </div>
  );
};

export default CommitmentForm;

// -----------------------------
// Styles
// -----------------------------

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '16px',
    backgroundColor: '#f7f7f7',
    borderRadius: '8px',
    border: '1px solid #ddd',
    fontFamily: 'Inter, sans-serif',
  },
  title: {
    fontSize: '22px',
    fontWeight: 700,
    marginBottom: '16px',
  },
  section: {
    marginBottom: '24px',
    padding: '12px',
    backgroundColor: '#fff',
    borderRadius: '6px',
    border: '1px solid #eee',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: 600,
    marginBottom: '12px',
  },
  label: {
    fontSize: '14px',
    marginBottom: '4px',
    display: 'block',
  },
  input: {
    width: '100%',
    padding: '10px',
    marginBottom: '12px',
    borderRadius: '6px',
    border: '1px solid #ccc',
    fontSize: '15px',
  },
  error: {
    color: '#b00020',
    fontSize: '14px',
    marginTop: '4px',
  },
  cta: {
    padding: '14px 24px',
    fontSize: '18px',
    fontWeight: 600,
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
  },
};
