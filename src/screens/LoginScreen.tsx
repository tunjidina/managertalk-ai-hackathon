import React, { useState } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
  GoogleAuthProvider
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';

import { getFirebaseAuth } from '../lib/firebase';

type Mode = 'sign_in' | 'sign_up';

/**
 * True in a browser, false inside the Capacitor Android/iOS WebView.
 *
 * Google sign-in here goes through signInWithPopup, which opens a second
 * browser window and posts the credential back to the opener. A Capacitor
 * WebView has no opener to post back to, so the popup either fails to open
 * or hangs on a blank page — the button would be present and permanently
 * broken. Hiding it is the honest state of the app on native until the
 * native plugin path (@capacitor-firebase/authentication) is wired in.
 *
 * Computed once at module scope rather than per render: the platform
 * cannot change during a session, and this keeps it out of the component's
 * render path.
 *
 * Capacitor.isNativePlatform() returns false in any normal browser, so the
 * web build — dev server and deployed — is unaffected.
 */
const SHOW_GOOGLE_SIGN_IN = !Capacitor.isNativePlatform();

/**
 * Maps Firebase error codes onto sentences a person can act on.
 * Firebase's own messages leak internals ("auth/invalid-credential").
 */
function describeAuthError(code: string): string {
  switch (code) {
    case 'auth/invalid-email':
      return 'That email address is not valid.';
    case 'auth/missing-password':
      return 'Enter your password.';
    case 'auth/weak-password':
      return 'Passwords need to be at least 6 characters.';
    case 'auth/email-already-in-use':
      return 'That email is already registered. Sign in instead.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email or password is incorrect.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a moment and try again.';
    case 'auth/network-request-failed':
      return 'Could not reach the sign-in service. Check your connection.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Google sign-in was cancelled.';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled in the Firebase console.';
    default:
      return 'Sign-in failed. Please try again.';
  }
}

