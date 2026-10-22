import React, { useEffect, useRef } from 'react';
import { useNavigationState } from '../store/navigationState';
import { useAuthState } from '../store/authState';
import { logAnalyticsEvent } from '../engine/analytics';
import { useActiveScenarioState } from '../store/activeScenarioState';
import { scenarioData } from '../utils/jsonLoader';
import ProfileCard from '../components/ProfileCard';

const ScenarioOverviewScreen: React.FC = () => {
  const { setCurrentScreen } = useNavigationState();
  const user = useAuthState((state) => state.user);
  const uid = user ? user.uid : null;

  // The scenario id comes from the selector, not a constant.
  const scenarioId = useActiveScenarioState((state) => state.scenarioId);

  // Guards the React 19 StrictMode double-invoke in development. Refs
  // survive StrictMode's simulated unmount/remount of the same instance,
  // so one mount produces exactly one event.
  const startedRef = useRef(false);

  useEffect(() => {
    if (!uid || startedRef.current) {
      return;
    }

    startedRef.current = true;

    // Fire-and-forget: logAnalyticsEvent never throws, and nothing on this
    // screen should wait on a network call to render.
    void logAnalyticsEvent(uid, scenarioId, 'scenario_started', 'overview');
  }, [uid, scenarioId]);

  const metadata = {
    scenario_id: scenarioData.scenario_id,
    title: scenarioData.title,
    difficulty: scenarioData.difficulty,
    competency: scenarioData.primary_competency,
    stakes: scenarioData.stakes
  };

  const managerProfile = scenarioData.manager_profile;
  const employeeProfile = scenarioData.employee_profile;

  const stakeGroups: { label: string; items: string[] }[] = [
    { label: 'Manager', items: metadata.stakes.manager },
    { label: 'Employee', items: metadata.stakes.employee },
    { label: 'Organization', items: metadata.stakes.organization }
  ];

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <p style={styles.eyebrow}>Scenario {metadata.scenario_id}</p>
        <h1 style={styles.title}>{metadata.title}</h1>

        <div style={styles.badgeRow}>
          <span style={styles.badge}>{metadata.difficulty}</span>
        </div>

        <p style={styles.competency}>{metadata.competency}</p>
      </header>

      <div style={styles.divider} />

      {/* Profiles */}
      <section style={styles.section}>
        <h2 style={styles.sectionLabel}>Profiles</h2>
        <div style={styles.profileRow}>
          <ProfileCard title="Manager" profile={managerProfile} />
          <ProfileCard title="Employee" profile={employeeProfile} />
        </div>
      </section>

      {/* Stakes */}
      <section style={styles.section}>
        <h2 style={styles.sectionLabel}>Stakes</h2>
        <div style={styles.stakesGrid}>
          {stakeGroups.map((group: { label: string; items: string[] }, idx: number) => (
            <div key={idx} style={styles.stakeCard}>
              <h3 style={styles.stakeTitle}>{group.label}</h3>
              <ul style={styles.stakeList}>
                {group.items.map((item: string, i: number) => (
                  <li key={i} style={styles.stakeItem}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <div style={styles.ctaRow}>
        <button
          style={styles.cta}
          onClick={() => setCurrentScreen('evidence')}
        >
          Begin Conversation
        </button>
      </div>
    </div>
  );
};

export default ScenarioOverviewScreen;

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
    margin: '0 0 14px 0'
  },
  badgeRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '16px'
  },
  badge: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '999px',
    backgroundColor: '#eef4fb',
    color: '#0b5fa5',
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '0.01em'
  },
  competency: {
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
    marginBottom: '40px'
  },
  sectionLabel: {
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#6b7280',
    margin: '0 0 16px 0'
  },
  profileRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '20px',
    alignItems: 'stretch'
  },
  stakesGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '20px'
  },
  stakeCard: {
    flex: '1 1 240px',
    minWidth: '240px',
    padding: '20px',
    backgroundColor: '#fafafa',
    border: '1px solid #e6e6e6',
    borderRadius: '10px'
  },
  stakeTitle: {
    fontSize: '16px',
    fontWeight: 600,
    margin: '0 0 10px 0'
  },
  stakeList: {
    paddingLeft: '18px',
    margin: 0
  },
  stakeItem: {
    fontSize: '15px',
    color: '#444',
    marginBottom: '6px'
  },
  ctaRow: {
    marginTop: '8px',
    paddingTop: '28px',
    borderTop: '1px solid #e6e6e6'
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

