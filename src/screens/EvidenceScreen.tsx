import React from 'react';
import { useNavigationState } from '../store/navigationState';
import { scenarioData } from '../utils/jsonLoader';

const EvidenceScreen: React.FC = () => {
  const { setCurrentScreen } = useNavigationState();

  const evidence = scenarioData.observable_evidence;

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Evidence Review</h1>
      <p style={styles.subtitle}>
        Before starting the conversation, review the concrete evidence you’ll reference.
      </p>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Observable Evidence</h2>
        <ul style={styles.list}>
          {evidence.map((item: string, idx: number) => (
            <li key={idx} style={styles.listItem}>{item}</li>
          ))}
        </ul>
      </div>

      <button
        style={styles.cta}
        onClick={() => setCurrentScreen('conversation_flow')}
      >
        Start Conversation
      </button>
    </div>
  );
};

export default EvidenceScreen;

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: 'var(--mt-page-padding, 40px)',
    maxWidth: 'var(--mt-page-max-width, 900px)',
    margin: '0 auto',
    fontFamily: 'Inter, sans-serif',
    lineHeight: 1.5
  },
  title: {
    fontSize: '32px',
    fontWeight: 700,
    marginBottom: '8px'
  },
  subtitle: {
    fontSize: '16px',
    color: '#666',
    marginBottom: '24px'
  },
  section: {
    marginBottom: '32px'
  },
  sectionTitle: {
    fontSize: '22px',
    fontWeight: 600,
    marginBottom: '16px'
  },
  list: {
    paddingLeft: '20px'
  },
  listItem: {
    marginBottom: '8px',
    fontSize: '16px'
  },
  cta: {
    marginTop: '40px',
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