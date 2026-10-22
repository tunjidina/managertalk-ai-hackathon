import React, { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';

import {
  getFirebaseAuth,
  isFirebaseConfigured,
  missingFirebaseKeys
} from '../lib/firebase';
import { ensureUserProfile } from '../lib/userProfile';
import { configurePurchases } from '../lib/purchases';
import { useAuthState } from '../store/authState';
import { useEntitlementState } from '../store/entitlementState';
import LoginScreen from '../screens/LoginScreen';
import LoadingFallback from './LoadingFallback';

interface Props {
  children: React.ReactNode;
}

/**
 * The whole "protected route" mechanism.
 *
 * ManagerTalk has no router, so there are no routes to guard: this wraps
 * whatever App renders. No session, no scenario screens — the switch in
 * App.tsx is never reached while signed out.
 */
const AuthGate: React.FC<Props> = ({ children }) => {
  const { status, setAuthenticated, setSignedOut, setCertificateName } =
    useAuthState();

  const configured = isFirebaseConfigured();

  useEffect(() => {
    // Hooks cannot be conditional, so the config check lives inside.
    if (!configured) {
      return;
    }

    // Fires once on load with the restored session (or null), then on every
    // sign-in and sign-out. Returns its own unsubscribe function.
    return onAuthStateChanged(getFirebaseAuth(), (firebaseUser) => {
      if (!firebaseUser) {
        // The entitlement belongs to the person who bought it. Clearing
        // it with the session stops the next person signing in on this
        // device from inheriting premium for a frame.
        useEntitlementState.getState().setHasPremium(false);
        setSignedOut();
        return;
      }

      const authUser = {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName
      };

      // ensureUserProfile now returns the stored profile as well as
      // creating it, so hydration rides on the call that was already
      // being made — no second round trip, no new async layer.
      //
      // The store is filled and only THEN is status flipped to
      // 'signed_in', so the app never renders a frame with an empty
      // certificateName. Status stays 'loading' until this resolves,
      // which is the branch AuthGate already had.
      //
      // ensureUserProfile never throws: on any failure it returns null
      // and sign-in proceeds with whatever Firebase Auth supplied.
      // RevenueCat Web Billing has no anonymous mode: the SDK is
      // configured with the Firebase uid, which is what makes an
      // entitlement follow the account rather than the install. This
      // has to happen before any screen can render a paywall, so it
      // rides on the same callback as the profile hydration.
      //
      // configurePurchases never throws and never blocks: entitlements
      // are read after sign-in completes, so a slow or failed
      // RevenueCat call cannot hold up the app.
      configurePurchases(firebaseUser.uid).then(() => {
        useEntitlementState.getState().checkEntitlements();
      });

      ensureUserProfile(authUser).then((profile) => {
        setCertificateName(profile ? profile.certificateName : null);
        setAuthenticated(authUser);
      });
    });
  }, [configured, setAuthenticated, setSignedOut, setCertificateName]);

  // A readable setup screen instead of a blank page.
  if (!configured) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <p style={styles.eyebrow}>Setup required</p>
          <h1 style={styles.title}>Firebase is not configured</h1>
          <p style={styles.body}>
            Create a file named <code style={styles.code}>.env.local</code> in the
            project root — the folder containing{' '}
            <code style={styles.code}>package.json</code>, not{' '}
            <code style={styles.code}>src/</code> — with one{' '}
            <code style={styles.code}>KEY=value</code> pair per line, then restart
            the dev server.
          </p>
          <p style={styles.body}>These variables are missing:</p>
          <ul style={styles.list}>
            {missingFirebaseKeys().map((key) => (
              <li key={key} style={styles.listItem}>
                <code style={styles.code}>{key}</code>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  if (status === 'loading') {
    return <LoadingFallback message="Checking your session…" />;
  }

  if (status === 'signed_out') {
    return <LoginScreen />;
  }

  return <>{children}</>;
};

export default AuthGate;

// -----------------------------
// Styles
// -----------------------------

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: 'var(--mt-page-padding, 40px) 20px',
    maxWidth: 'var(--mt-page-max-width, 900px)',
    margin: '0 auto',
    fontFamily: 'Inter, sans-serif',
    lineHeight: 1.6,
    color: '#1a1a1a',
    boxSizing: 'border-box'
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
    lineHeight: 1.25,
    margin: '0 0 16px 0'
  },
  body: {
    fontSize: '16px',
    color: '#444',
    maxWidth: '68ch',
    margin: '0 0 14px 0'
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
