// Checks the deployed function's configuration without starting it.
// Loading index.ts registers the function; it does not initialise
// firebase-admin or make any network call.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FUNCTION_REGION, s02Turn } from './index';

interface EndpointMetadata {
  region?: string[];
  maxInstances?: number;
  httpsTrigger?: unknown;
}

const endpoint = (s02Turn as unknown as { __endpoint?: EndpointMetadata }).__endpoint;

test('s02Turn is an HTTPS function in europe-west2', () => {
  assert.equal(FUNCTION_REGION, 'europe-west2');
  assert.ok(endpoint, 'firebase-functions attached endpoint metadata');
  assert.deepEqual(endpoint && endpoint.region, ['europe-west2']);
  assert.ok(endpoint && endpoint.httpsTrigger !== undefined);
});

test('s02Turn caps its instance count', () => {
  assert.equal(endpoint && endpoint.maxInstances, 2);
});
