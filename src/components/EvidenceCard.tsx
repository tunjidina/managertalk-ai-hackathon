import React from 'react';

interface Props {
  text: string;
}

const EvidenceCard: React.FC<Props> = ({ text }) => {
  return (
    <div style={styles.card}>
      <h3 style={styles.label}>Observable</h3>
      <p style={styles.text}>{text}</p>
    </div>
  );
};

export default EvidenceCard;

// -----------------------------
// Styles
// -----------------------------

const styles: Record<string, React.CSSProperties> = {
  card: {
    padding: '16px',
    backgroundColor: '#f7f7f7',
    borderRadius: '8px',
    border: '1px solid #ddd',
    fontFamily: 'Inter, sans-serif',
  },
  label: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#444',
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  text: {
    fontSize: '15px',
    lineHeight: 1.5,
    color: '#222',
  },
};
