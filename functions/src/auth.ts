// functions/src/auth.ts
//
// Caller authentication for /api/s02/turn: a Firebase ID token in an
// `Authorization: Bearer <token>` header, verified server-side on every
// request. The verifier is injected so the handler can be tested without
// a Firebase project; production wires in the Admin SDK (see index.ts).

/** Real Firebase ID tokens are roughly 1 KB; anything this long is not one. */
export const MAX_ID_TOKEN_CHARS = 4096;

/** Exactly "Bearer", one space, then a token with no whitespace. */
const BEARER_PATTERN = /^Bearer ([^\s]+)$/;

/** Returns the token, or null when the header is missing or malformed. */
export function parseBearerToken(header: string | undefined): string | null {
  if (typeof header !== 'string') {
    return null;
  }
  const match = BEARER_PATTERN.exec(header);
  if (!match || match[1].length > MAX_ID_TOKEN_CHARS) {
    return null;
  }
  return match[1];
}

export interface VerifiedCaller {
  uid: string;
}

/**
 * Resolves for a valid token; rejects for a missing, malformed, expired,
 * revoked or wrong-project token. Callers must not distinguish the reasons
 * in anything they return to the client.
 */
export type VerifyIdToken = (token: string) => Promise<VerifiedCaller>;

/** The slice of firebase-admin's Auth this module needs. */
export interface AdminAuthLike {
  verifyIdToken(token: string): Promise<{ uid: string }>;
}

/** Adapts the Admin SDK verifier to VerifyIdToken. */
export function adminVerifier(auth: AdminAuthLike): VerifyIdToken {
  return async (token) => {
    const decoded = await auth.verifyIdToken(token);
    if (!decoded || typeof decoded.uid !== 'string' || decoded.uid.length === 0) {
      throw new Error('Token has no uid');
    }
    return { uid: decoded.uid };
  };
}