const LoginScreen: React.FC = () => {
  const [mode, setMode] = useState<Mode>('sign_in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Separate from `error` so a reset confirmation doesn't render in the
  // red error box, and so sending a reset doesn't clear a sign-in error
  // the user still needs to read.
  const [notice, setNotice] = useState<string | null>(null);

  // No navigation here on success: AuthGate re-renders when
  // onAuthStateChanged fires, which is the single source of truth.
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);

    try {
      if (mode === 'sign_in') {
        await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
      } else {
        await createUserWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
      }
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code: unknown }).code)
          : '';
      setError(describeAuthError(code));
      setBusy(false);
    }
  };

  // Web only — unreachable on native, where the button that calls it is
  // not rendered. Left exactly as it was: when the native plugin path is
  // added later, this becomes the browser branch of a platform check
  // rather than something to rewrite.
  const handleGoogle = async () => {
    setError(null);
    setNotice(null);
    setBusy(true);

    try {
      await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code: unknown }).code)
          : '';
      setError(describeAuthError(code));
      setBusy(false);
    }
  };

  /**
   * Sends Firebase's own password reset email. Firebase hosts the reset
   * page and handles the token, so there is no backend to write and
   * nothing to build for the link's destination.
   *
   * The confirmation is deliberately the same whether or not the address
   * has an account. Saying "no account found" would turn this form into
   * a way to discover which emails are registered.
   */
  const handleReset = async () => {
    const address = email.trim();

    if (!address) {
      setNotice(null);
      setError('Enter your email address first, then tap Forgot password.');
      return;
    }

    setError(null);
    setNotice(null);
    setBusy(true);

    try {
      await sendPasswordResetEmail(getFirebaseAuth(), address);
      setNotice(
        'If that email has an account, a reset link is on its way. Check your spam folder too.'
      );
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code: unknown }).code)
          : '';

      // An unregistered address reports auth/user-not-found. Treated as
      // success for the same reason as above.
      if (code === 'auth/user-not-found') {
        setNotice(
          'If that email has an account, a reset link is on its way. Check your spam folder too.'
        );
      } else {
        setError(describeAuthError(code));
      }
    }

    setBusy(false);
  };

  const toggleMode = () => {
    setMode(mode === 'sign_in' ? 'sign_up' : 'sign_in');
    setError(null);
    setNotice(null);
  };

  const submitLabel = mode === 'sign_in' ? 'Sign in' : 'Create account';

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.brand}>
          <span style={styles.brandMark} aria-hidden="true" />
          <span style={styles.brandName}>ManagerTalk</span>
        </div>

        <h1 style={styles.title}>
          {mode === 'sign_in' ? 'Sign in to continue' : 'Create your account'}
        </h1>
        <p style={styles.subtitle}>
          Difficult conversation coaching, one scenario at a time.
        </p>

        {/*
          Button and divider hide together. The divider only exists to
          separate two sign-in methods; on native there is one, and a lone
          "or use your email" rule above the form reads as a bug.
        */}
        {SHOW_GOOGLE_SIGN_IN && (
          <>
            <button
              type="button"
              style={busy ? { ...styles.googleButton, ...styles.disabled } : styles.googleButton}
              onClick={handleGoogle}
              disabled={busy}
            >
              Continue with Google
            </button>

            <div style={styles.divider}>
              <span style={styles.dividerLine} aria-hidden="true" />
              <span style={styles.dividerText}>or use your email</span>
              <span style={styles.dividerLine} aria-hidden="true" />
            </div>
          </>
        )}

        {error && (
          <div style={styles.errorBox} role="alert">
            <p style={styles.errorText}>{error}</p>
          </div>
        )}

        {notice && (
          <div style={styles.noticeBox} role="status">
            <p style={styles.noticeText}>{notice}</p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={styles.field}>
            <label style={styles.label} htmlFor="auth-email">
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              required
              style={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label} htmlFor="auth-password">
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              autoComplete={mode === 'sign_in' ? 'current-password' : 'new-password'}
              required
              minLength={6}
              style={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            {mode === 'sign_up' && (
              <p style={styles.hint}>At least 6 characters.</p>
            )}

            {/*
              Sign-in only. On the sign-up form there is no account to
              reset yet, and offering it there invites people to reset a
              password they are in the middle of choosing.
            */}
            {mode === 'sign_in' && (
              <div style={styles.forgotRow}>
                <button
                  type="button"
                  style={busy ? { ...styles.linkButton, ...styles.disabled } : styles.linkButton}
                  onClick={handleReset}
                  disabled={busy}
                >
                  Forgot password?
                </button>
              </div>
            )}
          </div>

          <button
            type="submit"
            style={busy ? { ...styles.cta, ...styles.disabled } : styles.cta}
            disabled={busy}
          >
            {busy ? 'Working…' : submitLabel}
          </button>
        </form>

        <p style={styles.switcher}>
          {mode === 'sign_in' ? 'New here?' : 'Already have an account?'}{' '}
          <button type="button" style={styles.linkButton} onClick={toggleMode}>
            {mode === 'sign_in' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
};

export default LoginScreen;

// -----------------------------
// Styles
// -----------------------------

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '70vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--mt-page-padding, 40px) 20px',
    fontFamily: 'Inter, sans-serif',
    lineHeight: 1.6,
    color: '#1a1a1a',
    boxSizing: 'border-box'
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    padding: '36px 32px',
    backgroundColor: '#fff',
    border: '1px solid #e6e6e6',
    borderRadius: '12px',
    boxSizing: 'border-box'
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '26px'
  },
  brandMark: {
    width: '10px',
    height: '10px',
    borderRadius: '3px',
    backgroundColor: '#0078D4'
  },
  brandName: {
    fontSize: '15px',
    fontWeight: 700,
    letterSpacing: '-0.01em'
  },
  title: {
    fontSize: '26px',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    lineHeight: 1.25,
    margin: '0 0 8px 0'
  },
  subtitle: {
    fontSize: '15px',
    color: '#6b7280',
    margin: '0 0 26px 0'
  },
  googleButton: {
    width: '100%',
    padding: '13px 16px',
    fontSize: '15px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    backgroundColor: '#fff',
    color: '#374151',
    border: '1px solid #d4d4d4',
    borderRadius: '8px',
    cursor: 'pointer'
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    margin: '22px 0'
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    backgroundColor: '#e6e6e6'
  },
  dividerText: {
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: '#9ca3af',
    whiteSpace: 'nowrap'
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
  noticeBox: {
    backgroundColor: '#f2f8f4',
    border: '1px solid #c2ddcb',
    borderRadius: '8px',
    padding: '12px 14px',
    marginBottom: '18px'
  },
  noticeText: {
    fontSize: '14px',
    color: '#24603c',
    margin: 0
  },
  forgotRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: '8px'
  },
  field: {
    marginBottom: '18px'
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: 600,
    color: '#374151',
    marginBottom: '7px'
  },
  input: {
    width: '100%',
    padding: '13px 14px',
    borderRadius: '8px',
    border: '1px solid #d4d4d4',
    backgroundColor: '#fff',
    fontSize: '16px',
    fontFamily: 'Inter, sans-serif',
    color: '#1a1a1a',
    boxSizing: 'border-box'
  },
  hint: {
    fontSize: '13px',
    color: '#6b7280',
    margin: '7px 0 0 0'
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
    marginTop: '4px'
  },
  disabled: {
    opacity: 0.6,
    cursor: 'not-allowed'
  },
  switcher: {
    fontSize: '14px',
    color: '#6b7280',
    textAlign: 'center',
    margin: '22px 0 0 0'
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
  }
};
