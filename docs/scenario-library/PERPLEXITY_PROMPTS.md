# Perplexity research prompt pack

Purpose: gather verifiable evidence to inform original ManagerTalk scenarios. Perplexity output is a lead list, not evidence. Nothing it returns counts as verified until a person has opened the source and recorded it in the scenario's `research` block (see `SCHEMA.md`).

## Rules for every run

1. Paste the template below, filling the bracketed fields. Do not shorten the integrity rules.
2. Run one scenario brief (or one category theme) per query. Broad queries produce generic answers.
3. Open every returned URL. Record the title, publisher, year and URL exactly as shown on the page, not as Perplexity reported them.
4. A source is `verified` only when you have opened it, confirmed it exists, and confirmed it says what the summary claims. Anything else stays `needs_research` or `unverified_candidate`.
5. Discard any source Perplexity cannot give a working URL for. Do not "repair" a citation from memory.
6. Never paste Perplexity prose into a scenario. The scenario is written by the author from the verified findings.
7. Record the date of the run and the exact prompt used.

## Reusable template

```
You are helping me prepare evidence for an original workplace-conversation training scenario for line managers. I need real, checkable sources, not a summary of general advice.

SCENARIO BRIEF
- Working title: [title]
- Category: [category from taxonomy]
- Core tension (one sentence): [core_tension]
- Manager's objective: [objective]
- Region and setting: [UK / general; sector if relevant]
- Sensitivity tier: [A / B / C]

RESEARCH QUESTIONS
[paste the scenario's research_questions, one per line]

WHAT I NEED
1. Between 5 and 10 sources, preferring in this order: peer-reviewed studies and systematic reviews; large-sample surveys or official statistics (for example UK government, ACAS, CIPD, ONS, HSE); established frameworks published by their authors; reputable practitioner guidance from regulators or professional bodies; practitioner opinion last.
2. For EACH source give: full title; authors or publishing body; publisher or journal; year; full working URL; DOI if one exists.
3. For EACH source state the evidence type exactly as one of: empirical study, systematic review or meta-analysis, official statistics, regulator or statutory guidance, published framework, practitioner opinion.
4. For EACH source state in one or two sentences what it supports for this scenario, and separately what it does NOT support (sample, setting, design, date, or scope limits).
5. Say which claims in your answer come from which numbered source. Do not make a claim that has no source.

INTEGRITY RULES
- Do not invent or reconstruct citations. If you cannot find a source with a working URL, say "no source found" for that question.
- Do not present a framework or practitioner opinion as if it were empirical evidence.
- Do not claim a method causes an outcome unless a cited study tested that causal claim; otherwise describe the finding as an association or a recommendation.
- Do not promise outcomes. No "this will work".
- Mark uncertainty explicitly, including where sources disagree, where evidence is old, or where it comes from a different country, sector or population.
- Do not reproduce long passages from sources, and do not give me a script or dialogue to copy. I will write an original scenario.
- If the topic touches employment law, give the statutory or regulator source (for example ACAS or legislation.gov.uk) and tell me it needs checking by a qualified person before use.

OUTPUT FORMAT
A numbered source table, then a short section "Where the evidence is thin or conflicting", then a section "Suggested scenario design implications" limited to points that follow from the cited sources, each tagged with its source number.
```

## Category prompts (fill the template with these research questions)

Replace the bracketed template fields, then use the questions below as `RESEARCH QUESTIONS`.

### 1. Performance
- What does evidence say about how specific, behaviour-based feedback differs from general or trait-based feedback in effect on later performance?
- What do ACAS or equivalent UK guidance documents say about informal performance conversations before any formal process?
- What does research say about manager contribution to performance problems (unclear expectations, workload, support)?

### 2. Conflict and team dynamics
- What does evidence say about task conflict versus relationship conflict in teams, and when open disagreement helps or harms?
- What do published mediation or conflict-handling frameworks recommend for a manager who must address a recurring public disagreement?
- What does research on psychological safety (for example Edmondson) support and not support about manager responses to dissent?

### 3. Coaching and career
- What does evidence say about manager expectation-setting for promotion and the effect of vague timelines on trust and retention?
- What does research on developmental feedback and coaching conversations support, and in what settings was it studied?
- What UK guidance exists on fairness in promotion and progression decisions?

### 4. Motivation and recognition
- What does evidence say about recognition and engagement, including what is not shown (for example causal claims from survey correlations)?
- What does research on self-determination (autonomy, competence, relatedness) say about managerial support after organisational disruption?
- What is known about disengagement after restructuring, and what distinguishes it from burnout?

### 5. Delegation
- What does evidence say about over-retention of work by managers and the effect on team development?
- What delegation frameworks exist, and what is their evidential basis versus practitioner origin?
- What does research on trust and autonomy say about monitoring after delegation?

### 6. Change
- What does evidence say about how employees interpret ambiguous organisational communication during restructuring?
- What do ACAS or CIPD publications say about communicating during redundancy consultation, and what must a manager not say?
- What does research on job insecurity say about its effects, and what manager behaviours were studied?

### 7. Workload and wellbeing
- What do HSE management standards and ACAS guidance say about workload, working hours and manager responsibilities?
- What does evidence say about out-of-hours working expectations and wellbeing, distinguishing studies from opinion?
- What UK statutory provisions (Working Time Regulations) are relevant, and which parts need legal review?

### 8. Fairness, inclusion and accessibility (Tier B: needs extra care)
- What does ACAS or the Equality and Human Rights Commission say about reasonable adjustments and how a manager should respond to an informal request?
- What does evidence say about manager responses to disclosure, and which behaviours are recommended by regulators versus advocacy bodies?
- Which guidance states what a manager must not do (for example ask for a diagnosis or share information without consent)?

### 9. Ethics and escalation (Tier C: listen and escalate only)
- What do regulator and whistleblowing sources (for example the UK public-interest disclosure framework and relevant professional bodies) say about how a manager must respond to a concern about misconduct?
- What does evidence say about retaliation risks and the effect of manager responses on whether concerns are raised?
- Which duties are statutory and which are organisational policy? Flag every claim needing legal review.

### 10. Cross-functional and remote
- What does evidence say about inclusion and information access in hybrid or distributed teams across time zones?
- What does research on remote meeting practices support and not support?
- What guidance exists for managers on equitable scheduling and participation?

## Verification log (copy per scenario)

```
scenario_id:
run_date:
prompt_version: template v1 + category prompt [n]
sources_returned: [n]
sources_opened_and_confirmed: [n]
sources_rejected (no working URL / does not say what was claimed): [list]
reviewer:
```
