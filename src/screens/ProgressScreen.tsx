import React from 'react';

import mtS02 from '../data/scenarios/mt-s02.json';
import { ScenarioBlueprint } from '../types/scenarioBlueprint';
import { useNavigationState } from '../store/navigationState';
import { useMyAssessments } from '../hooks/useMyAssessments';
import { StoredAssessment } from '../engine/assessmentRecords';
import { EXCELLENT_CRITERIA, POOR_CRITERIA, S02CriterionKey } from '../engine/s02/criteria';
import { analyseProgress } from '../engine/s02/progressAnalysis';
import { S02_RUBRIC_VERSION } from '../engine/s02/rubricVersion';

const rubric = (mtS02 as unknown as ScenarioBlueprint).scoring_rubric;

/** Rubric wording for each stored criterion key; the rubric arrays are in the same order as the keys. */
const LABELS: Record<S02CriterionKey, string> = {} as Record<S02CriterionKey, string>;
EXCELLENT_CRITERIA.forEach((key, index) => {
  LABELS[key] = rubric.excellent.criteria[index];
});
POOR_CRITERIA.forEach((key, index) => {
  LABELS[key] = rubric.poor.criteria[index];
});

const TIER_LABEL: Record<string, string> = { excellent: 'Excellent', adequate: 'Adequate', poor: 'Poor' };

function tierLabel(tier: string): string {
  return TIER_LABEL[tier] || tier;
}

function formatDate(record: StoredAssessment): string {
  if (record.createdAtMs === null) {
    return 'Just now';
  }
  try {
    return new Date(record.createdAtMs).toLocaleString();
  } catch {
    return 'Date unavailable';
  }
}

const CHANGE_LABEL = {
  'newly-met': 'Newly met since baseline',
  'no-longer-met': 'No longer met since baseline',
  unchanged: 'Unchanged since baseline'
} as const;

/**
 * My progress.
 *
 * A rule-based view of the user's own stored MT-S02 assessments: the tier
 * and the true/false rubric criteria each run produced. It shows no score,
 * percentage or AI judgement, and compares only runs from the current
 * rubric version.
 */
