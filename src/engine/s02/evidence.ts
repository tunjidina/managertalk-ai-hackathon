// src/engine/s02/evidence.ts
//
// What the manager actually wrote, set out as evidence for the feedback
// screen, kept apart from the authored coaching guidance.
//
// Every item is one of three kinds, and says which:
//
//   quote      an exact piece of the manager's own text (a verbatim
//              substring of what they typed, never reworded) that the
//              deterministic rules matched, with the stage it came from
//   field      a value the manager entered in a structured field
//   not-found  something the rubric looks for that was not recognised,
//              stated as "not recognised" and never as "you did not do it"
//
// Nothing here is invented or inferred: no intent, no reaction from Tomás,
// no history beyond the session inputs. Recognition is keyword-based (the
// same markers the scorer uses), so a not-found item says so. Evidence is
// computed from the run input and the signals the scorer already derived;
// it does not change scoring.

import { S02InputStage } from '../../types/scenarioBlueprint';
import { S02RunInput, S02Signals } from './scoringEngine';
import {
  CAUSALITY_MARKERS,
  FORMAL_PROCESS_MARKERS,
  MANAGER_CONTRIBUTION_MARKERS,
  NAMED_SOURCE_MARKERS,
  OUTAGE_MARKERS,
  PERSONALITY_MARKERS,
  REASSURANCE_MARKERS,
  REBUTTAL_MARKERS,
  RESOLUTION_MARKERS,
  containsAny,
  countListItems,
  countQuestions,
  matchedMarkers,
  wordCount
} from './textSignals';

export type EvidenceKind = 'quote' | 'field' | 'not-found';

/** Whether the item supports the rubric (strength) or counts against it (concern). */
export type EvidenceRole = 'strength' | 'concern' | 'gap';

export interface EvidenceItem {
  id: string;
  kind: EvidenceKind;
  role: EvidenceRole;
  stage: S02InputStage | 'checkpoint';
  /** Stated as a fact about the text or field, never as intent or effect. */
  observation: string;
  /** Verbatim substring of the manager's text. Present only for kind 'quote'. */
  quote?: string;
  /** True when the sentence was longer than QUOTE_LIMIT and the quote stops early. */
  truncated?: boolean;
  /** The structured value entered. Present only for kind 'field'. */
  value?: string;
}

export interface CoachingEvidence {
  items: EvidenceItem[];
  /** Always-shown statements of what this evidence cannot establish. */
  limits: string[];
}

export const QUOTE_LIMIT = 240;

export const EVIDENCE_LIMITS: string[] = [
  'Evidence is matched by keywords in your own words. It does not measure intent, tone, or how Tomás received it.',
  'A "not recognised" item means the rules did not find it, not that it was absent. Different wording may not be detected.'
];

/**
 * The sentences of a text, each an exact contiguous substring of it
 * (trimmed). Sentence ends are . ! ? or a line break.
 */
