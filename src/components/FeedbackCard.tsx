import React from 'react';

interface Props {
  title: string;
  text: string;
}

const FeedbackCard: React.FC<Props> = ({ title, text }) => {
  return (
    <div style={styles.card}>
      <h3 style={styles.cardTitle}>{title}</h3>
      <p style={styles.cardText}>{text}</p>
    </div>
  );
};

export default FeedbackCard;

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
  cardTitle: {
    fontSize: '18px',
    fontWeight: 600,
    marginBottom: '8px',
  },
  cardText: {
    fontSize: '15px',
    lineHeight: 1.5,
  },
};
