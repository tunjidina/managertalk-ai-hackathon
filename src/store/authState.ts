import { create } from 'zustand';

// -----------------------------
// Types
// -----------------------------

export type AuthStatus = 'loading' | 'signed_in' | 'signed_out';

/**
 * Only what the UI needs. The full Firebase User object is deliberately not
 * stored — keeping this plain makes the store serialisable and keeps the
 * Firebase SDK out of every component that wants the signed-in email.
 */
export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;

  /**
   * The name the user wants printed on their certificate, set on the
   * profile screen.
   *
   * Lives here rather than in a new store because it is user identity,
   * not UI state — the same domain as `user`. It is separate from
   * `user.displayName` because that field belongs to Firebase Auth and is
   * overwritten on every onAuthStateChanged; this one is the user's own
   * choice and must survive that.
   *
   * PERSISTENCE: the same route `user` takes. This store has no persist
   * middleware; the durable copy lives in Firestore at
   * users/{uid}.certificateName, ProfileScreen writes it there, and
   * AuthGate rehydrates this field from the profile before flipping
   * status to 'signed_in'. The store stays the read path for the UI.
   */
  certificateName: string | null;

  // Actions
  setAuthenticated: (user: AuthUser) => void;
  setSignedOut: () => void;
  setCertificateName: (name: string | null) => void;
  resetAuth: () => void;
}

// -----------------------------
// Zustand Store
// -----------------------------

export const useAuthState = create<AuthState>((set) => ({
  // Starts as 'loading': Firebase restores a persisted session
  // asynchronously, so the app must not decide "signed out" before
  // onAuthStateChanged has fired once.
  status: 'loading',
  user: null,
  certificateName: null,

  setAuthenticated: (user) => set({ status: 'signed_in', user }),

  // certificateName is cleared with the user: it belongs to that person,
  // and the next person signing in on this device must not inherit it.
  setSignedOut: () => set({ status: 'signed_out', user: null, certificateName: null }),

  // Trimmed on the way in so a name of spaces cannot pass the
  // "is it set?" check that the certificate's fallback chain makes.
  // Accepts null so AuthGate can hydrate an empty profile without a cast.
  setCertificateName: (name) => {
    const trimmed = (name || '').trim();
    set({ certificateName: trimmed.length > 0 ? trimmed : null });
  },

  resetAuth: () =>
    set({
      status: 'loading',
      user: null,
      certificateName: null
    })
}));
