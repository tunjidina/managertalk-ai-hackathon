import React from 'react';

import {
  S02_SCENARIO_ID,
  getBlueprint,
  missingBlueprintFields
} from '../../data/scenarioRegistry';
import { ScenarioBlueprint } from '../../types/scenarioBlueprint';

/** The MT-S02 blueprint, or null when validation failed at load. */
export function useS02Blueprint(): ScenarioBlueprint | null {
  return getBlueprint(S02_SCENARIO_ID);
}

/**
 * Shown only when the blueprint JSON fails field validation — an authoring
 * error, surfaced as a list of the missing sections rather than a blank
 * screen part-way through a scenario.
 */
export const S02BlueprintMissing: React.FC = () => {
  const missing = missingBlueprintFields(getBlueprint(S02_SCENARIO_ID));

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <p style={styles.eyebrow}>{S02_SCENARIO_ID}</p>
        <h1 style={styles.title}>Blueprint validation failed</h1>
        <ul style={styles.list}>
          {missing.map((field) => (
            <li key={field} style={styles.listItem}>
              <code style={styles.code}>{field}</code>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: 'var(--mt-page-padding, 40px)',
    maxWidth: 'var(--mt-page-max-width, 900px)',
    margin: '0 auto',
    fontFamily: 'Inter, sans-serif',
    lineHeight: 1.6,
    color: '#1a1a1a'
  },
  card: {
    padding: '32px',
    backgroundColor: '#fff',
    border: '1px solid #e6e6e6',
    borderLeft: '3px solid #9b2c2c',
    borderRadius: '12px'
  },
  eyebrow: {
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#9b2c2c',
    margin: '0 0 10px 0'
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    margin: '0 0 16px 0'
  },
  list: {
    paddingLeft: '20px',
    margin: 0
  },
  listItem: {
    fontSize: '15px',
    color: '#444',
    marginBottom: '6px'
  },
  code: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '0.9em',
    backgroundColor: '#f2f4f7',
    padding: '2px 6px',
    borderRadius: '4px'
  }
};
