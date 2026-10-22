import React from 'react';

import { styles } from './S02StageScreen';
import { S02BlueprintMissing, useS02Blueprint } from './S02BlueprintGuard';
import { useS02SessionState } from '../../store/s02SessionState';
import { useNavigationState } from '../../store/navigationState';

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
  const resetSession = useS02SessionState((state) => state.resetSession);
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

      {score && feedback && (
        <section style={styles.section}>
          <h2 style={styles.sectionLabel}>{score.tier}</h2>
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
