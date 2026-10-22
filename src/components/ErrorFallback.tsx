import React from 'react';

interface Props {
  onRestart: () => void;
}

const ErrorFallback: React.FC<Props> = ({ onRestart }) => {
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <p style={styles.eyebrow}>Something went wrong</p>
        <h1 style={styles.title}>The scenario stopped unexpectedly</h1>

        <p style={styles.body}>
          ManagerTalk hit an unexpected problem and could not continue the
          conversation. Nothing you entered has been sent anywhere, and restarting
          the scenario will put you back at the beginning.
        </p>

        <div style={styles.ctaRow}>
          <button style={styles.cta} onClick={onRestart}>
            Restart Scenario
          </button>
          <span style={styles.hint}>
            If this keeps happening, reload the page.
          </span>
        </div>
      </div>
    </div>
  );
};

export default ErrorFallback;

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
    color: '#1a1a1a',
    boxSizing: 'border-box'
  },
  card: {
    padding: '32px',
    backgroundColor: '#fff',
    border: '1px solid #e6e6e6',
    borderLeft: '3px solid #9b2c2c',
    borderRadius: '12px'
  },
  eyebrow: {
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#9b2c2c',
    margin: '0 0 10px 0'
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    lineHeight: 1.25,
    margin: '0 0 16px 0'
  },
  body: {
    fontSize: '16px',
    color: '#444',
    maxWidth: '62ch',
    margin: '0 0 28px 0'
  },
  ctaRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '16px',
    alignItems: 'center'
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
  },
  hint: {
    fontSize: '14px',
    color: '#6b7280'
  }
};