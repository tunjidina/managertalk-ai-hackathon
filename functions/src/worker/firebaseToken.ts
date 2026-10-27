// functions/src/worker/firebaseToken.ts
//
// Firebase ID-token verification for the Cloudflare Worker, where the Admin
// SDK is not available. It applies the checks documented for verifying ID
// tokens with a third-party JWT library: RS256 signature against Google's
// published keys, issuer, audience, expiry, and a non-empty subject. Like
// the Admin call it replaces (adminVerifier in ../auth.ts), it does not
// check for revoked tokens.
//
// A missing project id fails closed: every token is rejected.

import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { JWTVerifyGetKey } from 'jose';

import type { VerifyIdToken } from '../auth';

export const GOOGLE_SECURETOKEN_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

/** Tolerated clock difference, in seconds, for exp/nbf/iat/auth_time. */
export const CLOCK_TOLERANCE_SECONDS = 5;

const MAX_SUBJECT_CHARS = 128;

/** Google's key set. jose caches it in memory and refreshes it on a new kid. */
export function googleKeySet(): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL(GOOGLE_SECURETOKEN_JWKS_URL));
}

export interface FirebaseVerifierOptions {
  projectId: string | undefined;
  keySet: JWTVerifyGetKey;
  now?: () => number;
}

export function createFirebaseVerifier(options: FirebaseVerifierOptions): VerifyIdToken {
  const projectId = options.projectId;
  const now = options.now || Date.now;

  return async (token) => {
    if (typeof projectId !== 'string' || projectId.length === 0) {
      throw new Error('No Firebase project id configured');
    }

    const { payload } = await jwtVerify(token, options.keySet, {
      algorithms: ['RS256'],
      requiredClaims: ['exp', 'iat', 'sub'],
      issuer: 'https://securetoken.google.com/' + projectId,
      audience: projectId,
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
      currentDate: new Date(now())
    });

    const nowSeconds = Math.floor(now() / 1000);
    const latest = nowSeconds + CLOCK_TOLERANCE_SECONDS;

    const subject = payload.sub;
    if (typeof subject !== 'string' || subject.length === 0 || subject.length > MAX_SUBJECT_CHARS) {
      throw new Error('Token has no valid subject');
    }
    if (typeof payload.iat !== 'number' || payload.iat > latest) {
      throw new Error('Token was issued in the future');
    }
    const authTime = (payload as { auth_time?: unknown }).auth_time;
    if (typeof authTime !== 'number' || authTime > latest) {
      throw new Error('Token has no valid auth_time');
    }

    return { uid: subject };
  };
}
