# Scenario quality checklist

Run it on every scenario before it reaches `reviewed`. Items marked (auto) can
be checked by a short deterministic script using only the JSON and standard
tooling; the rest need a person.

## Structure and compatibility (auto)
- [ ] Valid JSON; `schema_version` is a known version.
- [ ] `id` is unique across the library and matches `MTL-<category>-<number>`.
- [ ] Every required field in `SCHEMA.md` is present and non-empty.
- [ ] `stage_model` is `mt-s02-five-stage` for anything meant to run on the current engine, and every one of the five stage keys has requirements, prohibitions and ambiguity-to-preserve.
- [ ] Rubric criteria are listed in the three tiers the engine reads (excellent, adequate, poor) when the scenario targets the current engine.
- [ ] Enumerated values (category, difficulty, tier, status, evidence_status) are from the allowed lists.

## Duplication (auto, then human)
- [ ] The `core_tension` sentence is not a near-duplicate of another (compare normalised word sets; flag overlap above about 0.6 for review).
- [ ] No two scenarios share the same combination of category, employee behaviour pattern and manager objective without a different core tension.
- [ ] Names, titles and setting alone do not make a scenario distinct.

## Evidence and references
- [ ] No source is marked `verified` unless a person opened it and recorded the date.
- [ ] Each cited source has title, author or publisher, date, URL, evidence type, what it supports, and its limitations.
- [ ] `claims_supported` states what the source supports in plain words, without outcome guarantees.
- [ ] Scenario content (facts about the fictional case) is not presented as research. Provenance sits in `research`, not in the story.
- [ ] No fabricated, paraphrased-from-memory or unopened citation. A scenario with unverified sources stays `needs_research`.
- [ ] No claim that a framework guarantees an outcome.

## Realism and fairness
- [ ] The employee's behaviour is plausible, internally consistent, and can be seen and described without guessing at motives.
- [ ] The employee can disagree and the conversation can continue; there is no single "correct" employee reaction.
- [ ] Nothing in the persona or the scoring depends on a demographic characteristic.
- [ ] The scenario still reads the same with every name swapped.
- [ ] No stereotype, joke or loaded phrasing; wording is neutral and respectful.

## Manager objective and rubric
- [ ] The manager's goal is stated once, in one sentence, and is achievable in one conversation.
- [ ] The goal and constraints do not contradict each other or the stage requirements.
- [ ] Every rubric criterion can be met using evidence the learner is actually asked to provide at some stage. No criterion scores something the learner never had a chance to say.
- [ ] Criteria describe observable behaviour, not attitude or personality.
- [ ] Commitments are experiments with an owner and a date, not findings.

## Sensitive situations
- [ ] Tier is set; tier B and C carry the "practice, not advice" statement and a stated escalation boundary.
- [ ] Tier C scenarios train listening and referral only; they do not rehearse investigating or deciding.
- [ ] No legal, medical or HR-policy advice, and no promise about outcomes, rating, pay or role.
- [ ] No requirement for the employee to disclose a diagnosis or personal circumstances.

## Review record
- [ ] `review.status` and reviewer names and dates are filled in. Tier B and C need two reviewers.
- [ ] Open questions are written as `research_questions`, not left implicit.
