# Demo on Cloudflare Workers (manual steps)

**Current status (30 Oct 2026):** deployed as the Worker `managertalk-demo` on workers.dev with Wrangler 4.154.0, in live mode, against the demo Firebase project `managertalk-hackathon-demo`, with the `LIMITER` Durable Object and the `NEBIUS_API_KEY` secret bound. Observed on the deployed Worker: an unauthenticated request gets 401; an authenticated request is verified against real Firebase ID tokens and Google's signing keys; the Durable Object limiter is called on each valid turn; and live turns have returned HTTP 200 with a model reply from Nebius Token Factory. Failures observed along the way are listed under "Lessons from the first live deployment" below. Items still unconfirmed are under "Still unverified".

**Historical status (before the first deployment):** implemented, unit tested, and run locally with Wrangler 4.154.0: `wrangler deploy --dry-run` bundled it, and `wrangler dev --local` started it, served the built app, and rejected unauthenticated, malformed and oversized requests to `/api/s02/turn`. It had not been deployed or run against real Firebase tokens, real Google signing keys, a live Durable Object request or Nebius, and free-plan limits were unverified. The sections below that describe those gaps are kept as the record of what was unconfirmed at that time.

## What it is
One Worker (entry `functions/src/worker/index.ts`, logic in `functions/src/worker/app.ts`, configured by `wrangler.toml`) serves the built React app and `POST /api/s02/turn` from one origin, so the browser needs no CORS and the client is unchanged. Firebase Authentication and Firestore stay as they are, on a Spark project.

The turn logic is the same `handleTurn` the Firebase function uses. Only the edges differ:

| Concern | Firebase function | Worker |
|---|---|---|
| ID token check | Admin SDK | `jose` against Google's published keys (`firebaseToken.ts`): RS256 only; issuer, audience, expiry, issued-at, subject and `auth_time` checked; no revocation check (same as before); a missing project id rejects everything |
| Daily caps | Firestore transaction | one SQLite Durable Object, all-or-nothing, synchronous (`dailyLimiter.ts`) |
| Secret | Secret Manager | `wrangler secret put NEBIUS_API_KEY` |
| Logs | allow-listed entry | the same allow-listed entry as one JSON console line; observability is off in `wrangler.toml` |

Mock mode is the default. Live mode needs `S02_ENGINE_MODE=live`, the secret, and the `LIMITER` binding; if any is missing, or a cap is not plain digits, the Worker answers from the labelled mock and calls nothing.

## Manual steps (owner)
1. Create a free Cloudflare account. [VERIFY whether a card is asked for.]
2. Create a **separate** demo Firebase project on the Spark plan: Authentication (email/password and/or Google) and Firestore with `firestore.rules` published. Do not use the production project.
3. Build the client with that project's six `REACT_APP_FIREBASE_*` values, `REACT_APP_S02_ENGINE_ENDPOINT=/api/s02/turn` and `REACT_APP_DEMO_MODE=true` (RevenueCat key empty): `npm run build`.
4. `npm --prefix functions run sync-shared` (the Worker imports the generated `functions/src/shared/` files).
5. Set `FIREBASE_PROJECT_ID` in `wrangler.toml` to the demo project's id.
6. `npx wrangler@<VERSION> deploy` (see "Wrangler version" below; wrangler bundles the TypeScript and `jose`). Note the `*.workers.dev` host.
7. Add that host to the demo Firebase project's Authentication authorised domains.
8. Check in the browser: sign in, take a turn, see the `Mock · no AI model called` chip.
9. Only after Gate A and the owner's approval: `npx wrangler@<VERSION> secret put NEBIUS_API_KEY`, set `S02_ENGINE_MODE = "live"`, redeploy, take one turn, look for the `Live` chip.