export function sentencesOf(text: string): string[] {
  const parts = text.match(/[^.!?\n]+[.!?]*/g) || [];
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

export interface FoundQuote {
  stage: S02InputStage;
  quote: string;
  truncated: boolean;
  matched: string[];
}

/** The first sentence, searching the stages in the order given, that contains one of the markers. */
export function findQuote(
  stages: Array<[S02InputStage, string]>,
  markers: string[]
): FoundQuote | null {
  for (const [stage, text] of stages) {
    for (const sentence of sentencesOf(text || '')) {
      if (containsAny(sentence, markers)) {
        const truncated = sentence.length > QUOTE_LIMIT;
        return {
          stage,
          quote: truncated ? sentence.slice(0, QUOTE_LIMIT) : sentence,
          truncated,
          matched: matchedMarkers(sentence, markers)
        };
      }
    }
  }
  return null;
}

const STAGE_NAME: Record<S02InputStage, string> = {
  sbi: 'Situation, behaviour, impact',
  exploration: 'Exploration',
  hypotheses: 'Hypotheses',
  commitments: 'Commitments',
  closing: 'Closing'
};

function matchedNote(found: FoundQuote): string {
  return found.matched.length > 0 ? ' (matched wording: ' + found.matched.map((m) => '"' + m + '"').join(', ') + ')' : '';
}

function quoteItem(
  id: string,
  role: EvidenceRole,
  found: FoundQuote,
  what: string
): EvidenceItem {
  return {
    id,
    kind: 'quote',
    role,
    stage: found.stage,
    observation: 'In ' + STAGE_NAME[found.stage] + ', ' + what + matchedNote(found) + '.',
    quote: found.quote,
    truncated: found.truncated
  };
}

export function buildEvidence(run: S02RunInput, signals: S02Signals): CoachingEvidence {
  const items: EvidenceItem[] = [];

  // Stages that make up the scorer's "all text": everything except commitments.
  const allStages: Array<[S02InputStage, string]> = [
    ['sbi', run.sbi],
    ['exploration', run.exploration],
    ['hypotheses', run.hypotheses],
    ['closing', run.closing]
  ];

  // --- Concerns the scorer flagged, each with the sentence that triggered it ---
  const concerns: Array<[boolean, string, Array<[S02InputStage, string]>, string[], string]> = [
    [signals.outageUsedAsEvidence, 'outage-referenced', allStages, OUTAGE_MARKERS, 'a sentence refers to the outage'],
    [signals.causalityAsserted, 'causality-asserted', allStages, CAUSALITY_MARKERS, 'a sentence uses wording that states a cause'],
    [signals.personalityDiagnosed, 'personality-diagnosed', allStages, PERSONALITY_MARKERS, 'a sentence describes a trait rather than a behaviour'],
    [signals.namedSourceUsedAsEvidence, 'named-source-in-opening', [['sbi', run.sbi]], NAMED_SOURCE_MARKERS, 'the opening points to a named source'],
    [signals.formalProcessInvoked, 'formal-process-invoked', allStages, FORMAL_PROCESS_MARKERS, 'a sentence invokes a formal process'],
    [signals.evidenceTraded, 'evidence-traded', [['exploration', run.exploration]], REBUTTAL_MARKERS, 'a sentence rebuts rather than asks'],
    [signals.reassuranceInsteadOfStructure, 'reassurance-used', [['closing', run.closing]], REASSURANCE_MARKERS.concat(RESOLUTION_MARKERS), 'the closing offers reassurance or implies resolution']
  ];
  for (const [flagged, id, stages, markers, what] of concerns) {
    if (!flagged) {
      continue;
    }
    const found = findQuote(stages, markers);
    items.push(
      found
        ? quoteItem(id, 'concern', found, what)
        : {
            id,
            kind: 'not-found',
            role: 'concern',
            stage: stages[0][0],
            observation:
              'The rules flagged this (' + id + '), but no single sentence could be isolated to quote, so none is shown.'
          }
    );
  }

  // --- Strengths with a quotable sentence ---
  if (signals.managerContributionNamed) {
    const found = findQuote(
      [['hypotheses', run.hypotheses], ['exploration', run.exploration]],
      MANAGER_CONTRIBUTION_MARKERS
    );
    if (found) {
      items.push(quoteItem('manager-contribution-named', 'strength', found, 'a sentence names your own part'));
    }
  } else {
    items.push({
      id: 'manager-contribution-not-recognised',
      kind: 'not-found',
      role: 'gap',
      stage: 'hypotheses',
      observation:
        'No sentence in Exploration or Hypotheses was recognised as naming your own part in what happened.'
    });
  }

  // --- Counts the rubric depends on, stated as facts about the text ---
  const questions = countQuestions(run.exploration);
  if (!signals.explorationBeforeRebuttal) {
    items.push({
      id: 'exploration-incomplete',
      kind: 'not-found',
      role: 'gap',
      stage: 'exploration',
      observation:
        wordCount(run.exploration) === 0
          ? 'Nothing was entered in Exploration.'
          : 'Exploration contains ' + questions + ' question mark' + (questions === 1 ? '' : 's') +
            '; the rubric looks for at least 3 questions and no rebuttal wording.'
    });
  }

  const hypotheses = countListItems(run.hypotheses);
  if (!signals.multipleHypothesesHeld) {
    items.push({
      id: 'hypotheses-incomplete',
      kind: 'not-found',
      role: 'gap',
      stage: 'hypotheses',
      observation:
        wordCount(run.hypotheses) === 0
          ? 'Nothing was entered in Hypotheses.'
          : 'Hypotheses lists ' + hypotheses + ' item' + (hypotheses === 1 ? '' : 's') +
            '; the rubric looks for at least 3, including explanations that do not locate the cause in Tomás, and your own part.'
    });
  }

  // --- Structured checkpoint fields ---
  if (run.checkpointDate && run.checkpointDate.trim()) {
    items.push({
      id: 'checkpoint-entered',
      kind: 'field',
      role: signals.datedCheckpoint ? 'strength' : 'gap',
      stage: 'checkpoint',
      observation:
        'You entered a follow-up date' +
        (run.checkpointInitiator.trim() ? ' and who starts it' : ' but not who starts it') +
        (signals.datedCheckpoint ? '.' : ', and the rules did not find every commitment dated before it.'),
      value: run.checkpointDate + (run.checkpointInitiator.trim() ? ' · starts: ' + run.checkpointInitiator.trim() : '')
    });
  } else {
    items.push({
      id: 'checkpoint-missing',
      kind: 'not-found',
      role: 'gap',
      stage: 'checkpoint',
      observation: 'No follow-up date was entered in the structured field.'
    });
  }

  // --- Stages with too little text to assess ---
  for (const stage of signals.compressedStages) {
    if (stage === 'commitments' || stage === 'closing') {
      continue;
    }
    const text = stage === 'sbi' ? run.sbi : stage === 'exploration' ? run.exploration : run.hypotheses;
    items.push({
      id: 'short-' + stage,
      kind: 'not-found',
      role: 'gap',
      stage: stage as S02InputStage,
      observation:
        wordCount(text) === 0
          ? 'Nothing was entered in ' + STAGE_NAME[stage as S02InputStage] + '.'
          : STAGE_NAME[stage as S02InputStage] + ' has ' + wordCount(text) + ' word' + (wordCount(text) === 1 ? '' : 's') + ', which is short for the rules to assess.'
    });
  }

  return { items, limits: EVIDENCE_LIMITS.slice() };
}
