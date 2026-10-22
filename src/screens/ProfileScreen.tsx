import React, { useState } from 'react';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  deleteUser
} from 'firebase/auth';

import { useNavigationState } from '../store/navigationState';
import { useAuthState } from '../store/authState';
import { getFirebaseAuth, getFirebaseDb } from '../lib/firebase';
import { SCENARIO_REGISTRY } from '../data/scenarioRegistry';
import { clearSession } from '../utils/sessionPersistence';

/**
 * Profile.
 *
 * One field today: the name printed on the certificate. It exists because
 * Firebase Auth gives email/password accounts no displayName, and a
 * certificate needs a name the person chose rather than one derived from
 * their email address.
 *
 * Local draft state, committed on Save. Binding the input straight to the
 * store would make Cancel meaningless — every keystroke would already be
 * saved.
 *
 * Save order is Firestore first, store second, navigate last. The store is
 * the UI's read path but Firestore is the record: updating the store first
 * would show the new name on a certificate that a refresh then reverts.
 */
const ProfileScreen: React.FC = () => {
  const setCurrentScreen = useNavigationState((state) => state.setCurrentScreen);

  const user = useAuthState((state) => state.user);
  const certificateName = useAuthState((state) => state.certificateName);
  const setCertificateName = useAuthState((state) => state.setCertificateName);

  const [draft, setDraft] = useState(certificateName || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (saving) {
      return;
    }

    const uid = user ? user.uid : null;

    if (!uid) {
      // AuthGate should make this unreachable; the screen must still say
      // something rather than appear to save and lose the name.
      setError('You are not signed in, so this could not be saved.');
      return;
    }

    setSaving(true);
    setError(null);

    // Stored trimmed, and null rather than an empty string, so the
    // certificate's "is it set?" check and this field agree.
    const trimmed = draft.trim();
    const value = trimmed.length > 0 ? trimmed : null;

    try {
      // The document already exists: ensureUserProfile creates it on first
      // sign-in. updateDoc rather than setDoc for that reason — this never
      // creates a document or a collection.
      await updateDoc(doc(getFirebaseDb(), 'users', uid), {
        certificateName: value
      });
    } catch (err) {
      setSaving(false);
      setError('Your name could not be saved. Check your connection and try again.');
      return;
    }

    setCertificateName(value);
    setSaving(false);
    setCurrentScreen('scenario_select');
  };

  const handleCancel = () => {
    setCurrentScreen('scenario_select');
  };

  // -----------------------------
  // Account deletion
  //
  // Required by Google Play for any app that lets users create an account.
  // Order: re-authenticate, delete Firestore records while the token is
  // still valid, clear local storage, then delete the Auth user last.
  // deleteUser() fires onAuthStateChanged(null), and AuthGate takes the
  // user to the sign-in screen, so nothing here navigates afterwards.
  //
  // scenarioAnalytics records are create-only by rule and are removed by
  // the operator within 30 days, as the privacy policy states.
  // -----------------------------
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const auth = getFirebaseAuth();
  const usesPassword =
    auth.currentUser !== null &&
    auth.currentUser.providerData.some((p) => p.providerId === 'password');

  const handleDeleteAccount = async () => {
    if (deleting) {
      return;
    }

    const firebaseUser = auth.currentUser;

    if (!firebaseUser) {
      setDeleteError('You are not signed in, so the account could not be deleted.');
      return;
    }

    if (usesPassword && deletePassword.length === 0) {
      setDeleteError('Enter your password to confirm.');
      return;
    }

    setDeleting(true);
    setDeleteError(null);

    try {
      if (usesPassword) {
        const credential = EmailAuthProvider.credential(
          firebaseUser.email || '',
          deletePassword
        );
        await reauthenticateWithCredential(firebaseUser, credential);
      } else {
        await reauthenticateWithPopup(firebaseUser, new GoogleAuthProvider());
      }
    } catch (err) {
      const code = (err as { code?: string }).code || '';
      setDeleting(false);
      setDeleteError(
        code === 'auth/wrong-password' || code === 'auth/invalid-credential'
          ? 'That password is incorrect.'
          : 'We could not confirm it is you. Check your connection and try again.'
      );
      return;
    }

    const uid = firebaseUser.uid;
    const db = getFirebaseDb();

    try {
      await Promise.all(
        SCENARIO_REGISTRY.map((entry) =>
          deleteDoc(doc(db, 'userScenarioState', uid + '_' + entry.scenarioId))
        )
      );
      await deleteDoc(doc(db, 'users', uid));
    } catch (err) {
      setDeleting(false);
      setDeleteError(
        'Your data could not be deleted. Check your connection and try again.'
      );
      return;
    }

    clearSession();

    try {
      await deleteUser(firebaseUser);
    } catch (err) {
      setDeleting(false);
      setDeleteError(
        'Your data was deleted but the sign-in account was not. Try again, or please contact support for assistance.'
      );
      return;
    }

    // The next person to sign in on this device starts at the selector,
    // not on this screen.
    setCurrentScreen('scenario_select');
  };

  const cancelDelete = () => {
    setConfirmingDelete(false);
    setDeletePassword('');
    setDeleteError(null);
  };

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <p style={styles.eyebrow}>Account</p>
        <h1 style={styles.title}>Profile</h1>
        <p style={styles.subtitle}>
          The name here is the one printed on your certificate.
        </p>
      </header>

      <div style={styles.divider} />

      {/* Error */}
      {error && (
        <div style={styles.errorBox} role="alert">
          <p style={styles.errorText}>{error}</p>
        </div>
      )}

      {/* Certificate name */}
      <section style={styles.section}>
        <h2 style={styles.sectionLabel}>Certificate Name</h2>

        <div style={styles.card}>
          <div style={styles.field}>
            <label style={styles.fieldLabel} htmlFor="profile-certificate-name">
              Name
            </label>
            <input
              id="profile-certificate-name"
              style={styles.input}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={saving}
              autoComplete="name"
            />
            <p style={styles.hint}>
              Leave this blank to use the name on your sign-in account.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <div style={styles.ctaRow}>
        <button
          style={saving ? { ...styles.secondary, ...styles.disabled } : styles.secondary}
          onClick={handleCancel}
          disabled={saving}
        >
          Cancel
        </button>

        <button
          style={saving ? { ...styles.cta, ...styles.disabled } : styles.cta}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Delete account */}
      <section style={styles.dangerSection}>
        <h2 style={styles.sectionLabel}>Delete Account</h2>

        <div style={styles.dangerCard}>
          <p style={styles.dangerText}>
            Permanently deletes your sign-in account, certificate name and
            scenario progress. This cannot be undone.
          </p>

          {deleteError && (
            <div style={styles.errorBox} role="alert">
              <p style={styles.errorText}>{deleteError}</p>
            </div>
          )}

          {!confirmingDelete ? (
            <button
              style={styles.danger}
              onClick={() => setConfirmingDelete(true)}
            >
              Delete account
            </button>
          ) : (
            <>
              {usesPassword && (
                <div style={styles.field}>
                  <label style={styles.fieldLabel} htmlFor="profile-delete-password">
                    Enter your password to confirm
                  </label>
                  <input
                    id="profile-delete-password"
                    type="password"
                    style={styles.input}
                    value={deletePassword}
                    onChange={(event) => setDeletePassword(event.target.value)}
                    disabled={deleting}
                    autoComplete="current-password"
                  />
                </div>
              )}

              <div style={styles.dangerActions}>
                <button
                  style={deleting ? { ...styles.secondary, ...styles.disabled } : styles.secondary}
                  onClick={cancelDelete}
                  disabled={deleting}
                >
                  Keep my account
                </button>
                <button
                  style={deleting ? { ...styles.danger, ...styles.disabled } : styles.danger}
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting…' : 'Permanently delete'}
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
};

export default ProfileScreen;

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
    margin: '0 0 12px 0'
  },
  subtitle: {
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
  errorBox: {
    backgroundColor: '#fff5f5',
    border: '1px solid #f3c2c2',
    borderRadius: '10px',
    padding: '18px 20px',
    marginBottom: '32px'
  },
  errorText: {
    fontSize: '15px',
    color: '#7a2626',
    margin: 0
  },
  section: {
    marginBottom: '32px'
  },
  sectionLabel: {
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#6b7280',
    margin: '0 0 16px 0'
  },
  card: {
    padding: '24px',
    backgroundColor: '#fafafa',
    border: '1px solid #e6e6e6',
    borderRadius: '12px'
  },
  field: {
    marginBottom: 0,
    maxWidth: '460px'
  },
  fieldLabel: {
    display: 'block',
    fontSize: '14px',
    fontWeight: 600,
    color: '#374151',
    marginBottom: '8px'
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
    margin: '8px 0 0 0'
  },
  ctaRow: {
    marginTop: '8px',
    paddingTop: '28px',
    borderTop: '1px solid #e6e6e6',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    alignItems: 'center'
  },
  secondary: {
    padding: '16px 28px',
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
    padding: '16px 28px',
    fontSize: '18px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    backgroundColor: '#0078D4',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer'
  },
  disabled: {
    opacity: 0.55,
    cursor: 'not-allowed'
  },
  dangerSection: {
    marginTop: '48px'
  },
  dangerCard: {
    padding: '24px',
    backgroundColor: '#fff',
    border: '1px solid #f3c2c2',
    borderRadius: '12px'
  },
  dangerText: {
    fontSize: '15px',
    color: '#444',
    margin: '0 0 20px 0'
  },
  dangerActions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    alignItems: 'center',
    marginTop: '20px'
  },
  danger: {
    padding: '14px 24px',
    fontSize: '16px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    backgroundColor: '#fff',
    color: '#b42318',
    border: '1px solid #b42318',
    borderRadius: '8px',
    cursor: 'pointer'
  }
};
