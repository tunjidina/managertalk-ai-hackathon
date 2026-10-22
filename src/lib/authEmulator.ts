// src/lib/authEmulator.ts
//
// Decides whether the Firebase Auth emulator may be used, and where.
//
// Pure on purpose: no Firebase, no globals, no side effects, so every guard
// can be tested on its own and the decision cannot depend on anything but
// the values passed in. lib/firebase.ts calls it once and connects the
// emulator only when it returns a URL.
//
// FAIL CLOSED. A URL comes back only when every guard passes; any other
// outcome, including malformed input, returns null and the app talks to
// the real Firebase Auth exactly as before.
//
//   1. NODE_ENV is exactly "development" (`npm start`). Create React App
//      sets NODE_ENV itself and a REACT_APP_* variable cannot override it,
//      so a production build can never turn this on.
//   2. REACT_APP_USE_AUTH_EMULATOR is exactly "true".
//   3. The Firebase project ID starts with "demo-", the Firebase convention
//      for emulator-only projects that cannot exist in the cloud.
//   4. The URL is http:// on a loopback host: localhost, 127.0.0.0/8 or ::1.
//   5. The URL has no credentials, query, fragment or path.

export interface AuthEmulatorEnv {
  NODE_ENV?: string;
  REACT_APP_USE_AUTH_EMULATOR?: string;
  REACT_APP_FIREBASE_PROJECT_ID?: string;
  REACT_APP_AUTH_EMULATOR_URL?: string;
}

const DEMO_PROJECT_PREFIX = 'demo-';

function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') {
    return true;
  }
  // The URL parser normalises IPv4 forms (127.1, 0x7f.1, 2130706433, …) to
  // dotted decimal before this check.
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
}

/**
 * The origin to hand to connectAuthEmulator (for example
 * "http://127.0.0.1:9099"), or null when any guard fails.
 */
export function resolveAuthEmulatorUrl(env: AuthEmulatorEnv): string | null {
  if (typeof URL === 'undefined') {
    return null;
  }

  if (env.NODE_ENV !== 'development') {
    return null;
  }

  if (env.REACT_APP_USE_AUTH_EMULATOR !== 'true') {
    return null;
  }

  const projectId = env.REACT_APP_FIREBASE_PROJECT_ID;
  if (
    typeof projectId !== 'string' ||
    projectId.indexOf(DEMO_PROJECT_PREFIX) !== 0 ||
    projectId.length <= DEMO_PROJECT_PREFIX.length
  ) {
    return null;
  }

  const raw = env.REACT_APP_AUTH_EMULATOR_URL;
  if (typeof raw !== 'string' || raw.length === 0) {
    return null;
  }

  // The parser drops an empty query ("…?") or fragment ("…#") and an empty
  // credential ("…://@host"), so the raw text is checked for them as well.
  if (raw.indexOf('?') !== -1 || raw.indexOf('#') !== -1 || raw.indexOf('@') !== -1) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch (error) {
    return null;
  }

  if (parsed.protocol !== 'http:') {
    return null;
  }

  if (parsed.username !== '' || parsed.password !== '') {
    return null;
  }

  if (parsed.search !== '' || parsed.hash !== '') {
    return null;
  }

  if (parsed.pathname !== '/') {
    return null;
  }

  if (!isLoopbackHostname(parsed.hostname)) {
    return null;
  }

  return parsed.origin;
}
