import { DemoEnv, isDemoMode, premiumScenarioIds } from './demoMode';

const NO_KEY: DemoEnv = { REACT_APP_DEMO_MODE: 'true' };

describe('isDemoMode: off by default', () => {
  test.each([
    ['an empty environment', {}],
    ['only unrelated keys set', { REACT_APP_REVENUECAT_WEB_BILLING_KEY: 'x' }],
    ['the flag undefined', { REACT_APP_DEMO_MODE: undefined }]
  ] as Array<[string, DemoEnv]>)('is off for %s', (_label, env) => {
    expect(isDemoMode(env)).toBe(false);
  });
});

describe('isDemoMode: the flag must be exactly "true"', () => {
  test('is on for "true" with no RevenueCat key', () => {
    expect(isDemoMode(NO_KEY)).toBe(true);
  });

  test.each([
    [''],
    ['false'],
    ['TRUE'],
    ['True'],
    ['1'],
    ['yes'],
    [' true'],
    ['true '],
    ['on']
  ])('is off for the flag value %p', (flag) => {
    expect(isDemoMode({ REACT_APP_DEMO_MODE: flag })).toBe(false);
  });
});

describe('isDemoMode: never active in a build that can take payments', () => {
  test('is on when the key is undefined', () => {
    expect(isDemoMode({ REACT_APP_DEMO_MODE: 'true', REACT_APP_REVENUECAT_WEB_BILLING_KEY: undefined })).toBe(true);
  });

  test('is on when the key is empty', () => {
    expect(isDemoMode({ REACT_APP_DEMO_MODE: 'true', REACT_APP_REVENUECAT_WEB_BILLING_KEY: '' })).toBe(true);
  });

  test.each([['placeholder'], ['a'], [' '], ['0']])(
    'is OFF when a RevenueCat key is set (%p), even with the flag on',
    (key) => {
      expect(isDemoMode({ REACT_APP_DEMO_MODE: 'true', REACT_APP_REVENUECAT_WEB_BILLING_KEY: key })).toBe(false);
    }
  );
});

describe('premiumScenarioIds', () => {
  test('the web build without demo mode keeps MT-S02 behind the paywall', () => {
    expect(premiumScenarioIds(false, false)).toEqual(['MT-S02']);
  });

  test('demo mode on the web unlocks everything', () => {
    expect(premiumScenarioIds(false, true)).toEqual([]);
  });

  test('native builds are unchanged: nothing is premium', () => {
    expect(premiumScenarioIds(true, false)).toEqual([]);
    expect(premiumScenarioIds(true, true)).toEqual([]);
  });

  test('returns a fresh array each call, so callers cannot share state', () => {
    const first = premiumScenarioIds(false, false);
    first.push('MT-S99');
    expect(premiumScenarioIds(false, false)).toEqual(['MT-S02']);
  });
});
