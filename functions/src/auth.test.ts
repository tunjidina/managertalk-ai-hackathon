import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MAX_ID_TOKEN_CHARS, adminVerifier, parseBearerToken } from './auth';

test('parses a well-formed Bearer header', () => {
  assert.equal(parseBearerToken('Bearer abc.def.ghi'), 'abc.def.ghi');
});

test('accepts a token at the length limit and rejects one over it', () => {
  assert.equal(parseBearerToken('Bearer ' + 'a'.repeat(MAX_ID_TOKEN_CHARS)), 'a'.repeat(MAX_ID_TOKEN_CHARS));
  assert.equal(parseBearerToken('Bearer ' + 'a'.repeat(MAX_ID_TOKEN_CHARS + 1)), null);
});

for (const header of [undefined, '', 'Bearer', 'Bearer ', 'bearer abc', 'Token abc', 'Bearer  abc', 'Bearer abc ', ' Bearer abc', 'Bearer a\tb']) {
  test('rejects header ' + JSON.stringify(header), () => {
    assert.equal(parseBearerToken(header), null);
  });
}

test('adminVerifier returns the uid from the Admin SDK', async () => {
  const verify = adminVerifier({ verifyIdToken: async () => ({ uid: 'u1' }) });
  assert.deepEqual(await verify('t'), { uid: 'u1' });
});

test('adminVerifier rejects when the Admin SDK rejects', async () => {
  const verify = adminVerifier({
    verifyIdToken: async () => {
      throw new Error('auth/argument-error');
    }
  });
  await assert.rejects(verify('t'));
});

test('adminVerifier rejects a decoded token without a uid', async () => {
  const verify = adminVerifier({ verifyIdToken: async () => ({ uid: '' }) });
  await assert.rejects(verify('t'));
});
