import React, { useEffect, useRef, useState } from 'react';
import {
  Purchases,
  Package,
  PurchasesError,
  ErrorCode
} from '@revenuecat/purchases-js';

import { useAuthState } from '../store/authState';
import {
  useEntitlementState,
  PREMIUM_ENTITLEMENT_ID
} from '../store/entitlementState';
import { purchasesConfigured } from '../lib/purchases';

interface Props {
  /** Shown above the product, so the user knows what they are unlocking. */
  scenarioTitle: string;
  onDismiss: () => void;
}

/**
 * The paywall.
 *
 * Reads the current offering's packages and buys one through RevenueCat
 * Web Billing. purchase() renders a Stripe-backed checkout into a div
 * appended to the document body — in-page, no redirect and no popup,
 * which is what makes it work inside the Capacitor WebView.
 *
 * Offerings are fetched on mount rather than at boot: they are a network
 * call whose result is only needed on this screen, and prices can change
 * between app launches.
 */
const Paywall: React.FC<Props> = ({ scenarioTitle, onDismiss }) => {
  const setHasPremium = useEntitlementState((state) => state.setHasPremium);
  const checkEntitlements = useEntitlementState((state) => state.checkEntitlements);
  const user = useAuthState((state) => state.user);

  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  // Set the moment the user cancels, so a purchase promise that settles
  // afterwards cannot write state for a checkout they have dismissed.
  const cancelledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      // configure() requires an appUserId, so nothing can be sold before
      // AuthGate has signed someone in and called configurePurchases().
      if (!user || !purchasesConfigured()) {
        setError('Purchases are unavailable right now. Try again shortly.');
        setLoading(false);
        return;
      }

      try {
        const offerings = await Purchases.getSharedInstance().getOfferings();
        if (cancelled) {
          return;
        }
        if (offerings.current && offerings.current.availablePackages.length > 0) {
          setPackages(offerings.current.availablePackages);
        }
      } catch (err) {
        if (!cancelled) {
          setError('Could not load pricing. Check your connection and try again.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    // React 19 StrictMode mounts effects twice in development; the flag
    // stops the second run writing state after the first has unmounted.
    return () => {
      cancelled = true;
    };
  }, [user]);

  const buy = async (pkg: Package) => {
    if (purchasing) {
      return;
    }

    cancelledRef.current = false;
    setPurchasing(true);
    setCheckoutOpen(true);
    setError(null);

    try {
      const result = await Purchases.getSharedInstance().purchase({
        rcPackage: pkg,
        // Pre-fills the checkout form. RevenueCat asks for an email
        // itself when this is undefined.
        customerEmail: user && user.email ? user.email : undefined
      });

      if (cancelledRef.current) {
        return;
      }

      // PurchaseResult.customerInfo is authoritative and saves a round
      // trip; checkEntitlements() then reconciles against the server.
      const active = result.customerInfo.entitlements.active;

      setHasPremium(active[PREMIUM_ENTITLEMENT_ID] !== undefined);
      setCheckoutOpen(false);
      setPurchasing(false);
      await checkEntitlements();
    } catch (err) {
      if (cancelledRef.current) {
        return;
      }

      // The web SDK throws a typed PurchasesError. instanceof is safe
      // here — it is a plain class from the bundle, not an Error subclass
      // crossing a native bridge.
      const cancelledByUser =
        err instanceof PurchasesError &&
        err.errorCode === ErrorCode.UserCancelledError;

      setCheckoutOpen(false);
      setPurchasing(false);
      if (!cancelledByUser) {
        setError('The purchase could not be completed. No payment was taken.');
      }
    }
  };

  /**
   * Closes a checkout the user has changed their mind about.
   *
   * On Android there is otherwise no way out. Capacitor 8 ships no
   * back-button handling at all — Bridge and BridgeActivity in
   * @capacitor/android contain no onBackPressed, no canGoBack and no
   * goBack — so the hardware back key finishes the activity instead of
   * reaching the page, and the SDK's own close control lives inside its
   * full-screen overlay where a tall payment form can scroll it out of
   * reach. Force-quitting the app was the only exit.
   *
   * Two steps, deliberately belt and braces. Whenever purchase() is
   * called without an htmlTarget the SDK registers a popstate listener as
   * its cancel path, so dispatching one runs the SDK's own teardown: it
   * tracks the cancellation and rejects the pending promise with
   * UserCancelledError, which buy() already swallows. Should a future SDK
   * version drop that listener, the second step tears the overlay down
   * directly, so the user is never trapped either way.
   */
  const cancelCheckout = () => {
    cancelledRef.current = true;

    try {
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (err) {
      console.warn('Checkout cancel: popstate dispatch failed', err);
    }

    window.setTimeout(() => {
      // A second purchase started inside the timeout clears the flag.
      // Without this check that purchase's freshly mounted overlay would
      // be the one torn down.
      if (!cancelledRef.current) {
        return;
      }

      const roots = document.querySelectorAll('.rcb-ui-root, #rcb-ui-root');
      for (let i = 0; i < roots.length; i += 1) {
        const node = roots[i];
        if (node.parentNode) {
          node.parentNode.removeChild(node);
        }
      }

      // The overlay pins the document while it is open. Left behind,
      // these make the paywall underneath unscrollable.
      document.documentElement.style.removeProperty('overflow');
      document.documentElement.style.removeProperty('height');
      document.body.style.removeProperty('height');
    }, 200);

    setCheckoutOpen(false);
    setPurchasing(false);
    setError(null);
  };

  /**
   * Web Billing has no restorePurchases(). Entitlements are keyed to the
   * appUserId, so re-reading customer info for the signed-in account is
   * the restore path — on this device or any other.
   */
  const restore = async () => {
    if (purchasing) {
      return;
    }

    setPurchasing(true);
    setError(null);

    await checkEntitlements();

    const restored = useEntitlementState.getState().hasPremium;
    setPurchasing(false);

    if (!restored) {
      setError('No previous purchase was found for this account.');
    }
  };

  return (
    <div style={styles.page}>
      {checkoutOpen && (
        <button
          style={styles.checkoutCancel}
          onClick={cancelCheckout}
          aria-label="Cancel payment and go back"
        >
          Cancel
        </button>
      )}

      <div style={styles.card}>
        <p style={styles.eyebrow}>Premium scenario</p>
        <h1 style={styles.title}>{scenarioTitle}</h1>
        <p style={styles.body}>
          Unlock every premium scenario, including this one. One payment,
          no subscription.
        </p>

        {error && (
          <div style={styles.errorBox} role="alert">
            <p style={styles.errorText}>{error}</p>
          </div>
        )}

        {loading && <p style={styles.body}>Loading pricing…</p>}

        {!loading && packages.length === 0 && (
          <p style={styles.body}>
            Purchases are not available on this device.
          </p>
        )}

        {packages.map((pkg) => (
          <button
            key={pkg.identifier}
            style={purchasing ? { ...styles.cta, ...styles.disabled } : styles.cta}
            onClick={() => buy(pkg)}
            disabled={purchasing}
          >
            {purchasing
              ? 'Working…'
              : `${pkg.webBillingProduct.title} — ${pkg.webBillingProduct.currentPrice.formattedPrice}`}
          </button>
        ))}

        <div style={styles.ctaRow}>
          <button
            style={purchasing ? { ...styles.secondary, ...styles.disabled } : styles.secondary}
            onClick={onDismiss}
            disabled={purchasing}
          >
            Back to scenarios
          </button>

          <button
            style={purchasing ? { ...styles.linkButton, ...styles.disabled } : styles.linkButton}
            onClick={restore}
            disabled={purchasing}
          >
            Restore purchase
          </button>
        </div>
      </div>
    </div>
  );
};

export default Paywall;

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
  card: {
    padding: '32px',
    backgroundColor: '#fff',
    border: '1px solid #e6e6e6',
    borderLeft: '3px solid #0078D4',
    borderRadius: '12px'
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
    fontSize: '28px',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    lineHeight: 1.25,
    margin: '0 0 16px 0'
  },
  body: {
    fontSize: '16px',
    color: '#444',
    maxWidth: '68ch',
    margin: '0 0 20px 0'
  },
  errorBox: {
    backgroundColor: '#fff5f5',
    border: '1px solid #f3c2c2',
    borderRadius: '8px',
    padding: '12px 14px',
    marginBottom: '18px'
  },
  errorText: {
    fontSize: '14px',
    color: '#9b2c2c',
    margin: 0
  },
  cta: {
    width: '100%',
    padding: '15px 20px',
    fontSize: '16px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    backgroundColor: '#0078D4',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    marginBottom: '12px'
  },
  ctaRow: {
    marginTop: '8px',
    paddingTop: '20px',
    borderTop: '1px solid #e6e6e6',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    alignItems: 'center'
  },
  secondary: {
    padding: '12px 22px',
    fontSize: '15px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    backgroundColor: '#fff',
    color: '#374151',
    border: '1px solid #d4d4d4',
    borderRadius: '8px',
    cursor: 'pointer'
  },
  linkButton: {
    background: 'none',
    border: 'none',
    padding: 0,
    fontSize: '14px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    color: '#0078D4',
    cursor: 'pointer',
    textDecoration: 'underline'
  },
  disabled: {
    opacity: 0.6,
    cursor: 'not-allowed'
  },
  /**
   * Floats above the SDK's checkout overlay, which mounts on document.body
   * outside this tree. The overlay's own stacking tops out at 1000002, so
   * the maximum 32-bit z-index clears it with room to spare.
   */
  checkoutCancel: {
    position: 'fixed',
    top: '10px',
    right: '12px',
    zIndex: 2147483647,
    padding: '10px 18px',
    fontSize: '15px',
    fontWeight: 700,
    fontFamily: 'Inter, sans-serif',
    backgroundColor: 'rgba(17, 17, 17, 0.88)',
    color: '#fff',
    border: 'none',
    borderRadius: '999px',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.35)',
    cursor: 'pointer'
  }
};
