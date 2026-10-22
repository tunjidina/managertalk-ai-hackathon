// src/lib/userProfile.ts
//
// Creates the users/{uid} document on first sign-in, refreshes a last-seen
// stamp on every later one, and returns the stored profile so AuthGate can
// hydrate the store from it.
//
// Still never throws: a profile read or write failing must not block
// sign-in. On failure this returns null and the caller carries on with
// whatever Firebase Auth already provided.

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

import { getFirebaseDb } from './firebase';
import { AuthUser } from '../store/authState';

/** The fields of users/{uid} that the app reads back. */
export interface UserProfile {
  certificateName: string | null;
}

export async function ensureUserProfile(
  user: AuthUser
): Promise<UserProfile | null> {
  if (!user || !user.uid) {
    return null;
  }

  try {
    const ref = doc(getFirebaseDb(), 'users', user.uid);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      // Only the last-seen stamp is merged. certificateName is deliberately
      // NOT written here: this runs on every sign-in, and including it
      // would overwrite the name the user saved on the profile screen with
      // whatever the local store happened to hold.
      await setDoc(ref, { lastSeenAt: serverTimestamp() }, { merge: true });

      const raw = snap.data();
      return {
        certificateName:
          typeof raw.certificateName === 'string' && raw.certificateName.trim()
            ? raw.certificateName
            : null
      };
    }

    // First sign-in. certificateName is a top-level field, null until the
    // user sets one on the profile screen.
    await setDoc(ref, {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      certificateName: null,
      createdAt: serverTimestamp(),
      lastSeenAt: serverTimestamp()
    });

    return { certificateName: null };
  } catch (error) {
    // Swallowed on purpose. The user is signed in and the app works
    // without a profile document; logging is enough.
    // eslint-disable-next-line no-console
    console.warn('[ManagerTalk] Could not read or write user profile:', error);
    return null;
  }
}
