# ManagerTalk AI: Design Specification and Asset Plan (Stage 2)

> **Status note:** this is the proposal as written before implementation. Parts of it are now built and tested with fake network only; nothing has been deployed and no live Nebius call has been made. See `docs/DEPLOYMENT.md` and the git history for what exists.

Status: proposal for review. Nothing below is implemented. Baseline: tsc clean, 212 client tests and 85 function tests pass, main bundle 508.13 kB gzip (measured).

## 0. Honesty rules (apply everywhere)
| State | Meaning | How the UI shows it |
|---|---|---|
| **Scripted** | Authored lines, chosen by rules. No model. | Hollow "Scripted" chip on every Tomás message; header pill "Scripted practice partner". |
| **Mock** | Server pipeline with the mock model. | "Mock reply, no AI model was called" (existing `sourceLabel`). |
| **Live** | Model reply from the endpoint. | Filled chip "Live · <model id from the reply>". Only appears after live inference is implemented, verified and separately approved. |
Expression, posture and "stance" cues are authored presentation of a fictional character. Captioned as such. They never score or describe the manager.

## 1. Creative direction: "The Open Door"
**Idea.** A difficult conversation is a door you hesitate at. ManagerTalk is the quiet room where you rehearse walking through it. The Table gives it warmth and a person to face; Threshold gives it a mark and a progress language; The Script gives feedback the seriousness of an editor's marked-up page.

**Emotional arc.** Dim and hesitant at the start, warmer and more open as stages progress. Light is used for progress only, never as a score.

**Decisions and reasons**
- **Paper, not glass.** Warm off-white surfaces, ink text, no gradients. Reads as a considered workplace tool, not a generic AI product.
- **One bright colour, used sparingly.** Threshold amber appears only on the doorway mark, the active stage and primary actions. Scarcity makes it meaningful.
- **Three voices, three colours, never colour alone.** You = teal, Tomás = clay, Coach = blue pencil. Each also carries a name label and an icon.
- **Serif for humanity, mono for the record.** Fraunces for headings, Inter for UI, Courier Prime only for screenplay-style transcript quotes in feedback.

## 2. Visual assets
All assets are original SVG stored locally. No remote images, no runtime image service.

### 2.1 Brand mark
Door ajar: a rounded door frame with an amber sliver of light on the opening edge. Five widths of the sliver double as the stage tracker (one step per stage). Wordmark "ManagerTalk" in Fraunces semibold. Used as logo, favicon (SVG plus regenerated 192/512 PNG), tracker and loading state.

### 2.2 Tomás Vieira (MT-S02)
**Presentation.** Three-quarter bust seated across a table edge, so the table is always in the foreground. Mid-30s, short dark hair, navy overshirt over a plain tee, a closed notebook and pen beside him. The details signal precision, not an engineer stereotype (no glasses, no hoodie). Warm mid skin tone from the palette; no ethnic caricature; features simplified to geometric shapes.

**Construction (what makes it polished).**
- One construction grid and viewBox (480 x 560); fixed layer ids: `base` (body, table), `head`, `brows`, `eyes`, `mouth`, `arms`.
- Six-colour character palette drawn from the tokens; flat fills plus a single offset shade shape. No outlines, no auto-trace, hand-tuned curves.
- Expressions swap only `brows`, `eyes`, `mouth`, `arms`, so they are guaranteed consistent and small (target under 12 kB each, under 60 kB for the set; measured at build).
- Layer contract is documented, so a commissioned illustration can replace the SVGs without code changes.
- **Review gate:** render a contact sheet at 3 sizes (Chromium is pre-installed) and get your sign-off. If it fails, fall back to silhouette plus monogram, which ships as the loading and small-screen state anyway.

**Six states, mapped to existing engine values**
| State | Trigger | Pose |
|---|---|---|
| Listening | idle, awaiting your message | level gaze, hands on notebook |
| Explaining | `technical_detail` | one hand raised, brows level |
| Guarded | `evidence_challenge` | arms folded, chin slightly down |
| Composed | `composed_disagreement` | head tilted a few degrees, hands steepled |
| Measured | `procedural_compliance` | pen up, nodding posture |
| Considering | scripted "openness beat" (authored branch, section 6) | arms uncrossed, gaze lifts |
Crossfade only, 240 ms. Caption: "Tomás, in this scenario: guarded (scripted cue)". Alt text on the portrait is stable ("Tomás Vieira, illustrated portrait"); the stance is stated once per reply in visually hidden text.

### 2.3 Scenario illustrations (card vignettes)
Two static SVGs, 3 colours each, hidden below 480px: MT-S02 a review table seen from above with one chair pulled back from the group; MT-S01 two chairs facing across a table with a closed envelope. Decorative (`alt=""`).

