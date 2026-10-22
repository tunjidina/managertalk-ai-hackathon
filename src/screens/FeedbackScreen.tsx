import React from 'react';
import { useConversationState } from '../store/conversationState';
import { useNavigationState } from '../store/navigationState';
import { scenarioData } from '../utils/jsonLoader';

const FeedbackScreen: React.FC = () => {
  const { scoreResult } = useConversationState();
  const { setCurrentScreen } = useNavigationState();

  if (!scoreResult) {
    return (
      <div style={styles.page}>
        <header style={styles.header}>
          <p style={styles.eyebrow}>Feedback</p>
          <h1 style={styles.title}>Conversation Feedback</h1>
        </header>

        <div style={styles.divider} />

        <p style={styles.emptyState}>
          No score result found. Please restart the scenario.
        </p>

        <div style={styles.ctaRow}>
          <button style={styles.cta} onClick={() => setCurrentScreen('scenario_overview')}>
            Restart Scenario
          </button>
        </div>
      </div>
    );
  }

  const feedback = scenarioData.feedback_engine[scoreResult.tier];

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <p style={styles.eyebrow}>Feedback</p>
        <h1 style={styles.title}>Conversation Feedback</h1>

        <div style={styles.badgeRow}>
          <span style={styles.badge}>{scoreResult.tier.toUpperCase()}</span>
        </div>

        <p style={styles.subtitle}>
          Based on your clarity, empathy and directness scores.
        </p>
      </header>

      <div style={styles.divider} />

      {/* Strengths */}
      <section style={styles.section}>
        <h2 style={styles.sectionLabel}>Strengths</h2>
        <div style={styles.cardPositive}>
          <p style={styles.cardText}>{feedback.did_well}</p>
        </div>
      </section>

      {/* Areas for Improvement */}
      <section style={styles.section}>
        <h2 style={styles.sectionLabel}>Areas for Improvement</h2>
        <div style={styles.cardCaution}>
          <p style={styles.cardText}>{feedback.missed}</p>
        </div>
      </section>

      {/* Next Step */}
      <section style={styles.section}>
        <h2 style={styles.sectionLabel}>Next Step</h2>
        <div style={styles.cardAction}>
          <p style={styles.cardText}>{feedback.next_step}</p>
        </div>
      </section>

      {/* Tip */}
      <section style={styles.section}>
        <h2 style={styles.sectionLabel}>Tip</h2>
        <div style={styles.cardNeutral}>
          <p style={styles.cardText}>{feedback.tip}</p>
        </div>
      </section>

      {/* CTA */}
      <div style={styles.ctaRow}>
        <p style={styles.ctaHint}>
          Run the scenario again to practise the behaviours you missed.
        </p>

        <div style={styles.ctaButtons}>
          <button
            style={styles.secondaryCta}
            onClick={() => setCurrentScreen('certificate')}
          >
            View Certificate
          </button>

          <button style={styles.cta} onClick={() => setCurrentScreen('scenario_overview')}>
            Restart Scenario
          </button>
        </div>
      </div>
    </div>
  );
};

export default FeedbackScreen;

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
    margin: '0 0 14px 0'
  },
  badgeRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginBottom: '14px'
  },
  badge: {
    display: 'inline-block',
    padding: '4px 14px',
    borderRadius: '999px',
    backgroundColor: '#eef4fb',
    color: '#0b5fa5',
    fontSize: '13px',
    fontWeight: 700,
    letterSpacing: '0.06em'
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
    marginBottom: '28px'
  },
  sectionLabel: {
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#6b7280',
    margin: '0 0 12px 0'
  },
  cardPositive: {
    padding: '20px 22px',
    backgroundColor: '#fafafa',
    border: '1px solid #e6e6e6',
    borderLeft: '3px solid #2f855a',
    borderRadius: '10px'
  },
  cardCaution: {
    padding: '20px 22px',
    backgroundColor: '#fafafa',
    border: '1px solid #e6e6e6',
    borderLeft: '3px solid #b7791f',
    borderRadius: '10px'
  },
  cardAction: {
    padding: '20px 22px',
    backgroundColor: '#fafafa',
    border: '1px solid #e6e6e6',
    borderLeft: '3px solid #0078D4',
    borderRadius: '10px'
  },
  cardNeutral: {
    padding: '20px 22px',
    backgroundColor: '#fafafa',
    border: '1px solid #e6e6e6',
    borderLeft: '3px solid #9ca3af',
    borderRadius: '10px'
  },
  cardText: {
    fontSize: '16px',
    color: '#1a1a1a',
    margin: 0,
    maxWidth: '68ch'
  },
  emptyState: {
    fontSize: '16px',
    color: '#6b7280',
    backgroundColor: '#fafafa',
    border: '1px dashed #dcdcdc',
    borderRadius: '10px',
    padding: '24px',
    margin: '0 0 8px 0'
  },
  ctaRow: {
    marginTop: '12px',
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
  ctaButtons: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    alignItems: 'center'
  },
  secondaryCta: {
    padding: '16px 28px',
    fontSize: '16px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    backgroundColor: '#fff',
    color: '#374151',
    border: '1px solid #d4d4d4',
    borderRadius: '8px',
    cursor: 'pointer'
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

