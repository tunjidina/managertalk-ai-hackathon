import { AuthEmulatorEnv, resolveAuthEmulatorUrl } from './authEmulator';

const VALID: AuthEmulatorEnv = {
  NODE_ENV: 'development',
  REACT_APP_USE_AUTH_EMULATOR: 'true',
  REACT_APP_FIREBASE_PROJECT_ID: 'demo-managertalk',
  REACT_APP_AUTH_EMULATOR_URL: 'http://127.0.0.1:9099'
};

function env(overrides: Partial<AuthEmulatorEnv>): AuthEmulatorEnv {
  return { ...VALID, ...overrides };
}

describe('resolveAuthEmulatorUrl: when every guard passes', () => {
  test('returns the emulator origin', () => {
    expect(resolveAuthEmulatorUrl(VALID)).toBe('http://127.0.0.1:9099');
  });

  test.each([
    ['http://localhost:9099', 'http://localhost:9099'],
    ['http://127.0.0.1:9099/', 'http://127.0.0.1:9099'],
    ['http://[::1]:9099', 'http://[::1]:9099'],
    ['http://127.10.20.30:9099', 'http://127.10.20.30:9099'],
    ['http://127.1:9099', 'http://127.0.0.1:9099'],
    ['http://0x7f.1:9099', 'http://127.0.0.1:9099']
  ])('accepts the loopback address %s', (url, expected) => {
    expect(resolveAuthEmulatorUrl(env({ REACT_APP_AUTH_EMULATOR_URL: url }))).toBe(expected);
  });

  test('does not require the default port', () => {
    expect(resolveAuthEmulatorUrl(env({ REACT_APP_AUTH_EMULATOR_URL: 'http://localhost' }))).toBe(
      'http://localhost'
    );
  });
});

describe('resolveAuthEmulatorUrl: build mode guard', () => {
  test.each([['production'], ['test'], [undefined], [''], ['Development'], ['dev']])(
    'returns null when NODE_ENV is %p',
    (nodeEnv) => {
      expect(resolveAuthEmulatorUrl(env({ NODE_ENV: nodeEnv }))).toBeNull();
    }
  );
});

describe('resolveAuthEmulatorUrl: explicit flag guard', () => {
  test.each([[undefined], [''], ['false'], ['TRUE'], ['True'], ['1'], ['yes'], [' true']])(
    'returns null when the flag is %p',
    (flag) => {
      expect(resolveAuthEmulatorUrl(env({ REACT_APP_USE_AUTH_EMULATOR: flag }))).toBeNull();
    }
  );
});

describe('resolveAuthEmulatorUrl: demo project guard', () => {
  test.each([
    ['a production-style project ID', 'managertalk-a1b2c'],
    ['a missing project ID', undefined],
    ['an empty project ID', ''],
    ['just the prefix', 'demo-'],
    ['demo without the hyphen', 'demomanagertalk'],
    ['demo inside the name', 'my-demo-managertalk'],
    ['a different case', 'DEMO-managertalk']
  ])('returns null for %s', (_label, projectId) => {
    expect(resolveAuthEmulatorUrl(env({ REACT_APP_FIREBASE_PROJECT_ID: projectId }))).toBeNull();
  });
});

describe('resolveAuthEmulatorUrl: URL guards', () => {
  test.each([
    ['a missing URL', undefined],
    ['an empty URL', ''],
    ['a malformed URL', 'not a url'],
    ['a URL with no scheme', '127.0.0.1:9099'],
    ['https on loopback', 'https://127.0.0.1:9099'],
    ['a non-loopback host', 'http://example.com:9099'],
    ['a LAN address', 'http://192.168.1.10:9099'],
    ['a localhost lookalike', 'http://localhost.evil.test:9099'],
    ['a loopback lookalike', 'http://127.0.0.1.evil.test:9099'],
    ['localhost with a trailing dot', 'http://localhost.:9099'],
    ['the unspecified address', 'http://0.0.0.0:9099'],
    ['username and password', 'http://user:pass@127.0.0.1:9099'],
    ['a username only', 'http://user@127.0.0.1:9099'],
    ['empty credentials', 'http://@127.0.0.1:9099'],
    ['a query string', 'http://127.0.0.1:9099?x=1'],
    ['an empty query string', 'http://127.0.0.1:9099?'],
    ['a fragment', 'http://127.0.0.1:9099#a'],
    ['an empty fragment', 'http://127.0.0.1:9099#'],
    ['a path', 'http://127.0.0.1:9099/identitytoolkit'],
    ['an ftp scheme', 'ftp://127.0.0.1:9099'],
    ['a data scheme', 'data:text/plain,hello'],
    ['a javascript scheme', ['javascript', 'alert(1)'].join(':')]
  ])('returns null for %s', (_label, url) => {
    expect(resolveAuthEmulatorUrl(env({ REACT_APP_AUTH_EMULATOR_URL: url }))).toBeNull();
  });
});

describe('resolveAuthEmulatorUrl: fails closed', () => {
  test('returns null for an empty environment', () => {
    expect(resolveAuthEmulatorUrl({})).toBeNull();
  });

  test('returns null when several guards fail at once', () => {
    expect(
      resolveAuthEmulatorUrl({
        NODE_ENV: 'production',
        REACT_APP_USE_AUTH_EMULATOR: 'true',
        REACT_APP_FIREBASE_PROJECT_ID: 'managertalk-a1b2c',
        REACT_APP_AUTH_EMULATOR_URL: 'https://example.com'
      })
    ).toBeNull();
  });

  test('a production build with an otherwise valid environment gets no emulator', () => {
    expect(resolveAuthEmulatorUrl(env({ NODE_ENV: 'production' }))).toBeNull();
  });
});
