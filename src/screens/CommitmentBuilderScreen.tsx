import React, { useState } from 'react';
import { useNavigationState } from '../store/navigationState';
import { useConversationState } from '../store/conversationState';
import { useAuthState } from '../store/authState';
import { validateCommitments } from '../engine/commitmentEngine';
import { logAnalyticsEvent } from '../engine/analytics';
import { useActiveScenarioState } from '../store/activeScenarioState';

const CommitmentBuilderScreen: React.FC = () => {
  const { setCurrentScreen } = useNavigationState();
  const {
    managerCommitment,
    employeeCommitment,
    setManagerCommitment,
    setEmployeeCommitment
  } = useConversationState();

  const user = useAuthState((state) => state.user);
  const uid = user ? user.uid : null;
  const scenarioId = useActiveScenarioState((state) => state.scenarioId);

  const [error, setError] = useState<string | null>(null);

  const handleNext = () => {
    const result = validateCommitments(managerCommitment, employeeCommitment);
    if (!result.valid) {
      setError(result.error);
      return;
    }
    setError(null);

    // Fired here, not in the input onChange handlers. Those run on every
    // keystroke — one Firestore write per character typed. This is the
    // point at which both commitments are actually committed.
    if (uid) {
      void logAnalyticsEvent(uid, scenarioId, 'commitment_added', 'commitments');
    }

    setCurrentScreen('closing');
  };

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <p style={styles.eyebrow}>Commitments</p>
        <h1 style={styles.title}>Commitment Builder</h1>
        <p style={styles.subtitle}>
          Capture clear, actionable commitments from both sides. Each one needs an
          action, an owner and a date.
        </p>
      </header>

      <div style={styles.divider} />

      {/* Error */}
      {error && (
        <div style={styles.errorBox}>
          <h3 style={styles.errorTitle}>Missing Fields</h3>
          <p style={styles.errorText}>{error}</p>
        </div>
      )}

      {/* Manager Commitment */}
      <section style={styles.section}>
        <h2 style={styles.sectionLabel}>Manager Commitment</h2>

        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <h3 style={styles.cardTitle}>What you will do</h3>
            <span style={styles.ownerChip}>Owner: Manager</span>
          </div>

          <div style={styles.field}>
            <label style={styles.fieldLabel} htmlFor="manager-action">
              Action
            </label>
            <input
              id="manager-action"
              style={styles.input}
              placeholder="e.g. Clarify scope and visibility for the reporting pipeline"
              value={managerCommitment?.action || ''}
              onChange={(e) =>
                setManagerCommitment({
                  action: e.target.value,
                  owner: 'manager',
                  date: managerCommitment?.date || ''
                })
              }
            />
          </div>

          <div style={styles.fieldNarrow}>
            <label style={styles.fieldLabel} htmlFor="manager-date">
              Date
            </label>
            <input
              id="manager-date"
              type="date"
              style={styles.input}
              value={managerCommitment?.date || ''}
              onChange={(e) =>
                setManagerCommitment({
                  action: managerCommitment?.action || '',
                  owner: 'manager',
                  date: e.target.value
                })
              }
            />
          </div>
        </div>
      </section>

      {/* Employee Commitment */}
      <section style={styles.section}>
        <h2 style={styles.sectionLabel}>Employee Commitment</h2>

        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <h3 style={styles.cardTitle}>What they will do</h3>
            <span style={styles.ownerChip}>Owner: Employee</span>
          </div>

          <div style={styles.field}>
            <label style={styles.fieldLabel} htmlFor="employee-action">
              Action
            </label>
            <input
              id="employee-action"
              style={styles.input}
              placeholder="e.g. Add a quality control step before monthly reporting"
              value={employeeCommitment?.action || ''}
              onChange={(e) =>
                setEmployeeCommitment({
                  action: e.target.value,
                  owner: 'employee',
                  date: employeeCommitment?.date || ''
                })
              }
            />
          </div>

          <div style={styles.fieldNarrow}>
            <label style={styles.fieldLabel} htmlFor="employee-date">
              Date
            </label>
            <input
              id="employee-date"
              type="date"
              style={styles.input}
              value={employeeCommitment?.date || ''}
              onChange={(e) =>
                setEmployeeCommitment({
                  action: employeeCommitment?.action || '',
                  owner: 'employee',
                  date: e.target.value
                })
              }
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <div style={styles.ctaRow}>
        <p style={styles.ctaHint}>
          Both commitments must be complete before the conversation can close.
        </p>
        <button style={styles.cta} onClick={handleNext}>
          Proceed to Closing
        </button>
      </div>
    </div>
  );
};

export default CommitmentBuilderScreen;

// -----------------------------
// Styles
// -----------------------------

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: 'var(--mt-page-padding, 40px)',
    maxWidth: 'var(--mt-page-max-width, 900px)',
    margin: '0 auto',
    fontFamily: 'Inter, sans-serif',
    lineHeight: 1.6,
    color: '#1a1a1a'
  },
  header: {
    marginBottom: '28px'
  },
  eyebrow: {
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#6b7280',
    margin: '0 0 10px 0'
  },
  title: {
    fontSize: '34px',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    lineHeight: 1.2,
    margin: '0 0 12px 0'
  },
  subtitle: {
    fontSize: '17px',
    color: '#444',
    maxWidth: '68ch',
    margin: 0
  },
  divider: {
    height: '1px',
    backgroundColor: '#e6e6e6',
    margin: '0 0 36px 0'
  },
  errorBox: {
    backgroundColor: '#fff5f5',
    border: '1px solid #f3c2c2',
    borderRadius: '10px',
    padding: '18px 20px',
    marginBottom: '32px'
  },
  errorTitle: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#9b2c2c',
    margin: '0 0 6px 0'
  },
  errorText: {
    fontSize: '15px',
    color: '#7a2626',
    margin: 0
  },
  section: {
    marginBottom: '32px'
  },
  sectionLabel: {
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#6b7280',
    margin: '0 0 16px 0'
  },
  card: {
    padding: '24px',
    backgroundColor: '#fafafa',
    border: '1px solid #e6e6e6',
    borderRadius: '12px'
  },
  cardHeader: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '20px'
  },
  cardTitle: {
    fontSize: '17px',
    fontWeight: 600,
    margin: 0
  },
  ownerChip: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '999px',
    backgroundColor: '#eef4fb',
    color: '#0b5fa5',
    fontSize: '13px',
    fontWeight: 600
  },
  field: {
    marginBottom: '18px'
  },
  fieldNarrow: {
    marginBottom: '0',
    maxWidth: '260px'
  },
  fieldLabel: {
    display: 'block',
    fontSize: '14px',
    fontWeight: 600,
    color: '#374151',
    marginBottom: '8px'
  },
  input: {
    width: '100%',
    padding: '13px 14px',
    borderRadius: '8px',
    border: '1px solid #d4d4d4',
    backgroundColor: '#fff',
    fontSize: '16px',
    fontFamily: 'Inter, sans-serif',
    color: '#1a1a1a',
    boxSizing: 'border-box'
  },
  ctaRow: {
    marginTop: '8px',
    paddingTop: '28px',
    borderTop: '1px solid #e6e6e6',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '16px',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  ctaHint: {
    fontSize: '14px',
    color: '#6b7280',
    margin: 0,
    maxWidth: '46ch'
  },
  cta: {
    padding: '16px 28px',
    fontSize: '18px',
    fontWeight: 600,
    backgroundColor: '#0078D4',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer'
  }
};

