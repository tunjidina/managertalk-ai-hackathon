# Gate A readiness: what is verified and what is not

Status: no network request has been made to Nebius or any inference provider,
no key exists in this environment, and the live smoke test has not been run.
Everything below marked "documentation" comes from search results of the
official pages named in the Sources list, not from calling the API. Nothing
here claims a model is available or has answered.

## Candidate model IDs in the repository
| Role | ID in code | Where |
|---|---|---|
| Default (Nano) | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | `functions/src/nebiusModel.ts`, test fixtures |
| Candidate (Super) | `nvidia/nemotron-3-super-120b-a12b` | `functions/src/nebiusModel.ts`, test fixtures |

## Verified (from documentation) versus unresolved
| Question | Status | Evidence or gap |
|---|---|---|
| Endpoint | Documented | `POST https://api.tokenfactory.nebius.com/v1/chat/completions`, bearer key, OpenAI-compatible. Not exercised. |
| Nano exact ID and casing | **Unresolved** | Three spellings appear: `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` (our default, Hugging Face style), `nvidia/nvidia-nemotron-3-nano-30b-a3b` (Nebius cookbook), `NVIDIA/Nemotron-3-Nano-30B-A3B` (Token Factory endpoints page). Only `GET /v1/models` can settle it. |
| Super exact ID | Documented, consistent | `nvidia/nemotron-3-super-120b-a12b` in the Nebius catalogue and launch post. Casing still to confirm live. |
| Available on Token Factory | **Unverified** | Nebius pages list both models; availability for this account is unknown until the model list is read with a real key. |
| Context length | Conflicting | Nano 262K per Nebius model page. Super: 256K versus up to 1M in different sources. Not needed for our ~2k-token prompts. |
| Max output tokens | **Unknown** | No Nebius cap found. Our client clamps `max_tokens` to 1,024. |
| Request parameters | Partly documented | `max_tokens` and `max_completion_tokens` both appear in the reference example; `temperature`, `top_p` follow the OpenAI schema; `top_k` and `extra_body` are documented. Whether Nemotron honours `top_p`, or which of the two token parameters is preferred, is unverified. The client sends `max_tokens`, `temperature`, `top_p`. |
| Reasoning control | **Unverified** | NVIDIA's card says reasoning is on by default and switchable through the chat template (`enable_thinking`). Whether Token Factory forwards it is unknown, so the product client does not send it; the smoke test tries it as an experimental variant. A community report says truncated reasoning replies return `content: null` with text under `reasoning`; the client treats empty content as failure. |
| Price | Documented, inconsistent | Nano about $0.06 in / $0.24 out per million tokens; Super about $0.30 / $0.90. One Nebius page shows a different headline price for Nano. |
| Rate limits | Documented, inconsistent | Pages disagree (60 versus 600 RPM; 400K TPM). 429 with `Retry-After`. |
| Licence | Super: documented. Nano: not confirmed from its own card | NVIDIA's NIM documentation lists Super under the **NVIDIA Nemotron Open Model License** (page last modified 2025-12-15): perpetual, worldwide, royalty-free; commercial use and derivative works permitted; NVIDIA claims no ownership of outputs; attribution, liability-disclaimer and indemnification clauses apply. For Nano, only a third-party article and NGC "governing terms" pages say the Nemotron 3 models use this licence; the Nano model card's own licence field was not retrieved. Some NGC pages call it the "NVIDIA Open Model License Agreement", and the relation between the two versions was not confirmed. |
| Satisfies the hackathon's "NVIDIA open source model" requirement | **Not confirmed** | See the next section. |

