import React, { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';

import { useNavigationState } from '../store/navigationState';
import { useS02SessionState } from '../store/s02SessionState';
import { useActiveScenarioState } from '../store/activeScenarioState';
import { useScenarioProgressState } from '../store/scenarioProgressState';
import { useEntitlementState } from '../store/entitlementState';
import Paywall from '../components/Paywall';
import { confirmDiscardUnsavedAssessment } from '../utils/confirmDiscardUnsaved';
import {
  SCENARIO_REGISTRY,
  ScenarioRegistryEntry
} from '../data/scenarioRegistry';
import { DEMO_MODE, premiumScenarioIds } from '../lib/demoMode';

/**
 * Scenario ids behind the premium entitlement.
 *
 * A constant rather than a field on ScenarioRegistryEntry: the registry's
 * other fields all come from scenario JSON, and pricing is a commercial
 * decision, not scenario content. Adding isPremium to the blueprint would
 * put a store concern inside the behavioural spec.
 *
 * Empty on native. The paywall is the RevenueCat web SDK with Stripe
 * checkout, which Google Play's Payments policy does not allow for
 * digital content in a Play-distributed app. Until Play Billing is wired
 * through @revenuecat/purchases-capacitor, the Android build ships with
 * every scenario unlocked and never renders <Paywall>. Web is unchanged.
 *
 * Also empty in a hackathon demo build (see lib/demoMode.ts), which has no
 * RevenueCat key and so cannot take payments.
 */
const PREMIUM_SCENARIO_IDS: string[] = premiumScenarioIds(Capacitor.isNativePlatform(), DEMO_MODE);

function isPremiumScenario(scenarioId: string): boolean {
  return PREMIUM_SCENARIO_IDS.indexOf(scenarioId) !== -1;
}

/**
 * The scenario selector.
 *
 * Routes by flow kind rather than by id: 'legacy' scenarios use MT-S01's
 * seven screens and its existing engines, 'blueprint' scenarios use the
 * MT-S02 stage machine. The two JSON shapes are incompatible, so one set
 * of screens could not render both without rewriting Scenario 1.
 */
const ScenarioSelectScreen: React.FC = () => {
  const setCurrentScreen = useNavigationState((state) => state.setCurrentScreen);
  const resetS02 = useS02SessionState((state) => state.resetSession);
  const setActiveScenario = useActiveScenarioState((state) => state.setActiveScenario);
  const resetProgress = useScenarioProgressState((state) => state.resetProgress);

  const hasPremium = useEntitlementState((state) => state.hasPremium);
  const loadingEntitlements = useEntitlementState((state) => state.loadingEntitlements);

  // Local, not a new Screen. Adding 'screen_paywall' to the Screen union
  // would force edits to three exhaustive Record maps — App.stepInfo,
  // SCREEN_TO_STEP and sessionPersistence.SCREENS — for a view that is
  // never resumed into and never persisted.
  const [paywallFor, setPaywallFor] = useState<ScenarioRegistryEntry | null>(null);

  /**
   * Navigation without the entitlement check.
   *
   * Split out so the purchase effect below can reuse it. Re-entering
   * open() from there would re-run the gate against a hasPremium value
   * React has not necessarily committed yet, and bounce the user back to
   * the paywall they just paid to leave.
   */
  const openScenario = useCallback(
    (entry: ScenarioRegistryEntry) => {
      // Nothing changes until the user has agreed to discard an unsaved
      // MT-S02 assessment.
      if (entry.flowKind === 'blueprint' && !confirmDiscardUnsavedAssessment()) {
        return;
      }

      // Order matters. The progress store is cleared first so the two
      // hooks cannot save the outgoing scenario's step against the
      // incoming scenario's document during the render in between.
      resetProgress();
      setActiveScenario(entry.scenarioId);

      if (entry.flowKind === 'blueprint') {
        resetS02();
        setCurrentScreen('s02_sbi');
        return;
      }
      setCurrentScreen('scenario_overview');
    },
    [resetProgress, setActiveScenario, resetS02, setCurrentScreen]
  );

  const open = (entry: ScenarioRegistryEntry) => {
    if (isPremiumScenario(entry.scenarioId) && !hasPremium) {
      setPaywallFor(entry);
      return;
    }
    openScenario(entry);
  };

  /**
   * A completed purchase does not unmount the paywall on its own:
   * paywallFor is local state here, hasPremium lives in the entitlement
   * store, and nothing connected the two. Without this effect a paying
   * customer sits on the paywall they have just paid to get past.
   *
   * Sending them straight into the scenario they wanted is deliberate —
   * returning them to the selector to click the same card again reads as
   * though the purchase failed.
   *
   * Also covers "Restore purchase" succeeding, which flips the same flag
   * by the same route.
   */
  useEffect(() => {
    if (hasPremium && paywallFor) {
      const entry = paywallFor;
      setPaywallFor(null);
      openScenario(entry);
    }
  }, [hasPremium, paywallFor, openScenario]);

  if (paywallFor) {
    return (
      <Paywall
        scenarioTitle={paywallFor.title}
        onDismiss={() => setPaywallFor(null)}
      />
    );
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <p style={styles.eyebrow}>ManagerTalk</p>
        <h1 style={styles.title}>Scenarios</h1>
      </header>

      <div style={styles.divider} />

      <div style={styles.actionRow}>
        <button
          style={styles.secondary}
          onClick={() => setCurrentScreen('screen_profile')}
        >
          Profile
        </button>
        <button
          style={styles.secondary}
          onClick={() => setCurrentScreen('screen_progress')}
        >
          My progress
        </button>
      </div>

      <div style={styles.grid}>
        {SCENARIO_REGISTRY.map((entry) => {
          const locked = isPremiumScenario(entry.scenarioId) && !hasPremium;

          return (
            <button
              key={entry.scenarioId}
              style={styles.scenarioCard}
              onClick={() => open(entry)}
              disabled={loadingEntitlements}
            >
              <span style={styles.cardEyebrow}>{entry.scenarioId}</span>
              <span style={styles.cardTitle}>{entry.title}</span>
              <span style={styles.cardBadge}>{entry.difficulty}</span>
              <span style={styles.cardCompetency}>{entry.primaryCompetency}</span>
              {locked && <span style={styles.cardLock}>Premium</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ScenarioSelectScreen;

// -----------------------------
// Styles
// -----------------------------

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: 'var(--mt-page-padding, 40px)',
    maxWidth: 'var(--mt-page-max-width, 900px)',
    margin: '0 auto',
    fontFamily: 'var(--mt-font-ui)',
    lineHeight: 1.6,
    color: 'var(--mt-ink)'
  },
  header: {
    marginBottom: '28px'
  },
  eyebrow: {
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--mt-ink-2)',
    margin: '0 0 10px 0'
  },
  title: {
    fontFamily: 'var(--mt-font-display)',
    fontSize: '34px',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    lineHeight: 1.2,
    margin: 0
  },
  divider: {
    height: '1px',
    backgroundColor: 'var(--mt-hairline)',
    margin: '0 0 36px 0'
  },
  actionRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    marginBottom: '24px'
  },
  secondary: {
    padding: '12px 22px',
    fontSize: '15px',
    fontWeight: 600,
    fontFamily: 'var(--mt-font-ui)',
    backgroundColor: 'var(--mt-card)',
    color: 'var(--mt-ink-2)',
    border: '1px solid var(--mt-border-strong)',
    borderRadius: '8px',
    cursor: 'pointer'
  },
  grid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '20px'
  },
  scenarioCard: {
    flex: '1 1 380px',
    minWidth: 'var(--mt-card-min-width, 300px)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '24px',
    textAlign: 'left',
    backgroundColor: 'var(--mt-card)',
    border: '1px solid var(--mt-hairline)',
    borderLeft: '3px solid var(--mt-you)',
    borderRadius: '12px',
    cursor: 'pointer',
    fontFamily: 'var(--mt-font-ui)',
    boxSizing: 'border-box'
  },
  cardEyebrow: {
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--mt-ink-2)'
  },
  cardTitle: {
    fontSize: '20px',
    fontWeight: 700,
    letterSpacing: '-0.01em',
    color: 'var(--mt-ink)'
  },
  cardBadge: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '999px',
    backgroundColor: 'var(--mt-sunk)',
    color: 'var(--mt-you)',
    fontSize: '13px',
    fontWeight: 600
  },
  cardCompetency: {
    fontSize: '15px',
    color: 'var(--mt-ink-2)'
  },
  cardLock: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '999px',
    backgroundColor: 'var(--mt-highlight)',
    color: 'var(--mt-amber-ink)',
    fontSize: '13px',
    fontWeight: 600
  }
};
