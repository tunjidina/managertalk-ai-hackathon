# Scenario library taxonomy and route to 500+

Status: proposal. Nothing here is wired into the app. The library is a content
and research pipeline first; runtime integration is a separate decision (see
`SCHEMA.md`, "Compatibility with the current engine").

## Categories and balanced targets
The ten candidate areas are kept as the top level. Targets are a starting
balance, not quotas; adjust after the first reviewed batches.

| # | Category | Target | Example sub-themes |
|---|---|---|---|
| 1 | Performance and accountability | 70 | missed deadlines, quality slips, unclear standards, repeated mistakes, over-delivery that hides a problem |
| 2 | Conflict and team dynamics | 60 | recurring disagreement, credit disputes, exclusion from informal groups, a dominant voice, a silent member |
| 3 | Coaching and career growth | 55 | promotion expectations, skills gaps, stretch assignments, plateau, moving roles |
| 4 | Motivation, recognition, engagement | 45 | disengagement after a change, uneven recognition, burnout versus boredom, purpose loss |
| 5 | Delegation and prioritisation | 45 | a manager who holds on to work, unclear decision rights, competing priorities, saying no upward |
| 6 | Change and organisational uncertainty | 50 | restructure with partial information, reversed decisions, a leader leaving, new tooling resistance |
| 7 | Workload, boundaries and wellbeing | 50 | out-of-hours work, leave handover, sustained overload, return from absence |
| 8 | Fairness, inclusion and accessibility | 50 | adjustment requests, meeting formats, unequal opportunity, perceived favouritism, language differences |
| 9 | Ethical concerns and responsible escalation | 40 | a concern about figures, a conflict of interest, a peer's conduct, a report made in confidence |
| 10 | Cross-functional and remote work | 45 | decisions made in the office, time-zone strain, handoffs between teams, an ambiguous owner |
| | **Total** | **510** | |

## Variation dimensions
A scenario is one point in this space. Distinctness comes from varying several
dimensions together, not from renaming characters.

| Dimension | Values (examples) |
|---|---|
| Core tension | one sentence naming the conflict the manager must navigate (the main duplicate-detection key) |
| Context | company size, sector, remote or office, team age, recent events (all fictional) |
| Employee behaviour pattern | defensive, withdrawn, over-agreeable, quick to escalate, confused, justified grievance, relieved, ambivalent |
| Difficulty | 1 introductory, 2 intermediate, 3 advanced, 4 complex (several competing facts) |
| Manager objective | inform, explore, agree commitments, listen and support, correct own process, escalate responsibly |
| Evidence state | clear, partial, contradictory, unknown; which facts are observed versus reported |
| Manager's own contribution | present, absent, unclear |
| Likely outcomes | partial agreement, disagreement persists but conversation continues, escalation needed, nothing resolved today |
| Sensitivity tier | A standard, B sensitive, C safeguarding or legal (see below) |

## Sensitivity tiers
- **A, standard:** ordinary performance, coaching and team conversations.
- **B, sensitive:** health, disability adjustments, discipline, discrimination
  concerns, grievances. Practise listening, fairness and documentation; state
  where HR or a specialist process takes over. No advice on legal rights.
- **C, safeguarding or legal:** the scenario trains a manager to listen, avoid
  promises, and escalate to the right route. It must not rehearse
  investigating, interrogating, or deciding the matter.

The app is practice for conversation skills. It is not professional, legal,
HR or medical advice, and every B and C scenario carries that statement.

## Characterisation rules
- No behaviour is explained by age, gender, ethnicity, religion, disability,
  nationality, or any other demographic characteristic. Personas are defined by
  role, tenure, working context and observable behaviour.
- Names vary and carry no meaning. A scenario's reading must not change if the
  names are swapped.
- Accessibility and inclusion scenarios treat adjustments as ordinary requests,
  and the employee is never required to disclose a diagnosis.

## Path to 500+
| Phase | Output | Gate |
|---|---|---|
| 0 | 10 pilot briefs (`PILOT_SCENARIOS.json`), all `needs_research` | owner reviews the schema and pilot |
| 1 | One research round per category using `PERPLEXITY_PROMPTS.md`; owner or a reviewer checks every cited source | sources marked `verified` only after someone opens them |
| 2 | 5 reviewed scenarios per category (50) | quality checklist passes; two reviewers for tiers B and C |
| 3 | Decouple the engine from MT-S02 (scenario packs, see `SCHEMA.md`) so a scenario can run without code changes | a second scenario runs end to end with tests |
| 4 | Batch generation from research-backed briefs, 40 to 60 per category, each with a distinct core tension | duplicate and checklist gates, sampled human review |
| 5 | Maintenance: version scenarios, re-check sources yearly, retire stale ones | ongoing |

Volume is limited by review capacity, not by writing. Plan for roughly one
reviewer-hour per scenario for tiers A, and more for B and C.
