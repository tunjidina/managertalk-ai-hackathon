import React, { useState } from 'react';
import { useNavigationState } from '../store/navigationState';
import { useConversationState } from '../store/conversationState';
import { useAuthState } from '../store/authState';
import { closingValidation } from '../engine/closingEngine';
import { validateCommitments } from '../engine/commitmentEngine';
import { logAnalyticsEvent } from '../engine/analytics';
import { useActiveScenarioState } from '../store/activeScenarioState';
import { scenarioData } from '../utils/jsonLoader';

const ClosingScreen: React.FC = () => {
  const { setCurrentScreen } = useNavigationState();
  const { managerCommitment, employeeCommitment } = useConversationState();
  const user = useAuthState((state) => state.user);
  const uid = user ? user.uid : null;
  const scenarioId = useActiveScenarioState((state) => state.scenarioId);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  // commitmentEngine is the single source of truth for "complete".
  const commitments = validateCommitments(managerCommitment, employeeCommitment);

  const handleClose = () => {
    const result = closingValidation(
      message,
      commitments.manager.isComplete,
      commitments.employee.isComplete
    );
    if (!result.valid) {
      setError(result.reason);

      // The validator rejected this closing attempt. Fire-and-forget —
      // the rejection reason is deliberately not sent as metadata: it can
      // quote the manager's own text, which does not belong in analytics.
      if (uid) {
        void logAnalyticsEvent(uid, scenarioId, 'closing_rejected', 'closing');
      }
      return;
    }
    setError(null);
    setCurrentScreen('scoring');
  };

  const requiredBehaviors = scenarioData.conversation.closing.required_behaviors;

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <p style={styles.eyebrow}>Closing</p>
        <h1 style={styles.title}>Closing the Conversation</h1>
        <p style={styles.subtitle}>
          Craft a closing message that avoids reassurance, avoids promotion promises,
          and includes follow-up + continuity planning.
        </p>
      </header>

      <div style={styles.divider} />

      {/* Guidance */}
      <section style={styles.section}>
        <h2 style={styles.sectionLabel}>Required Closing Behaviors</h2>

        <div style={styles.card}>
          <ul style={styles.list}>
            {requiredBehaviors.map((item: string, idx: number) => (
              <li key={idx} style={styles.listItem}>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Error */}
      {error && (
        <div style={styles.errorBox}>
          <h3 style={styles.errorTitle}>Issue</h3>
          <p style={styles.errorText}>{error}</p>
        </div>
      )}

      {/* Composer */}
      <section style={styles.composerSection}>
        <h2 id="closing-message-label" style={styles.sectionLabel}>Your Closing Message</h2>

        <div style={styles.composer}>
          <textarea
            id="closing-message"
            aria-labelledby="closing-message-label"
            style={styles.textarea}
            placeholder="Write your closing message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />

          <div style={styles.composerFooter}>
            <span style={styles.hint}>
              Name concrete actions with dates. Schedule the follow-up checkpoint.
            </span>

            <button style={styles.cta} onClick={handleClose}>
              Validate Closing
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ClosingScreen;

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
  list: {
    paddingLeft: '20px',
    margin: 0
  },
  listItem: {
    fontSize: '15px',
    color: '#444',
    marginBottom: '10px'
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
  composerSection: {
    marginTop: '8px',
    paddingTop: '28px',
    borderTop: '1px solid #e6e6e6'
  },
  composer: {
    border: '1px solid #dcdcdc',
    borderRadius: '12px',
    backgroundColor: '#fff',
    padding: '8px 8px 12px 8px'
  },
  textarea: {
    width: '100%',
    minHeight: '150px',
    padding: '14px',
    border: 'none',
    resize: 'vertical',
    fontSize: '16px',
    lineHeight: 1.6,
    fontFamily: 'Inter, sans-serif',
    color: '#1a1a1a',
    backgroundColor: 'transparent',
    boxSizing: 'border-box'
  },
  composerFooter: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 6px'
  },
  hint: {
    fontSize: '13px',
    color: '#6b7280',
    maxWidth: '46ch'
  },
  cta: {
    padding: '14px 26px',
    fontSize: '16px',
    fontWeight: 600,
    backgroundColor: '#0078D4',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer'
  }
};

