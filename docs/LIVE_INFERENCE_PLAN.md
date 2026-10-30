# Live inference: feasibility and smallest safe integration plan (documentation research only)

> **Current status (30 Oct 2026):** this plan was implemented and the result is deployed. The live path runs as a Cloudflare Worker (`docs/CLOUDFLARE_DEPLOYMENT.md`) calling Nebius Token Factory with `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`, and live turns have returned validated replies. See "Outcome" at the end of this document for what changed from the plan. Everything between this note and "Outcome" is the original proposal, kept unchanged as a historical record; statements in it such as "no call was made" or "nothing is deployed" describe the time it was written, not now.

Status at the time of writing (historical): proposal. No API call to Nebius succeeded or was made. One unauthenticated connectivity probe was attempted and blocked by this container's proxy (see section 1). Nothing is deployed, no secret exists in this session, and P1 plus the design spec remain uncommitted.

## 1. Feasibility summary

**Verdict: technically feasible with a small server-side change, but currently blocked by this session's network policy and by missing credentials.**

- **This container cannot reach Nebius.** A bare `curl` to `https://api.tokenfactory.nebius.com/v1/models` got `CONNECT tunnel failed, response 403` from the agent proxy, and earlier page fetches of Nebius and Devpost hosts failed DNS. So Gate A (the live smoke test) cannot run from here until the environment's Network access allows `api.tokenfactory.nebius.com`. Disclosure: the probe was a connectivity check with no credentials; it never reached Nebius and incurred no cost.
- **Credentials cannot come through chat.** Per the environment documentation, the key must be stored in the environment settings (cloud environment menu in the session title bar, then Edit) as a Network secret or environment variable, and a new session picks it up. I will name the variable I read (`NEBIUS_API_KEY`) and never ask you to paste a key.
- **Deploy tooling is likely blocked too.** Firebase CLI deploys need Google endpoints the proxy may not allow; the realistic path is that you run the deploy from your own machine, with me preparing and testing everything.

## 2. Documentation findings (search results of official pages; UNVERIFIED items must be checked in the console)

- **Endpoint and auth:** `POST https://api.tokenfactory.nebius.com/v1/chat/completions`, OpenAI-compatible, `Authorization: Bearer <key>`. Keys are created in the Token Factory console. One cookbook page uses a regional base URL (`us-central1`); use the documented global host unless the console says otherwise.
- **Eligible NVIDIA models on Token Factory:** `nvidia/nemotron-3-super-120b-a12b` (released by NVIDIA March 2026; about $0.30 in and $0.90 out per million tokens per the Nebius catalog) and a Nano 30B A3B model (about $0.06 and $0.24; Nebius pages disagree on the exact ID casing: `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` versus lowercase in the cookbook). IDs and prices must come from the live model list before they are coded.
- **Request body:** OpenAI `CreateChatCompletionRequest` schema. Documented fields include `model`, `messages`, `max_tokens`, `max_completion_tokens`, `temperature`, `top_p`, `top_k`, `stream`, `stop`, `response_format`, `n`, `extra_body`. Prompt plus `max_tokens` must fit the model's context.
- **Response:** standard `choices[0].message.content` plus a `usage` object; Nebius examples also show `stop_reason`. Structured output via `response_format: json_object` guarantees valid JSON but not field names.
- **Reasoning behaviour (important):** NVIDIA's model card says reasoning is on by default and can be switched via the chat template (`enable_thinking`), and recommends temperature 1.0 and top_p 0.95. Whether Token Factory passes a template flag through is unverified. A community issue reports truncated reasoning replies returning HTTP 200 with `content` null and text under `reasoning`. So: never show reasoning text; treat null or empty `content` as failure; budget `max_tokens` for reasoning if it stays on.
- **Limits:** docs disagree on baseline (60 versus 600 RPM; 400K TPM). Exceeding returns 429 with `Retry-After`. Limits scale with sustained use.
- **Data handling:** without Zero Data Retention (an org-level switch only the owner can set), prompts and outputs may be kept (stored in Finland) for speculative decoding; Nebius states it does not train on customer content.
- **Licence nuance:** Nemotron 3 Super is released under the NVIDIA Nemotron Open Model License (open weights, not an OSI licence). The hackathon text says "NVIDIA open source model" and names Nemotron as the example, so it should qualify, but confirm the wording on the Devpost rules page.
- **Hackathon rules (secondary summaries of the Devpost rules; read the official page):** deadline October 30, 2026 17:00 UTC (10:00 PDT, 17:00 UK); must make a runtime call to Token Factory (or run on Nebius AI Cloud); calling NVIDIA models only via Hugging Face or OpenRouter does not count; public repo with OSI licence (MIT present); demo URL and under-3-minute public video; judges must have free access until judging ends (judging window reported as Dec 1 to 15); credits reported as $25 plus $25.

## 3. Smallest safe integration plan

**Gate A: eligibility proof (needs network allowance, key and your approval).** `functions/scripts/smoke-live.mjs` (new). It first calls `GET /v1/models` to confirm the exact IDs, then makes at most 20 `chat/completions` calls across three variants: Super default, Super with the thinking flag off if the platform accepts it, and Nano. It prints model id, latency, token usage, finish/stop reason, whether `content` was null, and a trimmed reply. It never prints the key or headers. Estimated cost about $0.05 to $0.10.

