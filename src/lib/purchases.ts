import { Purchases } from '@revenuecat/purchases-js';

// -----------------------------
// RevenueCat Web Billing
// -----------------------------
//
// Web Billing, not the Capacitor plugin. The plugin bundles Google Play
// Billing and has no Samsung Galaxy Store support — RevenueCat's own
// tracking issue says it is planned with no ETA — so on a Galaxy Store
// build the plugin's getOfferings() returns nothing to sell.
//
// The web SDK renders RevenueCat's Stripe-backed checkout into the page.
// It runs as ordinary JavaScript inside the Capacitor WebView, which is
// why it works where signInWithPopup does not: there is no second window
// and no opener to post back to.
//
// The API key here is the Web Billing key from the RevenueCat dashboard,
// NOT the Android public SDK key. They are not interchangeable; the
// wrong one fails at configure() with an invalid-key error.

// Supplied at build time and never committed. CRA inlines REACT_APP_* into the
// browser bundle; this is RevenueCat's client-side Web Billing key, but it is
// tied to the production RevenueCat project, so the hackathon demo leaves it unset.
const WEB_BILLING_API_KEY = process.env.REACT_APP_REVENUECAT_WEB_BILLING_KEY || '';

/** False when no key is configured, for example in the hackathon demo build. */
export function purchasesEnabled(): boolean {
  return WEB_BILLING_API_KEY.length > 0;
}

/**
 * The appUserId the SDK is currently configured with, or null.
 *
 * Tracked rather than a plain boolean because configure() throws if
 * called twice, but a second person can sign in during one session —
 * that case needs changeUser(), not a second configure().
 */
let configuredUserId: string | null = null;

export function purchasesConfigured(): boolean {
  return configuredUserId !== null;
}

/**
 * Configures the SDK for this user, or switches an already-configured
 * SDK to them.
 *
 * Web Billing has no anonymous mode: appUserId is required. Passing the
 * Firebase uid is what makes an entitlement follow the account rather
 * than the install, so a purchase survives a reinstall and appears on a
 * second device after sign-in.
 *
 * Never throws. A failure here leaves purchasesConfigured() false, the
 * paywall shows its error state, and every non-premium scenario still
 * runs.
 */
export async function configurePurchases(appUserId: string): Promise<void> {
  if (!appUserId || !purchasesEnabled()) {
    return;
  }

  if (configuredUserId === appUserId) {
    return;
  }

  try {
    if (configuredUserId === null) {
      Purchases.configure({
        apiKey: WEB_BILLING_API_KEY,
        appUserId: appUserId
      });
    } else {
      // A different person signed in on this device without a reload.
      await Purchases.getSharedInstance().changeUser(appUserId);
    }
    configuredUserId = appUserId;
  } catch (err) {
    console.warn('RevenueCat configure failed', err);
  }
}
