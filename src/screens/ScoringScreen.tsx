import React, { useState } from 'react';
import { useConversationState } from '../store/conversationState';
import { useNavigationState } from '../store/navigationState';

import { scoreMessage } from '../engine/scoringEngine';
import { scenarioData } from '../utils/jsonLoader';
import ScoreSelector from '../components/ScoreSelector';

const ScoringScreen: React.FC = () => {
  const {
    lastManagerMessage,
    stage,
    branch,
    scores,
    setScores,
    setScoreResult
  } = useConversationState();
  const { setCurrentScreen } = useNavigationState();

  const [error, setError] = useState<string | null>(null);

  const rated =
    scores.clarity > 0 && scores.empathy > 0 && scores.directness > 0;

  const handleScore = () => {
    if (!rated) {
      setError('Rate clarity, empathy and directness before generating feedback.');
      return;
    }

    setError(null);

    const result = scoreMessage({
      clarity: scores.clarity,
      empathy: scores.empathy,
      directness: scores.directness,
      stage,
      branch,
      message: lastManagerMessage
    });

    setScoreResult(result);
    setCurrentScreen('feedback');
  };

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <p style={styles.eyebrow}>Scoring</p>
        <h1 style={styles.title}>Score the Conversation</h1>
        <p style={styles.subtitle}>
          Rate the conversation on each dimension using a 1–5 scale.
        </p>
      </header>

      <div style={styles.divider} />

      {/* Rubric */}
      <section style={styles.section}>
        <h2 style={styles.sectionLabel}>Scoring Rubric</h2>
        <div style={styles.card}>
          <ul style={styles.list}>
            {scenarioData.scoring_rubric.dimensions.map(
              (dim: string, idx: number) => (
                <li key={idx} style={styles.listItem}>
                  {dim}: 1 (low) → 5 (high)
                </li>
              )
            )}
          </ul>
        </div>
      </section>

      {/* Error */}
      {error && (
        <div style={styles.errorBox}>
          <h3 style={styles.errorTitle}>Incomplete</h3>
          <p style={styles.errorText}>{error}</p>
        </div>
      )}

      {/* Ratings */}
      <section style={styles.section}>
        <h2 style={styles.sectionLabel}>Your Ratings</h2>

        <div style={styles.card}>
          <div style={styles.selectorStack}>
            <ScoreSelector
              label="Clarity"
              value={scores.clarity > 0 ? scores.clarity : null}
              onChange={(score: number) => setScores({ clarity: score })}
            />
            <ScoreSelector
              label="Empathy"
              value={scores.empathy > 0 ? scores.empathy : null}
              onChange={(score: number) => setScores({ empathy: score })}
            />
            <ScoreSelector
              label="Directness"
              value={scores.directness > 0 ? scores.directness : null}
              onChange={(score: number) => setScores({ directness: score })}
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <div style={styles.ctaRow}>
        <p style={styles.ctaHint}>
          Scores are averaged into a good / mid / poor tier, which selects your
          coaching feedback.
        </p>
        <button style={styles.cta} onClick={handleScore}>
          Generate Feedback
        </button>
      </div>
    </div>
  );
};

export default ScoringScreen;

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
    color: '#1a1a1a'
  },
  header: {
    marginBottom: '28px'
  },
  eyebrow: {
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#6b7280',
    margin: '0 0 10px 0'
  },
  title: {
    fontSize: '34px',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    lineHeight: 1.2,
    margin: '0 0 12px 0'
  },
  subtitle: {
    fontSize: '17px',
    color: '#444',
    maxWidth: '68ch',
    margin: 0
  },
  divider: {
    height: '1px',
    backgroundColor: '#e6e6e6',
    margin: '0 0 36px 0'
  },
  section: {
    marginBottom: '32px'
  },
  sectionLabel: {
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#6b7280',
    margin: '0 0 16px 0'
  },
  card: {
    padding: '24px',
    backgroundColor: '#fafafa',
    border: '1px solid #e6e6e6',
    borderRadius: '12px'
  },
  list: {
    paddingLeft: '20px',
    margin: 0
  },
  listItem: {
    fontSize: '15px',
    color: '#444',
    marginBottom: '8px'
  },
  selectorStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '22px'
  },
  errorBox: {
    backgroundColor: '#fff5f5',
    border: '1px solid #f3c2c2',
    borderRadius: '10px',
    padding: '18px 20px',
    marginBottom: '32px'
  },
  errorTitle: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#9b2c2c',
    margin: '0 0 6px 0'
  },
  errorText: {
    fontSize: '15px',
    color: '#7a2626',
    margin: 0
  },
  ctaRow: {
    marginTop: '8px',
    paddingTop: '28px',
    borderTop: '1px solid #e6e6e6',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '16px',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  ctaHint: {
    fontSize: '14px',
    color: '#6b7280',
    margin: 0,
    maxWidth: '46ch'
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
  }
};


