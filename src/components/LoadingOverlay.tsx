import React from 'react';

interface Props {
  visible: boolean;
  message?: string;
}

const LoadingOverlay: React.FC<Props> = ({ visible, message = 'Working…' }) => {
  if (!visible) {
    return null;
  }

  return (
    <div
      style={styles.backdrop}
      role="status"
      aria-live="polite"
      aria-busy="true"
      // Swallow interaction with everything underneath while visible.
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.preventDefault()}
    >
      {/* Keyframes cannot be expressed as inline styles. */}
      <style>{spinKeyframes}</style>

      <div style={styles.panel}>
        <span style={styles.spinner} aria-hidden="true" />
        <span style={styles.message}>{message}</span>
      </div>
    </div>
  );
};

export default LoadingOverlay;

// -----------------------------
// Keyframes
// -----------------------------

const spinKeyframes = `
@keyframes mt-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
`;

// -----------------------------
// Styles
// -----------------------------

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // Above the sticky app header (zIndex 10).
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    backgroundColor: 'rgba(26, 26, 26, 0.45)',
    cursor: 'progress',
    boxSizing: 'border-box'
  },
  panel: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '22px 28px',
    backgroundColor: '#fff',
    border: '1px solid #e6e6e6',
    borderRadius: '12px',
    fontFamily: 'Inter, sans-serif',
    color: '#1a1a1a',
    boxShadow: '0 8px 28px rgba(0, 0, 0, 0.16)'
  },
  spinner: {
    display: 'inline-block',
    flex: '0 0 auto',
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    border: '3px solid #e6e6e6',
    borderTopColor: '#0078D4',
    animation: 'mt-spin 0.8s linear infinite'
  },
  message: {
    fontSize: '16px',
    fontWeight: 600,
    letterSpacing: '-0.01em'
  }
};