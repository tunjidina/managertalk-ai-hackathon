import React from 'react';

interface Props {
  visible: boolean;
  savedAt?: number;
  onContinue: () => void;
  onStartOver: () => void;
}

const RestoreModal: React.FC<Props> = ({
  visible,
  savedAt,
  onContinue,
  onStartOver
}) => {
  if (!visible) {
    return null;
  }

  return (
    <div style={styles.backdrop}>
      <div
        style={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="restore-modal-title"
        aria-describedby="restore-modal-body"
      >
        <p style={styles.eyebrow}>Saved Session</p>

        <h2 id="restore-modal-title" style={styles.title}>
          Continue where you left off?
        </h2>

        <p id="restore-modal-body" style={styles.body}>
          An unfinished scenario is saved on this device
          {savedAt ? ` from ${formatSavedAt(savedAt)}` : ''}. You can pick it up
          from the screen you were on, or clear it and start the scenario again.
        </p>

        <div style={styles.actions}>
          <button style={styles.secondary} onClick={onStartOver}>
            Start Over
          </button>
          <button style={styles.primary} onClick={onContinue} autoFocus>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};

export default RestoreModal;

// -----------------------------
// Helpers
// -----------------------------

function formatSavedAt(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return 'an earlier session';
  }
}

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
    // Above the reset modal (1100), the loading overlay (1000)
    // and the sticky header (10).
    zIndex: 1200,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    backgroundColor: 'rgba(26, 26, 26, 0.45)',
    boxSizing: 'border-box'
  },
  dialog: {
    width: '100%',
    maxWidth: '470px',
    padding: '28px',
    backgroundColor: '#fff',
    border: '1px solid #e6e6e6',
    borderRadius: '12px',
    boxShadow: '0 12px 36px rgba(0, 0, 0, 0.18)',
    fontFamily: 'Inter, sans-serif',
    lineHeight: 1.6,
    color: '#1a1a1a',
    boxSizing: 'border-box'
  },
  eyebrow: {
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#6b7280',
    margin: '0 0 10px 0'
  },
  title: {
    fontSize: '21px',
    fontWeight: 700,
    letterSpacing: '-0.01em',
    lineHeight: 1.3,
    margin: '0 0 12px 0'
  },
  body: {
    fontSize: '15px',
    color: '#444',
    margin: '0 0 26px 0'
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    justifyContent: 'flex-end'
  },
  secondary: {
    padding: '12px 22px',
    fontSize: '15px',
    fontWeight: 600,
    backgroundColor: '#fff',
    color: '#374151',
    border: '1px solid #d4d4d4',
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif'
  },
  primary: {
    padding: '12px 22px',
    fontSize: '15px',
    fontWeight: 600,
    backgroundColor: '#0078D4',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif'
  }
};