import React from 'react';

import { styles } from './S02StageScreen';
import { S02BlueprintMissing, useS02Blueprint } from './S02BlueprintGuard';
import { useS02SessionState } from '../../store/s02SessionState';
import { ScoreTier } from '../../types/scenarioBlueprint';

/**
 * Stage 6 — Scoring.
 *
 * Renders the three tiers from ui_screens.scoring.display_text verbatim,
 * with the achieved tier marked. The rubric is shown in full rather than
 * only the achieved band: the point of the screen is what the standard
 * was, not a grade.
 */
const S02ScoringScreen: React.FC = () => {
  const blueprint = useS02Blueprint();
  const score = useS02SessionState((state) => state.score);
  const advance = useS02SessionState((state) => state.advance);

  if (!blueprint) {
    return <S02BlueprintMissing />;
  }

  const text = blueprint.ui_screens.scoring;
  const tier: ScoreTier | null = score ? score.tier : null;

  const bands: Array<{ key: ScoreTier; items: string[] }> = [
    { key: 'excellent', items: text.display_text.excellent },
    { key: 'adequate', items: text.display_text.adequate },
    { key: 'poor', items: text.display_text.poor }
  ];

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <p style={styles.eyebrow}>{blueprint.scenario_id}</p>
        <h1 style={styles.title}>{text.title}</h1>
        <p style={styles.subtitle}>{text.purpose}</p>
      </header>

      <div style={styles.divider} />

      {bands.map((band) => (
        <section key={band.key} style={styles.section}>
          <h2 style={styles.sectionLabel}>{band.key}</h2>
          <div style={band.key === tier ? styles.responseCard : styles.card}>
            <ul style={styles.list}>
              {band.items.map((item, index) => (
                <li key={index} style={styles.listItem}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}

      {score && score.missed.length > 0 && (
        <section style={styles.section}>
          <h2 style={styles.sectionLabel}>{blueprint.primary_competency}</h2>
          <div style={styles.cardNeutral}>
            <ul style={styles.list}>
              {score.missed.map((item, index) => (
                <li key={index} style={styles.listItem}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <div style={styles.ctaRow}>
        <button style={styles.cta} onClick={advance}>
          Continue
        </button>
      </div>
    </div>
  );
};

export default S02ScoringScreen;
