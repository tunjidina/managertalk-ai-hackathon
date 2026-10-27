# Zero-cost demo on Cloudflare Workers (manual steps; nothing deployed)

Status: implemented and unit tested locally. **Not bundled, not run in a Workers runtime, not deployed.** The sandbox had no wrangler, no network and no Cloudflare account.

## What it is
One Worker (`functions/src/worker/index.ts`, configured by `wrangler.toml`) serves the built React app and `POST /api/s02/turn` from one origin, so the browser needs no CORS and the client is unchanged. Firebase Authentication and Firestore stay as they are, on a Spark project.

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
Wrangler is deliberately not a dependency of this repository and was not installed or run when this was written, so no version has been tested. Do not run a bare `npx wrangler`, which fetches whatever is newest on the day. Instead:
1. Pick one exact Wrangler release (check the current stable one yourself) and use it everywhere as `npx wrangler@<VERSION> ...`.
2. Before the first deploy, run `npx wrangler@<VERSION> deploy --dry-run --outdir <empty folder>` after steps 3 and 4. It bundles without deploying; confirm the flag against that version's help.
3. Record the version that worked here, in this line, and keep using it: `Tested Wrangler version: [OWNER: not yet recorded]`.

## Unverified (confirm before relying on them)
- That wrangler accepts `compatibility_date = "2026-10-01"` and the `[assets]` / `ASSETS` binding as written.
- That SQLite-backed Durable Objects, `transactionSync` and `state.storage.sql` are available on the free plan with the shapes used here.
- Free-plan limits: daily requests, CPU time per request (RS256 verification, JSON parsing and reply validation are small but unmeasured), Durable Object requests and storage.
- That `jose`'s remote key set (`createRemoteJWKSet`) works inside a Worker and that Google's key URL in `firebaseToken.ts` is current.
- That a request over the body limit is rejected cheaply (it is tested locally with fake streams only).
- Hackathon eligibility of this architecture, the model ID and casing, credits and data retention (see `docs/GATE_A_READINESS.md`).

## What the local tests do and do not show
Tested (Node, no network): valid and invalid tokens, key-set failure, project-id failure, limiter caps and rollback on a real SQLite database, routing, request validation, mock mode without a key or network, live mode with a fake model, key never in responses or logs. Not tested: the Workers runtime, bundling, real Google keys, real Durable Object behaviour, CPU time, any live Nebius call.
