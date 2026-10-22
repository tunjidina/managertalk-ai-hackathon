import React from 'react';

interface Props {
  title: string;
  items: string[];
}

const StageChecklist: React.FC<Props> = ({ title, items }) => {
  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <h2 style={styles.title}>{title}</h2>
        <span style={styles.count}>{items.length} behaviours</span>
      </div>

      <ul style={styles.list}>
        {items.map((item, index) => (
          <li key={index} style={styles.listItem}>
            <span style={styles.marker} aria-hidden="true" />
            <span style={styles.itemText}>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default StageChecklist;

// -----------------------------
// Styles
// -----------------------------

const styles: Record<string, React.CSSProperties> = {
  card: {
    padding: '22px 24px',
    backgroundColor: '#fafafa',
    border: '1px solid #e6e6e6',
    borderRadius: '12px',
    fontFamily: 'Inter, sans-serif',
    color: '#1a1a1a',
    lineHeight: 1.6
  },
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: '16px'
  },
  title: {
    fontSize: '17px',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    margin: 0
  },
  count: {
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: '#6b7280'
  },
  list: {
    listStyle: 'none',
    padding: 0,
    margin: 0
  },
  listItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '10px 0',
    borderTop: '1px solid #ededed'
  },
  marker: {
    flex: '0 0 auto',
    width: '6px',
    height: '6px',
    marginTop: '10px',
    borderRadius: '50%',
    backgroundColor: '#0078D4'
  },
  itemText: {
    fontSize: '15px',
    color: '#444'
  }
};