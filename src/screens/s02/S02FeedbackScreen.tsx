import React from 'react';

import { styles as stageStyles } from './S02StageScreen';

import { S02BlueprintMissing, useS02Blueprint } from './S02BlueprintGuard';
import { currentRunInput, useS02SessionState } from '../../store/s02SessionState';
import { buildEvidence } from '../../engine/s02/evidence';
import { useNavigationState } from '../../store/navigationState';

const styles: Record<string, React.CSSProperties> = {
  ...stageStyles,
  quote: {
    margin: '8px 0 0 0',
    padding: '8px 12px',
    borderLeft: '3px solid #2C4A9E',
    backgroundColor: '#fff',
    color: '#1F2430',
    fontStyle: 'italic'
  }
};

/**
 * Stage 7 — Feedback.
 *
 * Two independent results are shown: the scoring tier, and the feedback
 * branch. They are orthogonal — feedback_logic has four branches
 * (good / poor / avoidance / escalation) and scoring_rubric has three
 * tiers, so a run can be adequate AND have escalated incorrectly.
 *
 * The four headings come from ui_screens.feedback.display_template; the
 * body of each comes from the selected branch's authored focus list.
 */
const S02FeedbackScreen: React.FC = () => {
  const blueprint = useS02Blueprint();
  const score = useS02SessionState((state) => state.score);
  const feedback = useS02SessionState((state) => state.feedback);
  const session = useS02SessionState((state) => state);
  const resetSession = useS02SessionState((state) => state.resetSession);
  const evidence = React.useMemo(
    () => (score ? buildEvidence(currentRunInput(session), score.signals) : null),
    [score, session]
  );
  const setCurrentScreen = useNavigationState((state) => state.setCurrentScreen);

  if (!blueprint) {
    return <S02BlueprintMissing />;
  }

  const text = blueprint.ui_screens.feedback;

  const handleRestart = () => {
    resetSession();
    setCurrentScreen('scenario_select');
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <p style={styles.eyebrow}>{blueprint.scenario_id}</p>
        <h1 style={styles.title}>{text.title}</h1>
        <p style={styles.subtitle}>{text.purpose}</p>
      </header>

      <div style={styles.divider} />

      {evidence && (
        <section style={styles.section} aria-labelledby="evidence-heading">
          <h2 id="evidence-heading" style={styles.sectionLabel}>
            What you actually wrote
          </h2>
          <div style={styles.card}>
            <p style={styles.hint}>
              Observed: your own words and entries, and what the rules did not recognise. This section does not
              interpret intent.
            </p>
            <ul style={styles.list}>
              {evidence.items.map((item) => (
                <li key={item.id} style={styles.listItem}>
                  <strong>
                    {item.role === 'strength' ? 'Strength' : item.role === 'concern' ? 'Concern' : 'Not recognised'}
                    {': '}
                  </strong>
                  {item.observation}
                  {item.quote !== undefined && (
                    <blockquote style={styles.quote}>
                      “{item.quote}
                      {item.truncated ? '…' : ''}”
                    </blockquote>
                  )}
                  {item.value !== undefined && <div style={styles.hint}>Entered: {item.value}</div>}
                </li>
              ))}
            </ul>
            {evidence.limits.map((limit) => (
              <p key={limit} style={styles.hint}>
                {limit}
              </p>
            ))}
          </div>
        </section>
      )}

      {score && feedback && (
        <section style={styles.section}>
          <h2 style={styles.sectionLabel}>Coaching interpretation · {score.tier}</h2>
          <p style={styles.hint}>
            Authored guidance for this scenario. It is not measured from your words and does not read your intent.
          </p>
          <div style={styles.responseCard}>
            <ul style={styles.list}>
              {feedback.focus.map((item, index) => (
                <li key={index} style={styles.listItem}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {text.display_template.map((heading, index) => (
        <section key={heading} style={styles.section}>
          <h2 style={styles.sectionLabel}>{heading}</h2>
          <div style={styles.card}>
            <ul style={styles.list}>
              {index === 0 && score
                ? score.met.map((item, i) => (
                    <li key={i} style={styles.listItem}>
                      {item}
                    </li>
                  ))
                : null}

              {index === 1 && score
                ? score.missed.map((item, i) => (
                    <li key={i} style={styles.listItem}>
                      {item}
                    </li>
                  ))
                : null}

              {index === 2
                ? blueprint.summary.ambiguity.map((item, i) => (
                    <li key={i} style={styles.listItem}>
                      {item}
                    </li>
                  ))
                : null}

              {index === 3
                ? blueprint.commitment_expectations.acceptable.map((item, i) => (
                    <li key={i} style={styles.listItem}>
                      {item}
                    </li>
                  ))
                : null}
            </ul>
          </div>
        </section>
      ))}

      <section style={styles.section}>
        <div style={styles.cardNeutral}>
          <ul style={styles.list}>
            {text.constraints.map((item, index) => (
              <li key={index} style={styles.listItem}>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div style={styles.ctaRow}>
        <button style={styles.secondary} onClick={handleRestart}>
          Restart
        </button>
      </div>
    </div>
  );
};

export default S02FeedbackScreen;
