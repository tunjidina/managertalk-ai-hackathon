// Checks the deployed function's configuration without starting it.
// Loading index.ts registers the function; it does not initialise
// firebase-admin or make any network call.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FUNCTION_REGION, s02Turn } from './index';
import { DEFAULT_TIMEOUT_MS } from './nebiusModel';

interface EndpointMetadata {
  region?: string[];
  maxInstances?: number;
  httpsTrigger?: unknown;
  secretEnvironmentVariables?: Array<{ key: string }>;
  timeoutSeconds?: number;
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

test('s02Turn binds the Nebius key as a secret and nothing else', () => {
  const secrets = (endpoint && endpoint.secretEnvironmentVariables) || [];
  assert.deepEqual(secrets.map((secret) => secret.key), ['NEBIUS_API_KEY']);
});

test('s02Turn keeps its timeout above the model timeout', () => {
  assert.equal(endpoint && endpoint.timeoutSeconds, 30);
  assert.ok(DEFAULT_TIMEOUT_MS < 30_000);
});
