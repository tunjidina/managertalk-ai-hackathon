# Verification record

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

## What this does NOT verify
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
