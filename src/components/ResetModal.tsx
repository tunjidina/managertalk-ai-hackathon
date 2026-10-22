import React, { useEffect } from 'react';

interface Props {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const ResetModal: React.FC<Props> = ({ visible, onCancel, onConfirm }) => {
  // Escape closes the dialog without resetting.
  useEffect(() => {
    if (!visible) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, onCancel]);

  if (!visible) {
    return null;
  }

  return (
    <div style={styles.backdrop} onClick={onCancel}>
      <div
        style={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-modal-title"
        aria-describedby="reset-modal-body"
        // Clicks inside the dialog must not reach the dismissing backdrop.
        onClick={(e) => e.stopPropagation()}
      >
        <p style={styles.eyebrow}>Session Reset</p>

        <h2 id="reset-modal-title" style={styles.title}>
          Are you sure you want to restart the scenario?
        </h2>

        <p id="reset-modal-body" style={styles.body}>
          Your messages, commitments and scores for this run will be cleared, and
          you will return to the scenario overview.
        </p>

        <div style={styles.actions}>
          <button style={styles.secondary} onClick={onCancel} autoFocus>
            Cancel
          </button>
          <button style={styles.primary} onClick={onConfirm}>
            Restart
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResetModal;

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
    // Above the loading overlay (1000) and the sticky header (10).
    zIndex: 1100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    backgroundColor: 'rgba(26, 26, 26, 0.45)',
    boxSizing: 'border-box'
  },
  dialog: {
    width: '100%',
    maxWidth: '460px',
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