const ProgressScreen: React.FC = () => {
  const setCurrentScreen = useNavigationState((state) => state.setCurrentScreen);
  const data = useMyAssessments();

  const back = (
    <button style={styles.secondary} onClick={() => setCurrentScreen('scenario_select')}>
      Back to scenarios
    </button>
  );

  const header = (
    <>
      <header style={styles.header}>
        <p style={styles.eyebrow}>Account</p>
        <h1 style={styles.title}>My progress</h1>
        <p style={styles.disclosure}>
          Rule-based assessment · {S02_RUBRIC_VERSION}. This is not an AI judgement.
        </p>
      </header>
      <div style={styles.divider} />
    </>
  );

  if (data.status === 'loading') {
    return (
      <div style={styles.page}>
        {header}
        <p role="status">Loading your progress…</p>
      </div>
    );
  }

  if (data.status === 'error') {
    return (
      <div style={styles.page}>
        {header}
        <div style={styles.errorBox} role="alert">
          <p style={styles.errorText}>{data.message}</p>
        </div>
        <div style={styles.ctaRow}>
          <button style={styles.cta} onClick={data.retry}>
            Try again
          </button>
          {back}
        </div>
      </div>
    );
  }

  const analysis = analyseProgress(data.records);

  const unreadableNote =
    data.unreadable > 0 ? (
      <p style={styles.hint} role="status">
        {data.unreadable === 1
          ? '1 saved assessment could not be read and is not shown.'
          : data.unreadable + ' saved assessments could not be read and are not shown.'}
      </p>
    ) : null;

  if (analysis.latest === null) {
    return (
      <div style={styles.page}>
        {header}
        <div style={styles.card}>
          <p style={styles.bodyText}>Complete MT-S02 to establish your progress baseline.</p>
        </div>
        {unreadableNote}
        <div style={styles.ctaRow}>{back}</div>
      </div>
    );
  }

  const latest = analysis.latest;

  return (
    <div style={styles.page}>
      {header}

      <section style={styles.section} aria-labelledby="latest-heading">
        <h2 id="latest-heading" style={styles.sectionLabel}>Latest assessment</h2>
        <div style={styles.card}>
          <p style={styles.bodyText}>
            <strong>{tierLabel(latest.tier)}</strong> · {formatDate(latest)}
          </p>
          <p style={styles.hint}>Rubric version: {latest.rubricVersion}</p>
          {!analysis.latestIsCurrent && (
            <p style={styles.hint}>
              Earlier rubric — not compared. Criteria and priorities are shown only for assessments made with{' '}
              {S02_RUBRIC_VERSION}.
            </p>
          )}
        </div>
      </section>

      {analysis.latestIsCurrent && (
        <>
          <section style={styles.section} aria-labelledby="baseline-heading">
            <h2 id="baseline-heading" style={styles.sectionLabel}>Compared with your baseline</h2>
            <div style={styles.card}>
              {analysis.comparison ? (
                <>
                  <p style={styles.hint}>
                    Baseline: your first {S02_RUBRIC_VERSION} assessment, {tierLabel((analysis.baseline as StoredAssessment).tier)} on{' '}
                    {formatDate(analysis.baseline as StoredAssessment)}.
                  </p>
                  <ComparisonList title="Newly met" keys={analysis.comparison.newlyMet} />
                  <ComparisonList title="No longer met" keys={analysis.comparison.noLongerMet} />
                  <ComparisonList title="Unchanged" keys={analysis.comparison.unchanged} />
                </>
              ) : (
                <p style={styles.bodyText}>
                  This first assessment establishes your baseline. No comparison is available yet.
                </p>
              )}
            </div>
          </section>

          <section style={styles.section} aria-labelledby="criteria-heading">
            <h2 id="criteria-heading" style={styles.sectionLabel}>The seven excellent criteria</h2>
            <div style={styles.card}>
              <ul style={styles.list}>
                {analysis.excellent.map((item) => (
                  <li key={item.key} style={styles.listItem} data-criterion={item.key}>
                    <strong>{item.metInLatest ? 'Met' : 'Not met'}</strong> · {LABELS[item.key]}
                    {item.change && <span style={styles.hint}> ({CHANGE_LABEL[item.change]})</span>}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section style={styles.section} aria-labelledby="priorities-heading">
            <h2 id="priorities-heading" style={styles.sectionLabel}>Development priorities</h2>
            <div style={styles.card}>
              {analysis.priorities.length === 0 ? (
                <p style={styles.bodyText}>All seven excellent criteria were met in your latest assessment.</p>
              ) : (
                <ol style={styles.list}>
                  {analysis.priorities.map((key) => (
                    <li key={key} style={styles.listItem}>{LABELS[key]}</li>
                  ))}
                </ol>
              )}
            </div>
          </section>

          <section style={styles.section} aria-labelledby="flags-heading">
            <h2 id="flags-heading" style={styles.sectionLabel}>Checks flagged in the latest assessment</h2>
            <div style={styles.card}>
              {analysis.flaggedPoor.length === 0 ? (
                <p style={styles.bodyText}>None of the six checks that lower a result were flagged.</p>
              ) : (
                <>
                  <p style={styles.hint}>
                    The rules flagged these. They match wording and structure only; they do not show what you meant.
                  </p>
                  <ul style={styles.list}>
                    {analysis.flaggedPoor.map((key) => (
                      <li key={key} style={styles.listItem}>{LABELS[key]}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </section>
        </>
      )}

      <section style={styles.section} aria-labelledby="history-heading">
        <h2 id="history-heading" style={styles.sectionLabel}>Assessment history</h2>
        <div style={styles.card}>
          <ul style={styles.list}>
            {analysis.history.map((entry) => (
              <li key={entry.record.runId} style={styles.listItem}>
                {formatDate(entry.record)} · {tierLabel(entry.record.tier)} · {entry.record.rubricVersion}
                {!entry.current && <strong> · Earlier rubric — not compared</strong>}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {unreadableNote}
      <div style={styles.ctaRow}>{back}</div>
    </div>
  );
};

const ComparisonList: React.FC<{ title: string; keys: S02CriterionKey[] }> = ({ title, keys }) => (
  <div style={styles.group}>
    <h3 style={styles.groupTitle}>{title}</h3>
    {keys.length === 0 ? (
      <p style={styles.hint}>None</p>
    ) : (
      <ul style={styles.list}>
        {keys.map((key) => (
          <li key={key} style={styles.listItem}>{LABELS[key]}</li>
        ))}
      </ul>
    )}
  </div>
);

export default ProgressScreen;

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: 'var(--mt-page-padding, 40px)',
    maxWidth: 'var(--mt-page-max-width, 900px)',
    margin: '0 auto',
    fontFamily: 'Inter, sans-serif',
    lineHeight: 1.6,
    color: '#1a1a1a'
  },
  header: { marginBottom: '20px' },
  eyebrow: {
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#6b7280',
    margin: '0 0 10px 0'
  },
  title: { fontSize: '34px', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2, margin: '0 0 8px 0' },
  disclosure: { fontSize: '14px', color: '#6b7280', margin: 0 },
  divider: { height: '1px', backgroundColor: '#e6e6e6', margin: '0 0 32px 0' },
  errorBox: {
    backgroundColor: '#fff5f5',
    border: '1px solid #f3c2c2',
    borderRadius: '10px',
    padding: '18px 20px',
    marginBottom: '24px'
  },
  errorText: { fontSize: '15px', color: '#7a2626', margin: 0 },
  section: { marginBottom: '28px' },
  sectionLabel: {
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#6b7280',
    margin: '0 0 14px 0'
  },
  card: { padding: '22px', backgroundColor: '#fafafa', border: '1px solid #e6e6e6', borderRadius: '12px' },
  bodyText: { fontSize: '16px', color: '#1a1a1a', margin: 0 },
  hint: { fontSize: '13px', color: '#6b7280', margin: '6px 0 0 0' },
  list: { margin: '8px 0 0 0', paddingLeft: '20px' },
  listItem: { fontSize: '15px', color: '#374151', marginBottom: '8px' },
  group: { marginTop: '14px' },
  groupTitle: { fontSize: '15px', fontWeight: 600, margin: 0 },
  ctaRow: { marginTop: '8px', paddingTop: '24px', borderTop: '1px solid #e6e6e6', display: 'flex', flexWrap: 'wrap', gap: '12px' },
  secondary: {
    padding: '14px 24px',
    fontSize: '16px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    backgroundColor: '#fff',
    color: '#374151',
    border: '1px solid #d4d4d4',
    borderRadius: '8px',
    cursor: 'pointer'
  },
  cta: {
    padding: '14px 24px',
    fontSize: '16px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    backgroundColor: '#0078D4',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer'
  }
};