## Hackathon wording: what is explicit and what is not
Explicit (Devpost's own announcement post, seen in search results, and consistent secondary summaries): "All submissions must run on either Nebius Token Factory or Nebius AI Cloud and use at least one NVIDIA open source model." Summaries of the rules add that "running on Nebius" means a runtime call to the Token Factory inference API (or Nebius AI Cloud compute), and that reaching NVIDIA models only through a third party such as Hugging Face or OpenRouter does not satisfy it. Secondary summaries name Nemotron as the example model.

Not stated in anything retrieved:
- What "open source" means: an OSI-approved licence, or open weights under a permissive custom licence.
- Whether the NVIDIA Nemotron Open Model License, which is a custom open-weights licence and not OSI-approved, meets that wording.
- Whether Nemotron 3 Nano and Super specifically are listed as qualifying.
- The official rules text itself: the Devpost rules page and Nebius's hackathon page were not retrieved.

Circumstantial support (not a ruling): NVIDIA calls the Nemotron family open models and its licence "permissive"; Nebius lists these models on Token Factory for this event; the hackathon material names Nemotron as its example. Treat eligibility as **unconfirmed** until you have read the official rules or an organiser has confirmed it.

## What the smoke test will and will not do
- Default run is a dry run: it prints the plan and makes no request, with or without a key.
- A live run needs `--live`, `SMOKE_CONFIRM=yes-make-live-calls` and `NEBIUS_API_KEY` in the environment; at most 20 requests.
- It reads the model list first, with a timeout. If the list cannot be read (any error, timeout or unreadable body), **no completions are sent**; `--skip-model-list` is the explicit opt-in to test unverified ids. A 401/403 on the list stops the run and says to check the key.
- Only listed ids get completions. A case difference or the documented Nano alias is resolved to the listed spelling and reported. If no candidate is listed, nothing more is sent.
- Output is counts, timings, token usage, statuses, and per variant a tally of outcomes (valid, empty, truncated and so on), finish reasons and how many replies reached `max_tokens`. The key is redacted from every line. Raw bodies and reasoning are never printed. Reply text is hidden by default; `--show-replies` prints a short preview of replies that passed validation.
- The "super-thinking-off" variant sends an unverified `chat_template_kwargs` field. If the platform ignores it, that variant will look the same as the default; compare reasoning fields and completion tokens rather than assuming it worked.
- Recommended for the first run: `--max-tokens 1024`. At the default 600, a reasoning model can spend the whole budget thinking and return empty content, which would look like a broken model when it is only a small budget.

## Sources (search results; not fetched directly)
- Nebius Token Factory quickstart and API reference: https://docs.tokenfactory.nebius.com/quickstart, https://docs.tokenfactory.nebius.com/api-reference/inference/create-chat-completion
- Nebius Nemotron pages: https://nebius.com/services/token-factory/nemotron, https://nebius.com/blog/posts/nemotron3-super-now-available
- Nebius cookbook (Nano): https://github.com/nebius/token-factory-cookbook/blob/main/models/nemotron/nemotron3-nano-30b.md
- Reasoning-field report: https://github.com/nebius/token-factory-cookbook/issues/74
- NVIDIA Nemotron Open Model License: https://www.nvidia.com/en-us/agreements/enterprise-software/nvidia-nemotron-open-model-license
- Nebius x NVIDIA hackathon pages (rules not retrieved verbatim): https://nebiusglobalaihackathon.devpost.com/rules, https://nebius.com/events/nebius-nvidia-ai-builders-hackathon

## To authorise the first controlled live test
1. Create the Token Factory key yourself and keep it out of chat and the repository.
2. Commit the current changes locally first (recommended), so the run can be tied to an exact commit hash.
3. Choose where it runs: (a) your own machine, which needs the branch pushed or the folder copied, then
   `cd functions && npm ci && npm run build && NEBIUS_API_KEY=... SMOKE_CONFIRM=yes-make-live-calls node scripts/smoke-live.mjs --live --calls 8 --max-tokens 1024`;
   or (b) this cloud environment, after you add `api.tokenfactory.nebius.com` to its allowed domains and store the key as `NEBIUS_API_KEY` in the environment settings, then start a new session.
4. Reply with an explicit authorisation, for example: "I authorise one live smoke test at commit <hash>: at most 8 requests, max_tokens 1024, Nano and Super only, replies hidden, no deployment."

Cost: eight requests is one model-list call plus seven completions. At the catalogue prices above and the prompt size measured from the blueprint (about 2,000 input tokens), the worst case is roughly one US cent in total. That is an estimate from unverified prices.