### 2.4 Icons
About 18 custom 24px icons, 1.75 stroke, round caps, in one SVG sprite: observe, question, hypothesis, commitment, door, evidence, pencil, met, partial, tripped, replay, compare, scripted, live, mock, send, close, info. Always paired with text.

### 2.5 Feedback annotation kit (The Script)
Margin notes in blue pencil (Inter italic), a hand-drawn underline SVG path animated on load, amber highlighter behind strengths, speaker cues in Courier Prime capitals (YOU, TOMÁS), a dotted rule between scenes. All CSS plus one SVG path.

### 2.6 Promotional and demo visuals
OG/share image 1200 x 630, README hero, and 3 title cards for a screen recording, all authored as SVG and rendered to PNG with the pre-installed Chromium. Real screenshots only, taken from the running app.

### 2.7 Typography (self-hosted, OFL)
Fraunces (variable), Inter (400/600), Courier Prime (400), Latin plus Latin Extended for "Tomás". `font-display: swap`, preload the two critical files. Target at most 150 kB total woff2, measured in phase 1. Replaces the current runtime Google Fonts request, which breaks offline demos.

## 3. Experience design (MT-S02 first; MT-S01 unchanged in structure)

**Welcome (login).** Mark, one line ("Rehearse the conversation you have been putting off."), a Tomás vignette, sign-in. No marketing carousel.

**Scenario select.** MT-S02 is a featured card: vignette, title, competency tag, difficulty, estimated time (shown only after playtest timing), one-sentence situation. MT-S01 is a smaller card. Profile moves to a header menu.

**Preparation room** (a store flag `briefed`, not a new Screen id, so the three exhaustive screen maps stay untouched).
```
[Situation brief]   [Evidence: 7 documents]   [Your aim]
 core_scenario       each: observed / "what this       one line + opening
 + stakes            does not establish" (expand)      line draft
```
- Reuses `evidence_pack`. Showing "what this does not establish" teaches observation versus inference, which the rubric scores. Decision requested.
- Opening-line check reuses `detectStageViolations`: a non-blocking pencil note, no AI.
- "Your aim" is pinned as a chip in roleplay.

**Live roleplay (the centre).**
```
Desktop                                 Mobile
+-----------------------+-------------+ +---------------------------+
| Scene title (stage)   | Tomás       | | Door tracker | Tomás avatar|
| conversation log      | portrait    | | log                        |
| (role="log", 62ch)    | door tracker| | [Evidence][Stage brief]    |
|                       | Your aim    | | composer (sticky)          |
|                       | Evidence    | +---------------------------+
| composer              | Stage brief |
+-----------------------+-------------+
```
- Each stage is a scene: 1 to 3 exchanges, "Move on" enabled after the first. Cap bounds cost and fits the existing `MAX_PRIOR_TURNS` (10).
- Commitments and closing keep their structured forms (`S02CommitmentsScreen`, closing fields) as inline "document" cards inside the log, so validation is preserved.
- Turn-taking: 350 ms pacing for readability only, with the neutral label "Reply arriving". No fake "thinking" for scripted replies. Live latency is shown as measured.
- Violations move from a post-send alert box to a blue-pencil margin note on your message, non-blocking.
- "Ambiguity To Preserve" is removed from the learner UI (it is a model constraint).
- Engine pill in the header (Scripted / Mock / Live); click opens "Under the hood": source, model id, latency, fallback reason.

**Stage progression.** Doorway tracker: SBI, Exploration, Hypotheses, Commitments, Closing, then Feedback; sliver widens one step per stage (400 ms, instant when reduced motion).

**Coaching report (The Script).**
1. A plain sentence: tier and count ("5 of 7 excellence criteria met"). No arbitrary numeric score.
2. "The rubric, line by line": each criterion shows Met / Not yet / Tripped (icon plus text), with a quoted line from your own words where the signal was matched.
3. Annotated transcript in screenplay format with margin notes.
4. "Try this instead": authored alternative phrasing, one per failure type, matching the blueprint ("one alternative behaviour per failure").
5. One next action: "Replay Exploration" aimed at the weakest stage.
Where a criterion is about something absent (for example no line names your own contribution), the report says exactly that and quotes nothing. Existing feedback branches (good / poor / avoidance / escalation) are kept.

**Retry and comparison.** Replay from any stage keeps earlier inputs. Up to 3 attempts, held in local storage. Compare view: two columns of your text for the replayed stage, with criterion-level changes ("Not yet to Met"). No points, streaks or badges.