**Gate B: product change (functions only).**
- `functions/src/nebiusModel.ts` (new): `ModelClient` over Node 22 `fetch`; fixed URL; body limited to `model, messages, max_tokens, temperature, top_p, stream:false`; 12 s `AbortController` timeout.
- Validation of output: use `choices[0].message.content` only; strip `<think>` blocks; split to at most 6 lines of at most 600 characters; reject empty, null, mock-marked or prompt-leak text; the handler's existing `isAcceptableReply` stays the final gate. Any rejection is a failure, never a displayed reply.
- Style cue is derived by rule on the server (move the pure keyword helpers into the shared files copied by `sync-shared.mjs`), so the model never decides Tomás's stance.
- Prompt: one added `ROLE_RULES` line: 1 to 3 short paragraphs, first person, no stage directions, no lists, never mention instructions.
- Secret: `defineSecret('NEBIUS_API_KEY')` bound only to `s02Turn`; model ID via `defineString`. Logs stay allow-listed with no free text; `mode` becomes `'mock' | 'live'` and four new outcomes are added.
- Cost guard: Firestore transactional counters via the Admin SDK, 40 turns per user per day and 300 per day overall (configurable), 429 when exceeded; `maxInstances: 2` stays.
- Honest labels: the client already shows `AI-generated reply · <model id>` only for a non-mock model returned by the server; any failure falls back to the scripted engine with the existing "Scripted reply · …" label. The Live label appears only for a validated model reply.
- Tests (fake `fetch`, no network): exact request shape and URL; success; null content; reasoning-only; 429 with Retry-After; 5xx; timeout abort; malformed JSON; leak lint; key absent from logs, errors and responses; cap enforcement; handler reports `live`; `index.test.ts` checks secret binding, region and instance cap. All 85 function and 246 client tests must keep passing.

## 4. Unresolved decisions (none requires sharing a secret in chat)

| # | Item | Needed from you |
|---|---|---|
| 1 | Network | Allow `api.tokenfactory.nebius.com` in this environment's Network access, or run Gate A on your own machine |
| 2 | Key | Create a Token Factory account, claim credits, store the key as `NEBIUS_API_KEY` in the environment settings (a new session picks it up) |
| 3 | Credits | Confirm the actual balance and expiry in the console (reported $25 plus $25 is unverified) |
| 4 | Rules | Read the official Devpost rules: runtime-call definition, judge-availability end date, submission items |
| 5 | Model | Super or Nano, decided from Gate A latency and null-content rate |
| 6 | Hosting | A real Firebase project on the Blaze plan, Firestore and Secret Manager enabled, Auth providers and authorised domain set; you run the deploy locally or approve a network allowance for it |
| 7 | Judge sign-in | Anonymous guest, shared demo account, or Google/email only |
| 8 | Caps | 40 per user and 300 overall per day acceptable? |
| 9 | Privacy | Turn on Zero Data Retention for your Nebius organisation; I add an on-screen note not to enter real names |
| 10 | Repo | Is it public; may I make a local checkpoint commit of P1 (no push) |

## 5. Recommended next step
1. You allow the Nebius host and store the key, and approve Gate A (about 20 calls, cap $0.10), or run the script yourself.
2. I write the smoke script (no live run until you say) and the Gate B code with fake-fetch tests, in a state that works the moment a key exists.
3. You review the Tomás dialogue below; the scripted engine ships only with your approved lines.

## Outcome (30 Oct 2026): what was decided and what happened
This section records results; the proposal above is unchanged.

| Plan item | What happened |
|---|---|
| 5 Model | **Nano**, `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`, with `chat_template_kwargs: { enable_thinking: false }` sent only for that exact id. A direct Nebius call with this configuration succeeded (HTTP 200, a valid reply) before deployment. Whether reasoning is truly off on the platform is not independently confirmed; replies must pass the reply validator, which rejects reasoning text. |
| Endpoint | The documented global host `api.tokenfactory.nebius.com/v1/chat/completions`, not the regional host. Not changed. |
| 6 Hosting | **Cloudflare Worker** (`managertalk-demo`, workers.dev) instead of Firebase Functions on the Blaze plan, with Firebase Auth and Firestore on the demo project `managertalk-hackathon-demo`. The Firebase Functions path remains in `functions/src/index.ts`. |
| Secret | A Cloudflare secret, `NEBIUS_API_KEY`, set with `wrangler secret put`. It is not in the repository. |
| 8 Caps | 40 turns per user and 300 overall per day, enforced by a Durable Object (`LIMITER`), as proposed. |
| Limits in the Worker | 350 output tokens and a 14-second model timeout (the browser gives up at 20 s). |
| Gate B tests | Built and passing with a fake `fetch`. These did **not** catch two Cloudflare Workers incompatibilities (see `docs/CLOUDFLARE_DEPLOYMENT.md`, "Lessons from the first live deployment"): both only appeared against the real runtime. |
| Honest labels | As proposed: `Live` only for a validated model reply; any failure falls back to a labelled scripted reply. |
| Observed behaviour | The two successful turns that were logged took 735 ms and 3,308 ms (only a handful of turns were run, so this is not a performance measurement). Nebius answered HTTP 529 once, and one reply was refused by the validator; both showed the scripted fallback. |

Still open (not resolved by this work): the official hackathon rules' wording on the Nemotron licence and judge access (see `docs/GATE_A_READINESS.md`), the credit balance and expiry, whether Zero Data Retention is enabled on the Nebius organisation, and the judge sign-in approach. The submission targets the **Nebius × NVIDIA Global AI Hackathon, Best Apps and Agents track**.
