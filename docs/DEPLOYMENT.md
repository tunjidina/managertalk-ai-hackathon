# Deployment notes: build step, live mode and limits

Nothing in this repository has been deployed. These notes describe how the
configuration behaves when you deploy it yourself.

## Build before deploy
`firebase.json` runs a predeploy hook for the functions codebase:

```json
"predeploy": ["npm --prefix \"$RESOURCE_DIR\" run build"]
```

- Firebase runs the command from the project root, with `$RESOURCE_DIR` set to
  the functions source directory (`functions`).
- `npm run build` in `functions/` runs `sync-shared` (copies the shared client
  files into `functions/src/shared/`) and then `tsc`, writing `functions/lib/`.
- The deploy uploads whatever is in `functions/lib`, so without this hook a
  deploy could ship stale or missing compiled code. `deployConfig.test.ts`
  checks the hook, the build script and the entry point.
- Verified here by deleting `functions/lib` and `functions/src/shared` and
  running the same command with `RESOURCE_DIR` set; both were regenerated. The
  Firebase CLI itself was not run.

## Live mode is off by default
The function answers from the labelled mock model unless **all** of these hold:

| Setting | Where | Value |
|---|---|---|
| `S02_ENGINE_MODE` | function parameter (default `mock`) | exactly `live` |
| `NEBIUS_API_KEY` | Secret Manager secret bound to `s02Turn` | present, no whitespace |
| `NEBIUS_MODEL` | parameter, default `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | a listed model id |

A bad key shape, a bad model id or invalid caps fall back to the mock rather than
failing the request. The key is read only inside `index.ts` and passed to nothing
but the live client.

Deploying needs the secret to exist, even in mock mode:
`firebase functions:secrets:set NEBIUS_API_KEY` (you run this; the key is never
pasted into chat or a file in the repository).

The model id above is unverified against the live model list; run the smoke test
first (see below).

## Daily limits
Live mode is metered by Firestore counters (`usageCounters`, written only by the
function):

- `S02_USER_DAILY_CAP` (default 40) and `S02_GLOBAL_DAILY_CAP` (default 300),
  counted per UTC day, charged together or not at all. A cap of 0 switches live
  calls off.
- Over a cap the function returns 429 with `X-ManagerTalk-Limit: daily-user` or
  `daily-global`. The client shows a distinct label and continues with scripted
  replies. A 429 relayed from the model provider has no such header and is shown
  as "busy".
- If the counters cannot be read, the function fails closed (503) and the client
  falls back to scripted replies.

## Scripted fallback and labels
Every failure path ends in the scripted engine. Each scripted reply shows a
"Scripted" badge and a sentence naming the reason, if any. The "Live" badge
appears only for a validated reply from the endpoint.

## Smoke test (not run)
`functions/scripts/smoke-live.mjs` is a dry run by default. A live run needs
`--live`, `SMOKE_CONFIRM=yes-make-live-calls` and `NEBIUS_API_KEY` in your own
environment, makes at most 20 requests, checks the model list first, and redacts
the key from all output. It requires the Nebius host to be reachable.
