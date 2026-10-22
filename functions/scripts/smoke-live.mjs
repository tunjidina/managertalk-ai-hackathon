// functions/scripts/smoke-live.mjs
//
// Gate A: a capped check that a Nebius Token Factory Nemotron model answers
// in the shape this service expects. DRY RUN BY DEFAULT: with no flags it
// prints the plan and makes no request, whether or not a key is set.
//
// To send requests (only after you have approved it and set the key in your
// own environment; never paste a key into chat or a file):
//
//   npm run build
//   NEBIUS_API_KEY=... SMOKE_CONFIRM=yes-make-live-calls \
//     node scripts/smoke-live.mjs --live --calls 12
//
// Options: --live, --calls N (total requests incl. the model-list call;
// hard cap 20), --max-tokens N (ceiling 1024), --show-replies (print a short
// preview of each reply that passed validation; off by default, so the default
// output is counts, timings and token usage only), --skip-model-list (send
// completions without verifying ids; by default an unreadable model list stops
// the run before any completion).
// The key is read only from NEBIUS_API_KEY and is redacted from all output.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const { runSmoke, HARD_MAX_CALLS } = await import(join(here, '..', 'lib', 'smokeCore.js'));

const args = process.argv.slice(2);
const live = args.includes('--live');
const showReplies = args.includes('--show-replies');
const skipModelList = args.includes('--skip-model-list');

function numberFlag(name) {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  const value = Number(args[index + 1]);
  if (!Number.isInteger(value) || value < 1) {
    console.error(name + ' needs a positive integer.');
    process.exit(2);
  }
  return value;
}

const maxCalls = numberFlag('--calls');
const maxTokens = numberFlag('--max-tokens');

if (live) {
  if (process.env.SMOKE_CONFIRM !== 'yes-make-live-calls') {
    console.error('Refusing to run live: set SMOKE_CONFIRM=yes-make-live-calls to confirm you approve live calls.');
    process.exit(2);
  }
  if (!process.env.NEBIUS_API_KEY) {
    console.error('Refusing to run live: NEBIUS_API_KEY is not set in the environment.');
    process.exit(2);
  }
}

try {
  await runSmoke({
    live,
    apiKey: process.env.NEBIUS_API_KEY,
    fetchImpl: live ? fetch : undefined,
    maxCalls: maxCalls === undefined ? undefined : Math.min(maxCalls, HARD_MAX_CALLS),
    maxTokens,
    showReplies,
    skipModelList,
    emit: (line) => console.log(line)
  });
} catch (error) {
  console.error('Smoke test failed: ' + (error instanceof Error ? error.message : 'unknown error'));
  process.exit(1);
}
