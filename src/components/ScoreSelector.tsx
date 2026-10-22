import React from 'react';

interface Props {
  label: string;
  value: number | null;
  onChange: (score: number) => void;
}

const ScoreSelector: React.FC<Props> = ({ label, value, onChange }) => {
  return (
    <div style={styles.container}>
      <p style={styles.label}>{label}</p>

      <div style={styles.buttonRow}>
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            style={{
              ...styles.scoreButton,
              backgroundColor: value === score ? '#0078D4' : '#e0e0e0',
              color: value === score ? '#fff' : '#333',
            }}
            onClick={() => onChange(score)}
          >
            {score}
          </button>
        ))}
      </div>
    </div>
  );
};

export default ScoreSelector;

// -----------------------------
// Styles
// -----------------------------

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '16px',
    fontWeight: 600,
  },
  buttonRow: {
    display: 'flex',
    gap: '12px',
  },
  scoreButton: {
    padding: '10px 16px',
    borderRadius: '6px',
    border: 'none',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
    minWidth: '48px',
    textAlign: 'center',
  },
};
