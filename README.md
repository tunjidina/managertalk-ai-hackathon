# ManagerTalk — Difficult Conversation Coach

> A scenario-based coaching application that helps managers practice sensitive workplace conversations through structured, interactive simulations.

ManagerTalk provides a realistic, guided environment for developing **clarity, empathy, accountability, and communication skills** in challenging workplace situations.

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

### MT-S02 — The Stage-Machine Scenario

An advanced scenario built around a **state machine** for precise behavioural transitions and branching conversation logic.

The scenario demonstrates how structured state management can be used to model complex conversation flows and behavioural outcomes.

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
| Firestore               | User profile persistence                |
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
* For a hosted build: your own Firebase project with Authentication and Firestore. No project, deployed URL or key is included in this repository.

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

Live mode is off by default. The function uses the mock unless `S02_ENGINE_MODE` is exactly `live` and a `NEBIUS_API_KEY` Secret Manager secret is bound to it. Any failure falls back to scripted replies. See `docs/DEPLOYMENT.md` for the settings, the daily limits and the smoke test.

**Current status:** no request to Nebius Token Factory has been made from this repository, and nothing is deployed. The live path is implemented and tested against fake network responses only. See `docs/VERIFICATION.md` for what has and has not been verified, and `docs/GATE_A_READINESS.md` for the open model and eligibility questions.

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

#   Shipaton 2026

ManagerTalk was built for **Shipaton 2026**.

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
* Manager progress dashboards
* More detailed coaching feedback
* Additional certificate customisation
* Scenario performance history

---

#   Author

**Adetunji Odedina**

Nottingham, UK

Built for **Shipaton 2026**.