**MT-S01.** Receives only global tokens: fonts, colour defaults, focus ring, browser metadata. Screens are not restructured. A before/after screenshot check guards against regressions.

## 4. Design system
**Implementation.** CSS custom properties in `src/styles/tokens.css`, imported from `index.css` (matches the existing `layout.ts` var() pattern). New components use CSS Modules (supported by CRA 5, allows media queries, `:focus-visible`, reduced motion; inline styles cannot). Components live in `src/ui/`.

**Colour (contrast computed against WCAG formula)**
| Token | Hex | Use | Contrast |
|---|---|---|---|
| paper | #F6F0E6 | page | n/a |
| card | #FCF9F3 | surfaces | n/a |
| ink | #1F2430 | text | 13.69 on paper |
| ink-2 | #4B505D | secondary text | 7.11 on paper |
| teal | #1E5C58 | you | 6.79 on paper; white on teal 7.70 |
| clay | #A24A2D | Tomás | 5.21 on paper |
| pencil | #2C4A9E | coach | 7.18 on paper |
| amber | #E9A83A | doorway, primary action | ink on amber 7.48 |
| amber-ink | #7A4E00 | amber text | 6.35 on paper |
| highlight | #F4DC9A | strengths | ink on it 11.49 |
| focus | #1D4ED8 | focus ring, 3px with 2px offset | 5.91 on paper |
Hairlines (#CFC3B0) are decorative only (1.53:1); form-control borders use a darker token that must reach 3:1. A small script will assert every pair in CI-style test.
Optional Night theme (paper #F6F0E6 on #171B26 = 15.17; amber 9.45; secondary 9.07), token-swapped, so no extra components.

**Type scale.** 13, 15, 17 (body), 20, 28, 40, 56 px, fluid via `clamp()` above 720px; body line height 1.6; measure 62 to 68ch.
**Spacing.** 4px base: 4, 8, 12, 16, 24, 32, 48, 72. Radii 6 / 12 / 20.
**Breakpoints.** 480 (existing), 720, 1080. Touch targets at least 44px. No horizontal scroll at 360px.
**Accessibility.** Semantic landmarks; log has `role="log"` with polite live region; each message is an article with a hidden speaker heading; sheets trap focus and close on Esc; Ctrl/Cmd+Enter sends; focus stays in the composer after a reply; meaning never by colour alone.
**Motion (four only).** Message arrive (180 ms fade and 4px rise), portrait crossfade (240 ms), doorway widen (400 ms), pencil underline draw (300 ms). Under `prefers-reduced-motion`: all instant, static states.
**Components.** Button, Card, Chip (Scripted / Mock / Live), Icon, DoorwayMark, StageTracker, TomasPortrait, MessageBubble (you / Tomás), Composer, Sheet, DossierCard (new name; `EvidenceCard` is S01's), MarginNote, RubricRow, CompareColumns, EnginePill.

## 5. Bundle budget
Measured: main chunk 508.13 kB gzip (2.0 MB raw). Proposed limits:
- Net new JS across all phases: at most +40 kB gzip; Tomás art and the feedback report load via `React.lazy`.
- Non-JS assets: fonts at most 150 kB, SVG at most 80 kB, PNG at most 70 kB.
- Every phase reports `npm run build` sizes. What dominates the existing bundle is unverified (likely Firebase, RevenueCat, Capacitor); attributing it needs a bundle analyser, which I will not install without approval.

## 6. AI integrity and the scripted Tomás
- New `ScriptedConversationEngine` becomes the default for MT-S02 (the old stub's behaviour-note bullets are not dialogue). Source stays `'stub'`, so the existing "Scripted reply" label applies.
- Content: about 45 to 60 short authored lines, 4 styles x 5 stages x 2 to 3 variants, plus about 6 "considering" lines. First person, precise, composed. Selection reuses `chooseStyle`; the variant is chosen deterministically from the turn index, so tests are stable and a replay can differ. The "considering" beat triggers on `MANAGER_CONTRIBUTION_MARKERS`.
- Authoring constraints: never confirm he noticed the silence; never concede root cause; never introduce the outage; invent no facts beyond the blueprint; each line at most 600 chars, at most 6 lines (server and client caps).
- Draft tone samples for your review:
  - Explaining: "Aoife's concern had a few parts and I answered each one. If how I answered caused a problem, tell me which part and I'll look at it."
  - Guarded: "Which example do you mean? I'd want to look at it properly before I agree it happened that way."
  - Composed: "I hear that you see it differently. I'm not convinced yet, but I'm willing to keep talking. Could you put the specifics in writing so I can read them properly?"
  - Measured: "Understood. I'll do that. Can you send the date and what done looks like in the follow-up note?"
  - Considering: "That's fair. I hadn't thought about how the earlier feedback was delivered. I'm still not sure it explains the sprint review, though."
- Tests: caps, determinism, banned-content lint, correct source label, fallback label unchanged.
- **Live Nebius / Nemotron: not implemented, not verified.** The UI already supports it via source chips; enabling it is phase 7 and needs separate approval. Free preparatory work: read the Nebius/NVIDIA docs to confirm endpoint and model IDs.
- Multi-turn change to scoring: stage text becomes the manager's messages joined with a blank line. `textSignals` thresholds (word counts, question counts) must be regression-tested for this.

## 7. Implementation sequence
Effort is relative (S/M/L); no calendar estimates until you give the deadline.

| Phase | Scope | Acceptance criteria | Tests | Risks |
|---|---|---|---|---|
| **P1 Foundations** (M) | tokens, self-hosted fonts, metadata (title, description, theme-color, OG, SVG favicon), remove CRA leftovers (verify `App.css` is unused first), Icon, DoorwayMark, Button/Card/Chip | tsc clean; 212 and 85 tests pass; S01 screenshots unchanged apart from fonts; contrast script passes; fonts load with network blocked; JS at most +5 kB gz | contrast test, component tests | font licensing and sizes; font install needs approval |
| **P2 Scripted Tomás** (M) | authored bank, engine, tests | you approve every line; all new tests pass; label "Scripted reply" on every message | engine and lint tests | tone quality; content approval |
| **P3 Tomás art and brand set** (M to L) | SVG layers, 6 states, mark, vignettes, icons | contact sheet at 3 sizes signed off; sizes within budget | render snapshot check, alt-text test | amateur look (gate and fallback defined) |
| **P4 Roleplay UI** (L) | log, portrait rail, tracker, composer, sheets, multi-turn stages, chips, engine pill | full MT-S02 run with scripted engine at 360 / 768 / 1280; keyboard-only run; reduced-motion check; scoring unchanged for single-message stages | RTL flow tests with store and engine; scoring regression | multi-turn input shape; no emulator available for full-auth E2E |
| **P5 Welcome, select, prep** (M) | login visual, cards, preparation room, `briefed` flag | resume and restore still work; demo-mode gating intact | store and render tests | autosave and restore interplay |
| **P6 Coaching and retry** (L) | evidence extractor, annotated transcript, rewrite library, attempts store, compare view | each criterion row traces to a real quote or an explicit "nothing found"; replay keeps earlier stages; compare shows criterion deltas | extractor, rewrite and attempts tests | extractor quality on keyword scorer; local-only history |
| **P7 Live inference** (M) | Nebius client in `functions/`, secrets, rate limits, labelling | endpoint, model ID, secret handling and cost each verified and approved first; mock remains fallback | fake-fetch unit tests; one approved live check | cost, latency, off-character output, prompt leakage |
| **P8 Demo hardening** (M) | guided 3-minute path, reset, offline guarantee, README, real screenshots | clean-clone run works with no network to AI; judge walkthrough doc | smoke run | scope creep |

Dependencies: P2 before P4; P3 can run in parallel with P2; P4 before P5 and P6. P7 docs research can start now at no cost.

**Must-haves:** P1, P2, P3 (or the fallback silhouette), P4, the P6 rubric report with quotes and replay-with-comparison, honest labelling, and P8 basics.
**Strong if verified:** P7 live Nemotron (the headline for this hackathon, but only if it can be proven).
**Optional polish:** Night theme, MT-S01 skin pass, title cards, extra motion, per-user history in Firestore.

## 8. Decisions needing your approval
1. **Direction:** the specifics above (The Open Door, palette, six Tomás states, plain "no score" feedback).
2. **Fonts:** add `@fontsource` packages (modifies `package.json` and the lockfile) or commit downloaded OFL woff2 files. I recommend the packages.
3. **Authored dialogue:** you review the full line bank before it ships (content approval).
4. **Prep room:** show "what this does not establish" to learners (recommended) and remove "Ambiguity To Preserve" from the UI.
5. **Attempt history:** local storage only (recommended) versus Firestore (needs rules and schema).
6. **Test tooling:** permission to add `@playwright/test` as a dev dependency, or to use the pre-installed Chromium by script only; and whether to download `firebase-tools` for emulator-backed E2E.
7. **Scoring input change:** joining multi-turn messages for the scorer, with regression tests.
8. **Free docs research** on Nebius / NVIDIA (read-only web, no API calls) to prepare P7.
9. **Deadline date**, and whether a human illustrator could polish Tomás later.
10. **Optional:** Night theme in or out.
