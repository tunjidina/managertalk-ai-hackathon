# Scenario library schema (proposal v0.1)

Status: proposal. Nothing in the app reads this schema yet. `PILOT_SCENARIOS.json` follows it and is checked by an offline script only.

## Principles

- Research provenance is separate from scenario content. A scenario can be fully drafted while its `research` block still says `needs_research`.
- A source is `verified` only when a person opened it and confirmed it. Default is `needs_research`.
- Scenario content is original. No copied scripts, no long quotations.
- Sensitive scenarios carry explicit boundaries (what the learner may practise, what must be escalated).
- Fields marked **[existing]** map onto the MT-S02 blueprint (`src/types/scenarioBlueprint.ts`). Fields marked **[proposed]** do not exist in the app today.

## Library file

```
{
  "schema_version": "0.1",
  "library_status": "pilot",
  "scenarios": [ <Scenario>, ... ]
}
```

## Scenario

| Field | Type | Notes |
|---|---|---|
| `id` | string | `MT-L###` for library briefs. MT-S01 and MT-S02 keep their IDs. **[existing form: id]** |
| `title` | string | **[existing]** |
| `category` | enum | Slug of a taxonomy category: `performance`, `conflict_team`, `coaching_career`, `motivation_recognition`, `delegation`, `change`, `workload_wellbeing`, `fairness_inclusion`, `ethics_escalation`, `cross_functional_remote`. **[proposed]** |
| `core_tension` | string | One sentence; the duplication key. **[proposed]** |
| `difficulty` | 1..4 | **[proposed]** |
| `sensitivity_tier` | `A` \| `B` \| `C` | See `TAXONOMY.md`. **[proposed]** |
| `status` | enum | `brief`, `drafted`, `reviewed`, `approved`, `retired`. Pilot items are `brief`. **[proposed]** |
| `summary` | string | Neutral situation description. **[existing: summary]** |
| `context` | object | `setting`, `manager_role`, `employee_role`, `employee_name` (fictional, neutral), `region`. **[partly existing]** |
| `employee_behaviour_pattern` | string | Observable behaviour, not a trait. **[proposed]** |
| `manager_objective` | string | What a good outcome is for the manager in this conversation. **[proposed]** |
| `manager_own_contribution` | string \| null | Plausible way the manager contributed, for fair coaching. **[proposed]** |
| `evidence_state` | enum | `clear`, `partial`, `contradictory`, `unknown` (as in `TAXONOMY.md`). **[proposed]** |
| `evidence_pack_outline` | array | Planned items `{id, source, observed, not_proven}`. **[existing: evidence_pack]** |
| `stage_model` | string | `mt-s02-five-stage` if the conversation shape fits the five stages (it still needs a scenario pack to run); otherwise a `proposed-*` value. **[proposed]** |
| `likely_outcomes` | array of strings | Plausible outcomes, none guaranteed. **[proposed]** |
| `scoring_notes` | string | Which criteria, scoreable from learner-provided evidence. Full rubric is later work. **[existing: scoring_rubric]** |
| `boundaries` | object | See below. **[proposed]** |
| `research` | object | See below. **[proposed]** |
| `review` | object | See below. **[proposed]** |

## `boundaries`

| Field | Notes |
|---|---|
| `practice_not_advice` | Always `true`. Learner-facing text states this is practice, not legal or HR advice. |
| `learner_may_practise` | What the roleplay allows. |
| `must_escalate` | Matters the manager must hand to HR or another route and not resolve in the conversation. Required for tiers B and C. |
| `must_not_do` | For example: ask for a diagnosis, promise outcomes, share confidential information. |
| `review_required` | Roles that must review before approval (for example `hr_professional`, `employment_law`, `accessibility_specialist`). |

## `research`

| Field | Notes |
|---|---|
| `status` | `needs_research` (default), `partially_verified`, `verified`. |
| `research_questions` | Array of strings used in the Perplexity prompt. |
| `candidate_frameworks` | Names only, each `unverified_candidate`. Not citations. |
| `sources` | Array of verified sources only (empty in the pilot). Each: `{title, publisher, year, url, evidence_type, supports, does_not_support, verified_on, verified_by}`. `evidence_type` is one of `empirical_study`, `systematic_review`, `official_statistics`, `regulator_guidance`, `published_framework`, `practitioner_opinion`. |
| `verification_log` | Array of `{run_date, prompt_version, opened, confirmed, rejected}`. |

A scenario with `research.status` of `verified` must have at least one entry in `sources`, and every `sources` entry must have all fields populated. The offline check enforces this.

## `review`

`{ "owner_review": "pending", "peer_review": "pending", "last_reviewed": null }`

## Compatibility with the current engine

The current app runs one blueprint-format scenario (MT-S02) and one legacy scenario (MT-S01). A library brief is not runnable content. Concerns:

1. **Fixed stage keys.** `S02InputStage` is a fixed union (sbi, exploration, hypotheses, commitments, closing). Briefs using other conversation shapes need `proposed-*` stage models.
2. **MT-S02-specific logic.** Text markers, scoring signals, the commitment validator, style rules and the 42-line scripted dialogue bank are tied to MT-S02. A new scenario cannot be added by data alone.
3. **Server allow-list.** The Cloud Function accepts only the MT-S02 scenario ID and its blueprint map. A new ID is rejected.
4. **Registry.** `SCENARIO_REGISTRY` and `BLUEPRINTS` are keyed by ID, so registering is easy once the content is runnable.
5. **Blueprint fields.** `REQUIRED_BLUEPRINT_FIELDS` would need the library fields mapped; `evidence_pack`, `conversation_flow`, `commitment_expectations`, `scoring_rubric` and `feedback_logic` cannot be generated from a brief alone.

Smallest future change: a "scenario pack" per scenario holding blueprint JSON, stage markers and scoring signals, the dialogue bank, and an engine selected by pack ID. That is engine work and is out of scope here and out of scope before the hackathon deadline.

## Validation rules (offline check)

- Valid JSON; unique `id`; required fields present; enums valid.
- `research.status` of `verified` requires non-empty, complete `sources`.
- No pilot item has `research.status` of `verified`.
- Tier B or C requires non-empty `boundaries.must_escalate` and `boundaries.review_required`.
- Employee names are fictional; no pronouns or demographic traits are used to explain behaviour (`TAXONOMY.md` characterisation rules).
- Core-tension word overlap between any two scenarios stays below 0.6.
