# ManagerTalk — Difficult Conversation Coach

> A scenario-based coaching application that helps managers practice sensitive workplace conversations through structured, interactive simulations.

ManagerTalk provides a realistic, guided environment for developing **clarity, empathy, accountability, and communication skills** in challenging workplace situations.

**Who it is for:** line managers and team leads who want to rehearse a hard conversation, such as raising a performance concern or following up a silent team member, before having it with a real person.

**Hackathon submission:** built for the Nebius × NVIDIA Global AI Hackathon (Best Apps and Agents track). In MT-S02 the employee, Tomás, answers in character using an **NVIDIA Nemotron** model served through **Nebius Token Factory** and called from a **Cloudflare Worker**. The coaching assessment is **rule-based, not AI** (see [How MT-S02 is assessed](#how-mt-s02-is-assessed)).

**Demo:** https://managertalk-demo.tunjidina12.workers.dev. Create an account with an email address you can read. No demo credentials are provided.

---

##   Overview

ManagerTalk allows managers to practice difficult conversations in a safe, repeatable environment before having them in real life.

Each scenario follows a structured **7-step conversation model**, guiding the participant from understanding the situation through to commitments, closing, and feedback.

### Conversation Flow

```text
Scenario Overview
       ↓
Performance SBI
       ↓
Exploration
       ↓
Hypotheses
       ↓
Commitments
       ↓
Closing
       ↓
Scoring & Feedback
```

---

##   Features

*  Scenario-based difficult conversation simulations
*  Structured 7-step conversation framework
*  Branching conversation logic
*  Behaviour-focused coaching scenarios
*  Automatic scenario progress saving
*  Scenario progress restoration
*  Firebase Authentication
*  Firestore-backed profile persistence
*  Custom certificate name
*  Dynamic completion certificates
*  Scoring and feedback
*  Live in-character replies from NVIDIA Nemotron (Nebius Token Factory, via a Cloudflare Worker), with a labelled scripted fallback
*  Immutable per-attempt assessment records and a **My progress** view (rule-based, versioned rubric)
*  Resume or start over for an unfinished MT-S02 run
*  Responsive application experience

---

##   Included Scenarios

### MT-S01 — The Passed-Over Performer

A senior analyst expected a promotion but didn't receive it.

Following the decision, their performance has declined and trust between the employee and manager has become strained.

The manager must navigate the conversation while addressing:

* Performance concerns
* The employee's expectations
* Emotional impact
* Trust
* Accountability
* Future commitments

This scenario is designed to test the manager's ability to balance **empathy with accountability**.

---

### MT-S02 — The Defensive Engineer

You rehearse a conversation with **Tomás**, an engineer, across five stages enforced by a stage machine (a stage cannot be skipped):

1. **SBI**: name one observable behaviour and its impact.
2. **Exploration**: ask for his account before answering.
3. **Hypotheses**: hold several explanations open, including your own part.
4. **Commitments**: agree dated commitments for both of you.
5. **Closing**: set a dated follow-up and who starts it.

Tomás replies at each stage (see [Reply modes](#reply-modes-scripted-mock-and-live)). After the closing, the run is scored and you get feedback, and the result is saved to **My progress**.

---

#   The 7-Step Conversation Model

ManagerTalk uses a structured seven-stage conversation framework.

### 1. Scenario Overview

Provides the manager with the context and objectives for the conversation.

### 2. Performance SBI

Uses the **Situation → Behaviour → Impact** structure to establish clear, observable performance feedback.

### 3. Exploration

Encourages the manager to explore the employee's perspective rather than immediately jumping to conclusions.

### 4. Hypotheses

Allows the manager to consider possible explanations for the employee's behaviour or performance.

### 5. Commitments

Moves the conversation toward specific actions and expectations.

### 6. Closing

Summarises the discussion and establishes clarity around next steps.

### 7. Scoring & Feedback

Provides feedback on the conversation and highlights areas for improvement.

---

#   Architecture

## Tech Stack

| Technology              | Purpose                                 |
| ----------------------- | --------------------------------------- |
| React 19                | Frontend UI                             |
| TypeScript              | Type safety and application development |
| Zustand                 | Global application state                |
| Firebase Authentication | User authentication and sessions        |
| Firestore               | Profile, progress pointer and assessment records |
| Cloudflare Workers      | Serves the built app and `POST /api/s02/turn`; verifies the Firebase ID token and calls the model |
| Nebius Token Factory    | Hosts the model (OpenAI-compatible chat completions) |
| NVIDIA Nemotron 3 Nano  | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`, reasoning disabled |
| Create React App        | Development environment                 |

---

## Key Architectural Decisions

### Screen State Navigation

ManagerTalk does not use React Router.

Instead, navigation is controlled through a lightweight **screen state machine**.

This keeps the application's navigation model simple because the application follows a relatively controlled workflow.

---

### Scenario Progress Autosave

Scenario progress is automatically persisted so that users can leave and return to a scenario without losing their progress.

The application restores saved progress when the scenario is reopened.

---

### Firebase Authentication

Firebase Authentication is responsible for the user's authentication identity and session management.

Authentication identity is intentionally kept separate from the user's certificate identity.

---

### Firestore Profile Persistence

User-specific profile information is stored in Firestore.

For example:

```text
users/{uid}.certificateName
```

The certificate name is loaded before the application renders the relevant user experience.

---

#   Profile & Certificate Name

Users can configure the name they want to appear on their completion certificate.

The selected certificate name is:

* Stored in Firestore
* Associated with the authenticated user's UID
* Hydrated when the application starts
* Used when generating certificates
* Preserved across devices and browsers

### Firestore Structure

```text
users/
  {uid}/
    certificateName: "User's Chosen Name"
```

If no certificate name has been configured, ManagerTalk falls back to:

```text
ManagerTalk Participant
```

---

#   Certificate of Completion

After successfully completing a scenario, the user receives a certificate of completion.

The certificate includes:

* Certificate name
* Scenario ID
* Completion date

The certificate is rendered directly within the application.

The certificate name is dynamically populated using the user's profile information.

---

#  AI-Assisted Development

* ManagerTalk was developed through an AI-assisted workflow that supported rapid iteration and refinement across 
both the product and development process, while all final architectural, engineering, and product 
decisions remained developer-controlled.
---

#   Getting Started

## Prerequisites

* Node.js 22 (the Cloud Functions in `functions/` target Node 22) and npm
* For the full local flow with sign-in and the conversation endpoint: the Firebase CLI, to run the Auth, Functions and Hosting emulators (ports 9099, 5001 and 5000, from `firebase.json`)
* For your own hosted copy: your own Firebase project with Authentication (email/password) and Firestore, and a Cloudflare account. The demo's public project id and URL appear in this README and `wrangler.toml`; no key or secret is included in the repository.

---

## Installation

```bash
npm install
npm --prefix functions install
```

---

## Environment Configuration

`.env.example` lists every variable with placeholders only, and says which file each block belongs in:

* Local emulator development: copy the emulator block to `.env.development.local` (gitignored). The Firebase project ID must start with `demo-`, so it cannot be a real cloud project.
* Real Firebase project: put your own six `REACT_APP_FIREBASE_*` values in `.env.local` (gitignored).
* `REACT_APP_REVENUECAT_WEB_BILLING_KEY` is left empty for the hackathon demo, which disables RevenueCat.
* `REACT_APP_DEMO_MODE=true` opens MT-S02 without a purchase. It is ignored if a RevenueCat key is set.

Every `REACT_APP_*` value is inlined into the public JavaScript bundle, so never put a secret in one. The Nebius API key is never a client variable (see below).

> Do not commit `.env` files or other sensitive configuration to source control.

---

## Run the Application

```bash
npm start
```

This serves the client in development mode. The `proxy` setting forwards `/api/s02/turn` to the Hosting emulator on `127.0.0.1:5000`, so start the Firebase emulators in a second terminal for the conversation endpoint. Without an endpoint the app uses the built-in scripted replies.

---

## Reply modes: scripted, mock and live

Every Tomás reply in MT-S02 is labelled with where it came from:

| Label | Meaning |
|---|---|
| `Scripted` / `Scripted reply · <reason>` | Authored, owner-approved text chosen by rules in the browser. No server and no model involved. The reason names the fallback cause, if any (timeout, sign-in unconfirmed, busy, unavailable, daily limit). |
| `Mock · no AI model called` | The server endpoint answered from its mock model. No AI model was called. |
| `Live` chip and `AI-generated reply · <model id>` | Shown only when the server returned a validated reply from a live model. |

Live mode is off by default. The server uses the mock unless `S02_ENGINE_MODE` is exactly `live` and a `NEBIUS_API_KEY` secret is bound to it. Any failure falls back to scripted replies, and the label says so. `docs/DEPLOYMENT.md` covers the Firebase Functions path (daily limits, smoke test); `docs/CLOUDFLARE_DEPLOYMENT.md` covers the Worker path used by the demo.

### Cloudflare Worker and Nebius (the deployed demo)

The demo runs as the Cloudflare Worker `managertalk-demo` (`wrangler.toml`, source in `functions/src/worker/`). It serves the built React app from the `ASSETS` binding and answers `POST /api/s02/turn`. For each request it:

1. verifies the caller's Firebase ID token for the project in `FIREBASE_PROJECT_ID` (`managertalk-hackathon-demo`);
2. validates the request body against a fixed schema (no client-supplied prompt text is accepted);
3. charges a daily cap through the `LIMITER` Durable Object (defaults: 40 turns per user and 300 in total per day);
4. calls Nebius Token Factory with `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`, `enable_thinking: false`, a 350-token limit and a 14-second timeout;
5. validates the model's text (no leaked instructions, no links, whole sentences, bounded length) and returns it with the model id the provider reported.

`wrangler.toml` records the deployed settings: `S02_ENGINE_MODE = "live"` and the demo Firebase project. The Nebius key is **not** in the repository; it is a Cloudflare secret (`npx wrangler@4.154.0 secret put NEBIUS_API_KEY`). Without it, or if the mode is not `live`, the Worker answers from the mock model and the screen says `Mock · no AI model called`.

**What a live reply is, and is not:** a `Live` chip with the model id means the Worker returned a validated reply from Nemotron. Replies are sometimes refused (the provider is busy or returns text that fails validation), and the app then shows a `Scripted reply` with the reason. The scripted text is authored, not generated.

**Deploy your own copy** (replace the project id in `wrangler.toml` and the six `REACT_APP_FIREBASE_*` values in `.env.production.local` with your own first):

```bash
firebase deploy --only firestore:rules --project <your-firebase-project>
npm ci && npm run build
npx wrangler@4.154.0 secret put NEBIUS_API_KEY   # prompts for the key; never put it in a file
npx wrangler@4.154.0 deploy
```

See `docs/VERIFICATION.md` for what has been verified and `docs/GATE_A_READINESS.md` for the open model and eligibility questions.

---

## How MT-S02 is assessed

**The score and feedback are rule-based. They are not an AI judgement.** After the closing stage, `src/engine/s02/scoringEngine.ts` checks the manager's text and entries against the scenario's rubric using keyword lists, counts (questions, list items, words), date and structure checks. The result is one of three tiers (excellent, adequate, poor) plus the individual rubric criteria met or missed. There is no numeric score. Different wording can be missed, and the feedback screen says so.

- **Rubric version `mt-s02-rules-v1`.** Every assessment records the version of the rules that produced it. Change a rule and the version changes, so results from different rule sets are never compared.
- **Boundary clarification fix.** The rules originally treated any mention of "promotion" or "rating" in the closing as reassurance, which marked down a closing that correctly said role, rating or promotion is *not* being decided (the blueprint asks for that). Reassurance is now judged sentence by sentence: a sentence that negates and frames a topic without assuring an outcome is not counted, while "don't worry", "your job is safe" or "this won't affect your rating" still are.
- **One immutable record per run.** Each attempt has its own run id. On completion the result is written once to `assessmentRecords/{uid}_{scenarioId}_{runId}` in a transaction, so a double click or retry cannot create a duplicate. The write is awaited and the feedback screen shows saving, saved, or "not saved · Retry"; starting a new run warns if the last result is unsaved.
- **My progress.** The scenario list has a **My progress** screen showing your latest tier, a comparison with your baseline (your first assessment under the current rubric version), the seven excellent criteria, development priorities, the checks the rules flagged, and your history. Assessments from another rubric version are listed as "Earlier rubric — not compared". It shows no score, percentage or AI-generated advice.

---

## Privacy and data handling

| Data | Where | Notes |
|---|---|---|
| Sign-in identity | Firebase Authentication | Email/password or Google |
| Certificate name | Firestore `users/{uid}` | You choose it |
| Progress pointer | Firestore `userScenarioState/{uid}_{scenarioId}` | The stage name only; no message text |
| Assessment record | Firestore `assessmentRecords` | Ids, rubric version, tier, 17 true/false criteria, feedback branch name, timestamp. **No messages, replies, commitments or quotations.** Create-only: not editable or deletable by the user |
| Usage events | Firestore `scenarioAnalytics` | Event names and steps; no message text |
| Your messages in MT-S02 | Held in the browser while you practise | Not saved to the database |

In live mode, the message you send at a stage, together with earlier turns of the same run, is sent through the Worker to Nebius Token Factory to generate Tomás's reply. The Worker's logs record only the status, an outcome code, latency and a sanitised failure code (an HTTP status or an error type name); never message text, tokens or keys. Firestore rules (`firestore.rules`) restrict every collection to its owner. Because scoring runs in the browser, a modified client could write a false assessment record; records are for the user's own progress view, not for certification.

---

## Type Check

Run the TypeScript compiler without generating output:

```bash
npx tsc --noEmit
```

---

## Production Build

Create a production build:

```bash
npm run build
```

---

#   Firebase Setup

ManagerTalk uses Firebase for authentication and profile persistence.

The application requires:

### Firebase Authentication

Used for:

* User authentication
* Session management
* User identity

### Firestore

Used for:

* User profile persistence
* Certificate name storage
* User-specific application data

The Firebase configuration is supplied through environment variables.

---

#   Project Structure

```text
src/
├── components/
├── screens/
├── store/
├── lib/
└── assets/
```

### Key Files

| File                    | Responsibility                       |
| ----------------------- | ------------------------------------ |
| `AuthGate.tsx`          | Authentication and profile hydration |
| `ProfileScreen.tsx`     | Certificate name management          |
| `CertificateScreen.tsx` | Certificate rendering                |
| `scenarioProgress.ts`   | Scenario autosave and restore        |
| `navigationState.ts`    | Screen navigation state machine      |
| `userProfile.ts`        | Firestore profile operations         |
| `scoringEngine.ts` (`engine/s02/`) | MT-S02 rule-based scoring (rubric `mt-s02-rules-v1`) |
| `assessmentRecords.ts`  | Immutable per-run assessment records (write and read) |
| `ProgressScreen.tsx`    | My progress view                     |
| `functions/src/worker/` | Cloudflare Worker: auth, limits, Nebius call |

---

#   Application Flow

At a high level, the application follows this flow:

```text
User
 │
 ▼
Authentication
 │
 ▼
Profile Hydration
 │
 ▼
Scenario Selection
 │
 ▼
Scenario Introduction
 │
 ▼
7-Step Conversation
 │
 ├── Performance SBI
 ├── Exploration
 ├── Hypotheses
 ├── Commitments
 └── Closing
 │
 ▼
Scoring & Feedback
 │
 ▼
Certificate
```

---

#   Design Principles

ManagerTalk was designed around several principles:

### Practice Before Performance

Managers can rehearse difficult conversations without the consequences of a real workplace conversation.

### Structure

A consistent conversation framework helps users focus on specific communication behaviours.

### Repeatability

Scenarios can be practiced repeatedly, allowing users to refine their approach.

### Accountability + Empathy

The scenarios are designed to encourage managers to balance clear performance expectations with genuine exploration of the employee's perspective.

### Separation of Concerns

Authentication, profile persistence, scenario state, navigation, and certificate rendering are kept as separate application concerns.

---

#   Hackathon context

**This submission is for the Nebius × NVIDIA Global AI Hackathon, Best Apps and Agents track.** The track requires a runtime call to the Nebius Token Factory inference API with NVIDIA Nemotron models; MT-S02's live replies make that call (see [Cloudflare Worker and Nebius](#cloudflare-worker-and-nebius-the-deployed-demo)). The official rules page is `https://nebiusglobalaihackathon.devpost.com/rules`; this README does not restate them, and `docs/GATE_A_READINESS.md` lists what remains unconfirmed.

The application's base (scenario framework, authentication, progress, certificate) was first built for **Shipaton 2026**, as earlier versions of this README stated. The live-AI Tomás replies, the Cloudflare Worker, the rule-based assessment records and the My progress view were added for the Nebius × NVIDIA submission.

The project explores how interactive simulations, structured behavioural models, and AI-assisted development can be combined to create practical workplace learning experiences.

The project demonstrates:

* Scenario design
* Behavioural modelling
* State-machine-driven interactions
* React application architecture
* Firebase integration
* Persistent user profiles
* Autosave and state restoration
* Dynamic certificate generation
* AI-assisted development workflows

---

#   Development Commands

| Command            | Description                  |
| ------------------ | ---------------------------- |
| `npm install`      | Install dependencies         |
| `npm start`        | Start development server     |
| `npx tsc --noEmit` | Run TypeScript type checking |
| `npm test`         | Run client tests (watch mode; add `-- --watchAll=false` for one run) |
| `npm run build`    | Create production build      |
| `npm --prefix functions test` | Build and test the Cloud Functions |

---

#   Future Improvements

Potential areas for future development include:

* Additional difficult-conversation scenarios
* More advanced behavioural branching
* Improved scoring analytics
* Scenario authoring tools
* More detailed coaching feedback
* Additional certificate customisation
* An evidence-based, validated assessment (the current MT-S02 assessment is rule-based)
* Progress views across more scenarios and over longer periods

---

#   Author

**Adetunji Odedina**

Nottingham, UK

Built for the **Nebius × NVIDIA Global AI Hackathon** (base application first built for Shipaton 2026).
