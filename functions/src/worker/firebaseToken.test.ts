import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';

import { createFirebaseVerifier } from './firebaseToken';
import { PROJECT_ID, makeKeys } from './workerSupport.test';

async function setup(projectId: string | undefined | null = PROJECT_ID) {
  const keys = await makeKeys();
  return { keys, verify: createFirebaseVerifier({ projectId: projectId === null ? undefined : projectId, keySet: keys.keySet }) };
}

test('accepts a valid token and returns the subject as uid', async () => {
  const { keys, verify } = await setup();
  assert.deepEqual(await verify(await keys.mint()), { uid: 'user-abc' });
});

const rejected: Array<[string, (keys: Awaited<ReturnType<typeof makeKeys>>) => Promise<string>]> = [
  ['an expired token', (k) => k.mint({}, { expiresInSeconds: -3600 })],
  ['the wrong audience', (k) => k.mint({ aud: 'some-other-project' })],
  ['the wrong issuer', (k) => k.mint({ iss: 'https://securetoken.google.com/some-other-project' })],
  ['a forged signature under a published key id', (k) => k.mint({}, { forged: true })],
  ['an unknown key id', (k) => k.mint({}, { kid: 'not-published' })],
  ['a missing subject', (k) => k.mint({}, { omit: ['sub'] })],
  ['an empty subject', (k) => k.mint({ sub: '' }, { omit: ['sub'] })],
  ['an over-long subject', (k) => k.mint({ sub: 'x'.repeat(129) }, { omit: ['sub'] })],
  ['an auth_time in the future', (k) => k.mint({ auth_time: Math.floor(Date.now() / 1000) + 3600 })],
  ['a missing expiry', (k) => k.mint({}, { omit: ['exp'] })],
  ['an issued-at in the future', (k) => k.mint({ iat: Math.floor(Date.now() / 1000) + 3600 })],
  ['a missing auth_time', (k) => k.mint({ auth_time: undefined })]
];

for (const [label, mint] of rejected) {
  test('rejects ' + label, async () => {
    const { keys, verify } = await setup();
    await assert.rejects(verify(await mint(keys)));
  });
}

test('rejects a token signed with an HMAC secret (algorithm confusion)', async () => {
  const { verify } = await setup();
  const hs = await new SignJWT({ auth_time: Math.floor(Date.now() / 1000) - 60 })
    .setProtectedHeader({ alg: 'HS256', kid: 'test-key-1' })
    .setIssuer('https://securetoken.google.com/' + PROJECT_ID)
    .setAudience(PROJECT_ID)
    .setSubject('user-abc')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode('a-shared-secret-of-sufficient-length-0123456789'));
  await assert.rejects(verify(hs));
});

test('rejects an unsigned (alg none) token', async () => {
  const { verify } = await setup();
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const token =
    part({ alg: 'none', kid: 'test-key-1' }) + '.' +
    part({ iss: 'https://securetoken.google.com/' + PROJECT_ID, aud: PROJECT_ID, sub: 'user-abc', iat: now, exp: now + 3600, auth_time: now }) + '.';
  await assert.rejects(verify(token));
});

test('rejects malformed tokens', async () => {
  const { verify } = await setup();
  for (const token of ['', 'abc', 'a.b.c', 'a.b']) {
    await assert.rejects(verify(token));
  }
});

test('fails closed when no project id is configured', async () => {
  for (const projectId of [null, '']) {
    const { keys, verify } = await setup(projectId);
    await assert.rejects(verify(await keys.mint()));
  }
});

test('fails closed when the key set cannot be fetched', async () => {
  const keys = await makeKeys();
  const verify = createFirebaseVerifier({
    projectId: PROJECT_ID,
    keySet: (async () => {
      throw new Error('network down');
    }) as never
  });
  await assert.rejects(verify(await keys.mint()));
});

test('honours the injected clock', async () => {
  const keys = await makeKeys();
  const later = () => Date.now() + 2 * 3600 * 1000;
  const verify = createFirebaseVerifier({ projectId: PROJECT_ID, keySet: keys.keySet, now: later });
  await assert.rejects(verify(await keys.mint()));
});
