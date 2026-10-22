// src/lib/demoMode.ts
//
// Hackathon demo mode: lets a visitor open the premium scenario (MT-S02) on
// the web without a purchase.
//
// OFF BY DEFAULT and fails closed. It turns on only when
//   1. REACT_APP_DEMO_MODE is exactly "true", AND
//   2. no RevenueCat Web Billing key is configured.
// The second rule means a build that can take payments can never also be a
// demo build, even if the flag is set by mistake. CRA fixes both values at
// build time, so a visitor cannot change them in the browser.
//
// The paywall is a client-side gate: the scenario file ships in the bundle and
// neither Firestore rules nor the backend check entitlements.

export interface DemoEnv {
  REACT_APP_DEMO_MODE?: string;
  REACT_APP_REVENUECAT_WEB_BILLING_KEY?: string;
}

export function isDemoMode(env: DemoEnv): boolean {
  if (env.REACT_APP_DEMO_MODE !== 'true') {
    return false;
  }
  const key = env.REACT_APP_REVENUECAT_WEB_BILLING_KEY;
  return typeof key !== 'string' || key.length === 0;
}

/** Scenario ids behind the premium entitlement for this build. */
export function premiumScenarioIds(isNative: boolean, demoMode: boolean): string[] {
  return isNative || demoMode ? [] : ['MT-S02'];
}

/** Read once, from the values CRA inlined at build time. */
export const DEMO_MODE: boolean = isDemoMode({
  REACT_APP_DEMO_MODE: process.env.REACT_APP_DEMO_MODE,
  REACT_APP_REVENUECAT_WEB_BILLING_KEY: process.env.REACT_APP_REVENUECAT_WEB_BILLING_KEY
});
