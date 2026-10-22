import React from 'react';

interface Props {
  message?: string;
}

const LoadingFallback: React.FC<Props> = ({ message = 'Loading scenario…' }) => {
  return (
    <div style={styles.page} role="status" aria-live="polite" aria-busy="true">
      {/* Keyframes cannot be expressed as inline styles. */}
      <style>{pulseKeyframes}</style>

      <div style={styles.card}>
        <div style={styles.header}>
          <span style={styles.spinner} aria-hidden="true" />
          <span style={styles.message}>{message}</span>
        </div>

        <div style={styles.skeletonGroup} aria-hidden="true">
          <div style={{ ...styles.skeletonLine, width: '45%', height: '22px' }} />
          <div style={{ ...styles.skeletonLine, width: '85%' }} />
          <div style={{ ...styles.skeletonLine, width: '72%' }} />
          <div style={{ ...styles.skeletonLine, width: '60%' }} />
        </div>
      </div>
    </div>
  );
};

export default LoadingFallback;

// -----------------------------
// Keyframes
// -----------------------------

const pulseKeyframes = `
@keyframes mt-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes mt-pulse {
  0% { opacity: 1; }
  50% { opacity: 0.45; }
  100% { opacity: 1; }
}
`;

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
    backgroundColor: '#fafafa',
    border: '1px solid #e6e6e6',
    borderRadius: '12px'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    marginBottom: '28px'
  },
  spinner: {
    display: 'inline-block',
    flex: '0 0 auto',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    border: '3px solid #e6e6e6',
    borderTopColor: '#0078D4',
    animation: 'mt-spin 0.8s linear infinite'
  },
  message: {
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#6b7280'
  },
  skeletonGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px'
  },
  skeletonLine: {
    height: '14px',
    borderRadius: '6px',
    backgroundColor: '#ededed',
    animation: 'mt-pulse 1.4s ease-in-out infinite'
  }
};