## Wrangler version
Wrangler is deliberately not a dependency of this repository; it is fetched on demand by `npx`. Version 4.154.0 is the one tested so far. Do not run a bare `npx wrangler`, which fetches whatever is newest on the day. Instead:
1. Pick one exact Wrangler release (check the current stable one yourself) and use it everywhere as `npx wrangler@<VERSION> ...`.
2. Before the first deploy, run `npx wrangler@<VERSION> deploy --dry-run --outdir <empty folder>` after steps 3 and 4. It bundles without deploying; confirm the flag against that version's help.
3. Record the version that worked here, in this line, and keep using it: `Tested Wrangler version: 4.154.0` (dry-run bundle and `wrangler dev --local` on Linux, Node 22; not yet tried on Windows).

## Entry point rule
Wrangler and the Workers runtime treat every export of the entry module as a handler or a Durable Object class. `index.ts` therefore exports only the default handler and `DailyLimiter`; testable helpers (`createWorker`, `parseCap`) are in `app.ts`. Exporting anything else makes `wrangler dev` fail with "Incorrect type for map entry". `entry.test.ts` guards this.

## Lessons from the first live deployment
Two things that worked in Node and in the unit tests (which use a fake `fetch`) failed in the real Workers runtime, both as an instant HTTP 502 `model_unavailable` before any request reached Nebius. Each now has a regression test.
- **`redirect: 'error'` is rejected by the Workers runtime.** The Nebius call uses `redirect: 'manual'` instead; a 3xx response is not `ok`, so it still fails and the key is never sent elsewhere.
- **`fetch` must be called as a plain function.** Calling it as `config.fetchImpl(...)` gives it the config object as `this`, which Workers reject ("Illegal invocation"). The client copies it to a local variable first.
- **Failure diagnostics, log-only.** A failed model call now logs `upstream` (`http_<status>` or `fetch_<ErrorName>`, never the message) and, for a refused reply, `reason` (an allow-listed code). Neither reaches the browser. This is how the two causes above were found. Use `wrangler tail <worker> --format json` to read them.
- **Provider behaviour seen:** Nebius returned HTTP 529 on one turn (shown to the user as a scripted fallback), and one reply was refused by the reply validator for a reason that was not logged at the time.

## Resolved since the first version of this document
- Wrangler 4.154.0 deployed this configuration (`compatibility_date = "2026-10-01"`, the `[assets]`/`ASSETS` binding, the `LIMITER` Durable Object with a `new_sqlite_classes` migration) on the Cloudflare account used for the demo.
- `jose`'s remote key set works inside the Worker against Google's signing keys: valid Firebase ID tokens are accepted and bad or missing tokens get 401.
- The limiter Durable Object receives a request per valid turn (seen in the Worker's logs).
- Live inference through Nebius Token Factory has returned a validated reply with the configured Nano model id (`nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`).

## Still unverified
- That the free plan's limits (daily requests, CPU time per request, Durable Object requests and storage) hold under judging traffic. Only light manual use has been observed.
- Whether the Cloudflare plan in use is the free plan; this was not checked.
- That a request over the body limit is rejected cheaply (tested locally with fake streams only).
- Credits and data retention on the Nebius side (see `docs/GATE_A_READINESS.md`).
- Whether adding the workers.dev host to the Firebase authorised domains was needed: email/password sign-in works there, but Google sign-in on the deployed host was not tested.

## What the local tests do and do not show
Tested (Node, no network): valid and invalid tokens, key-set failure, project-id failure, limiter caps and rollback on a real SQLite database, routing, request validation, mock mode without a key or network, live mode with a fake model, key never in responses or logs. Also verified locally with Wrangler 4.154.0 (Linux, Node 22): the dry-run bundle succeeds, and `wrangler dev --local` starts the Worker, serves the built app, and rejects unauthenticated, malformed, wrong-content-type, oversized and wrong-method requests to `/api/s02/turn`. Not verified: real Firebase tokens and Google signing-key retrieval (the local run rejected a malformed token before any key fetch), a real Durable Object limiter request, CPU limits, live Nebius inference, and deployment.
