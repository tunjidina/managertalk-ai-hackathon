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
// the run before any completion), --variant NAME (run only that variant, e.g.
// nano-thinking-off; an unknown name stops before any request; the default
// budget then becomes 2: the model-list call plus one completion).
// The key is read only from NEBIUS_API_KEY and is redacted from all output.

// The compiled core is loaded by URL, not by file path. A dynamic import()
// takes a URL or a relative specifier, and a Windows absolute path such as
// C:\\repo\\functions\\lib\\smokeCore.js is read as a URL whose scheme is "c:",
// which fails with ERR_UNSUPPORTED_ESM_URL_SCHEME. Resolving against
// import.meta.url yields a file: URL on every platform, and also handles
// spaces and non-ASCII characters in the path.
const coreUrl = new URL('../lib/smokeCore.js', import.meta.url).href;

let core;
try {
  core = await import(coreUrl);
} catch (error) {
  if (error && error.code === 'ERR_MODULE_NOT_FOUND') {
    console.error('The build output is missing or incomplete: run "npm run build" in functions/ first.');
    // Name the file Node could not find (a path only; never a key or a reply),
    // so a genuinely missing build can be told apart from a loader problem.
    console.error('Details: ' + String(error.message).split('\n')[0]);
    process.exit(1);
  }
  throw error;
}
const { runSmoke, HARD_MAX_CALLS } = core;

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

let variantName;
const variantIndex = args.indexOf('--variant');
if (variantIndex !== -1) {
  variantName = args[variantIndex + 1];
  if (!variantName || variantName.startsWith('--')) {
    console.error('--variant needs a variant name.');
    process.exit(2);
  }
}

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
    variantName,
    emit: (line) => console.log(line)
  });
} catch (error) {
  console.error('Smoke test failed: ' + (error instanceof Error ? error.message : 'unknown error'));
  process.exit(1);
}
