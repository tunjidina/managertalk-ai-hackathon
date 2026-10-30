# Verification record

This file has two parts. **"Current verification (30 Oct 2026)"** at the end is the up-to-date state. Everything before it is the **historical record** of commit `f4a6336`, kept unchanged so the evidence trail is not rewritten; its statements, including "Nothing is deployed" and "No request has been made to Nebius", were true at that commit and are no longer current.

## Historical record (commit f4a6336)

Commit: `f4a633675372000ac4cacf8cb692eb92f55e3e07` on `claude/friendly-heisenberg-32besp`
(repository `tunjidina/managertalk-ai-hackathon`).

Two environments produced evidence. They are kept apart on purpose:

- **Windows 11, Node.js v22.20.0**: run locally by the project owner. Reported to
  the assistant as evidence; the assistant did not run anything on Windows.
- **Cloud container (Linux, Node.js v22.22.0)**: run by the assistant on the same
  commit.

## Results
| Check | Windows (owner's local run) | Cloud container (assistant's run) |
|---|---|---|
| Backend (functions) TypeScript build | passed | passed |
| Backend tests | 239 passed, 0 failed | 239 passed, 0 failed |
| Client typecheck | not reported | clean |
| Client tests | 297 passed, 8 suites | 297 passed, 8 suites |
| Production client build | passed; main JS 512.43 kB gzip | passed; main JS 512.43 kB gzip |
| Smoke-script path tests (spaces, non-ASCII, both) | passed | passed |
| Dependency audit, `functions/` | 0 vulnerabilities | 0 vulnerabilities (266 packages) |
| Dependency audit, root/client | 114 (3 low, 38 moderate, 71 high, 2 critical) | 114 (same breakdown) |
| Live Nebius calls, deployment, push | none occurred | none occurred |

## Windows-specific finding (owner's run)
The earlier failure of the accented-path copy tests was in the test fixture, not the
smoke script. The platform diagnostic recorded that `fs.cpSync` into an accented
destination returned without error and copied nothing on that Windows environment.
The fixture now copies with `mkdirSync`, `readdirSync` and `copyFileSync`, and the
copied-directory tests pass on Windows for paths with spaces, non-ASCII characters
and both. This was not reproducible in the cloud container, where `cpSync` copies
correctly.

## What this did NOT verify (at commit f4a6336)
- **Live model inference.** No request has been made to Nebius Token Factory by
  anyone. No Nemotron model has been shown to be available, named correctly, or
  able to produce a reply. Model IDs, request parameters and limits are
  documentation-derived and unverified.
- **The live smoke test.** It has never been run; only its dry run and refusal paths.
- **Firebase deployment or the hosted app.** Nothing is deployed. No hosted
  end-to-end run, judge sign-in flow or Firestore rate-limit behaviour against
  real Firestore has been tested.
- **The full user experience.** The scripted Tomás dialogue and labels are tested
  in unit tests; the screens have not been exercised in a browser against a real
  backend. The roleplay chat redesign, coaching report and retry flow described in
  `docs/DESIGN_SPEC.md` are not built.
- **Hackathon eligibility.** Whether the Nemotron licence satisfies the
  "NVIDIA open source model" wording is unconfirmed (see `docs/GATE_A_READINESS.md`).
- **Root dependency vulnerabilities.** They are reported, not remediated (see
  `docs/DEPENDENCY_AUDIT.md`).

## Current verification (30 Oct 2026)
Branch `integration/hackathon-p0-p2`. Evidence is kept apart by source.

**Run on the project owner's Windows machine by the assistant, on a clean `npm ci` of this branch**
| Check | Result |
|---|---|
| Client tests | 472 passed, 24 suites |
| Backend (functions) tests | 323 passed |
| Client typecheck (`tsc --noEmit`) | clean |
| Production client build | passed |
| Secret-pattern scan of the working tree and every commit | no matches |

**Observed on the deployed demo (Worker `managertalk-demo`, Firebase project `managertalk-hackathon-demo`)**
- Source of each item is stated; "owner-reported" means the owner saw it in their browser and told the assistant.
- An unauthenticated request to `/api/s02/turn` returns 401 (assistant, direct request).
- Real Firebase ID tokens are accepted, and the daily-limit Durable Object is called on valid turns (assistant, from the Worker's own log stream).
- Live turns through Nebius Token Factory with `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` returned HTTP 200 with a validated reply (assistant, log stream; owner-reported chip and reply text).
- Failures seen and handled by the labelled scripted fallback: an instant 502 caused by two Cloudflare Workers incompatibilities (fixed, with regression tests), one HTTP 529 from Nebius, and one reply refused by the reply validator for an unlogged reason (see `docs/CLOUDFLARE_DEPLOYMENT.md`).
- The deployed frontend bundle contains the rubric `mt-s02-rules-v1`, the assessment-record code and the My progress screen (assistant, from the served file). Firestore rules for `assessmentRecords` were released to the demo project.

**Still NOT verified**
- **Assessment persistence and My progress against the live database.** The rules were released, but a completed run being saved, and the dashboard reading it back, have not been confirmed live. The rules have only been checked as text by a test; they have not run in the Firestore emulator.
- **The assessment is rule-based.** It has not been validated against expert judgement; it is not an AI assessment and is not claimed to measure real-world skill.
- **Reproducibility of the deployed bundle name.** Rebuilding in another folder gives a different `main.*.js` filename because Create React App derives CSS-module class-name hashes from the project path. A comparison showed the code is otherwise equivalent.
- **Free-plan limits and judging load**, Google sign-in on the deployed host, credits and data retention, and hackathon eligibility wording (see `docs/GATE_A_READINESS.md`).
- **Root dependency vulnerabilities** are reported, not remediated (see `docs/DEPENDENCY_AUDIT.md`).
