import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as entry from './index';
import { DailyLimiter } from './dailyLimiter';

// The Workers runtime treats every export of the entry module as a handler or
// a Durable Object class and refuses to start on anything else (a string or a
// helper function). `wrangler dev` failed exactly this way when index.ts also
// exported TURN_PATH, parseCap and createWorker.
test('the entry module exports only the default handler and the Durable Object class', () => {
  assert.deepEqual(Object.keys(entry).sort(), ['DailyLimiter', 'default']);
});

test('the default export is a handler with fetch, and DailyLimiter is the bound class', () => {
  assert.equal(typeof entry.default.fetch, 'function');
  assert.equal(entry.DailyLimiter, DailyLimiter);
  assert.equal(typeof entry.DailyLimiter.prototype.fetch, 'function');
});
