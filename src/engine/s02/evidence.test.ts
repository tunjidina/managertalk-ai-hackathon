import mtS02 from '../../data/scenarios/mt-s02.json';
import { ScenarioBlueprint } from '../../types/scenarioBlueprint';
import {
  EVIDENCE_LIMITS,
  EvidenceItem,
  QUOTE_LIMIT,
  buildEvidence,
  findQuote,
  sentencesOf
} from './evidence';
import { S02RunInput, S02Signals, deriveSignals, scoreRun } from './scoringEngine';
import { CAUSALITY_MARKERS, OUTAGE_MARKERS, PERSONALITY_MARKERS } from './textSignals';

const blueprint = mtS02 as unknown as ScenarioBlueprint;

function runWith(overrides: Partial<S02RunInput> = {}): S02RunInput {
  return {
    sbi: '',
    exploration: '',
    hypotheses: '',
    managerCommitment: null,
    employeeCommitment: null,
    closing: '',
    checkpointDate: '',
    checkpointInitiator: '',
    ...overrides
  };
}

function evidenceFor(run: S02RunInput, signalOverrides: Partial<S02Signals> = {}) {
  const signals = { ...deriveSignals(run), ...signalOverrides };
  return buildEvidence(run, signals);
}

function byId(items: EvidenceItem[], id: string): EvidenceItem | undefined {
  return items.filter((item) => item.id === id)[0];
}

const OWNS_PART = 'I rushed that earlier feedback and I never followed up.';

describe('sentencesOf', () => {
  test('splits on . ! ? and line breaks, and every piece is an exact substring', () => {
    const text = 'First point.  Second point!\nThird one?  “Quoted” Tomás said so';
    const parts = sentencesOf(text);
    expect(parts).toEqual(['First point.', 'Second point!', 'Third one?', '“Quoted” Tomás said so']);
    parts.forEach((part) => expect(text.indexOf(part)).toBeGreaterThanOrEqual(0));
  });

  test('empty and whitespace-only text give nothing', () => {
    expect(sentencesOf('')).toEqual([]);
    expect(sentencesOf('   \n  ')).toEqual([]);
  });
});

describe('findQuote', () => {
  test('returns the exact sentence and the wording that matched, in the earliest stage given', () => {
    const found = findQuote(
      [['sbi', 'Nothing here. The outage was last week.'], ['closing', 'The outage again.']],
      OUTAGE_MARKERS
    );
    expect(found).toMatchObject({ stage: 'sbi', quote: 'The outage was last week.', truncated: false });
    expect(found?.matched).toContain('outage');
  });

  test('returns null when nothing matches or the text is empty', () => {
    expect(findQuote([['sbi', 'Plain observation of the meeting.']], OUTAGE_MARKERS)).toBeNull();
    expect(findQuote([['sbi', '']], OUTAGE_MARKERS)).toBeNull();
  });

  test('a long sentence is cut at the limit, still verbatim, and flagged as cut', () => {
    const long = 'The outage ' + 'and then some more words '.repeat(30);
    const found = findQuote([['sbi', long]], OUTAGE_MARKERS);
    expect(found?.truncated).toBe(true);
    expect(found?.quote).toHaveLength(QUOTE_LIMIT);
    expect(long.startsWith(found?.quote as string)).toBe(true);
  });
});

describe('concerns are backed by the manager\'s own sentence', () => {
  test('an outage reference quotes the sentence that mentions it, verbatim, with its stage', () => {
    const sbi = 'In the sprint review Aoife raised a concern. The outage last week shows the pattern. Nobody followed up.';
    const { items } = evidenceFor(runWith({ sbi }));
    const item = byId(items, 'outage-referenced') as EvidenceItem;
    expect(item.kind).toBe('quote');
    expect(item.role).toBe('concern');
    expect(item.stage).toBe('sbi');
    expect(item.quote).toBe('The outage last week shows the pattern.');
    expect(sbi.includes(item.quote as string)).toBe(true);
    expect(item.observation).toContain('Situation, behaviour, impact');
  });

  test('causal wording, trait wording and a named source each quote their own sentence', () => {
    const causal = 'Your reply ' + CAUSALITY_MARKERS[0] + ' the silence.';
    const trait = 'He is ' + PERSONALITY_MARKERS[0] + '.';
    const run = runWith({ sbi: 'Observed the review. ' + causal, exploration: trait + ' What did you mean?' });
    const { items } = evidenceFor(run);
    const causality = byId(items, 'causality-asserted');
    const personality = byId(items, 'personality-diagnosed');
    expect(causality?.quote).toBe(causal);
    expect(personality?.quote).toBe(trait);
    expect(personality?.stage).toBe('exploration');
  });

  test('a flagged signal with no isolatable sentence is reported as such, with no invented quote', () => {
    const { items } = evidenceFor(runWith({ sbi: 'Plain text.' }), { outageUsedAsEvidence: true });
    const item = byId(items, 'outage-referenced') as EvidenceItem;
    expect(item.kind).toBe('not-found');
    expect(item.quote).toBeUndefined();
    expect(item.observation).toContain('no single sentence could be isolated');
  });

  test('every quote is a verbatim substring of its stage text, whatever the formatting', () => {
    const run = runWith({
      sbi: '  Tomás’s “reply” in the review.\n\n  The outage — last week — shows it!  ',
      exploration: 'Why did you say that? I rushed this earlier.\r\nCaused by what?',
      closing: 'It will all be fine now.'
    });
    const { items } = evidenceFor(run);
    const texts: Record<string, string> = {
      sbi: run.sbi,
      exploration: run.exploration,
      hypotheses: run.hypotheses,
      closing: run.closing
    };
    const quotes = items.filter((item) => item.kind === 'quote');
    expect(quotes.length).toBeGreaterThan(0);
    quotes.forEach((item) => {
      expect(texts[item.stage as string].includes(item.quote as string)).toBe(true);
      expect(item.quote).toBe((item.quote as string).trim());
    });
  });
});

describe('strengths and gaps', () => {
  test('naming your own part is quoted as a strength', () => {
    const { items } = evidenceFor(runWith({ hypotheses: '1. ' + OWNS_PART }));
    const item = byId(items, 'manager-contribution-named') as EvidenceItem;
    expect(item.role).toBe('strength');
    expect(item.quote).toContain('I rushed that earlier feedback');
  });

  test('when it is not recognised, the item says "not recognised", never that it was absent', () => {
    const { items } = evidenceFor(runWith({ hypotheses: '1. Review format\n2. Rota change' }));
    const item = byId(items, 'manager-contribution-not-recognised') as EvidenceItem;
    expect(item.kind).toBe('not-found');
    expect(item.role).toBe('gap');
    expect(item.observation).toContain('was recognised as naming your own part');
    expect(item.observation).not.toMatch(/you did not|you failed|you never/i);
  });

  test('exploration and hypotheses gaps state the counts the rubric uses', () => {
    const { items } = evidenceFor(
      runWith({ exploration: 'How did it land? I wondered.', hypotheses: '1. Review format\n2. Rota change' })
    );
    expect(byId(items, 'exploration-incomplete')?.observation).toContain('1 question mark;');
    expect(byId(items, 'hypotheses-incomplete')?.observation).toContain('lists 2 items');
  });

  test('an unevaluable stage is called empty, not failed', () => {
    const { items } = evidenceFor(runWith());
    expect(byId(items, 'exploration-incomplete')?.observation).toBe('Nothing was entered in Exploration.');
    expect(byId(items, 'hypotheses-incomplete')?.observation).toBe('Nothing was entered in Hypotheses.');
    expect(byId(items, 'short-sbi')?.observation).toBe('Nothing was entered in Situation, behaviour, impact.');
  });
});

describe('checkpoint fields', () => {
  test('a date and initiator are reported as the entered values, not quoted from text', () => {
    const run = runWith({ checkpointDate: '2026-11-05', checkpointInitiator: 'Maya' });
    const dated = byId(evidenceFor(run, { datedCheckpoint: true }).items, 'checkpoint-entered') as EvidenceItem;
    expect(dated.kind).toBe('field');
    expect(dated.role).toBe('strength');
    expect(dated.value).toBe('2026-11-05 · starts: Maya');
    expect(dated.quote).toBeUndefined();

    const undated = byId(evidenceFor(run, { datedCheckpoint: false }).items, 'checkpoint-entered') as EvidenceItem;
    expect(undated.role).toBe('gap');
    expect(undated.observation).toContain('did not find every commitment dated before it');
  });

  test('a date without an initiator says so', () => {
    const item = byId(evidenceFor(runWith({ checkpointDate: '2026-11-05' })).items, 'checkpoint-entered') as EvidenceItem;
    expect(item.observation).toContain('but not who starts it');
  });

  test('no date means "no date was entered in the structured field"', () => {
    const item = byId(evidenceFor(runWith()).items, 'checkpoint-missing') as EvidenceItem;
    expect(item.kind).toBe('not-found');
    expect(item.observation).toBe('No follow-up date was entered in the structured field.');
  });
});

describe('what the evidence never does', () => {
  test('an empty session produces no quotes, no strengths and no concerns', () => {
    const { items } = evidenceFor(runWith());
    expect(items.filter((item) => item.kind === 'quote')).toHaveLength(0);
    expect(items.filter((item) => item.role === 'strength')).toHaveLength(0);
    expect(items.filter((item) => item.role === 'concern')).toHaveLength(0);
  });

  test('always carries the limits statements', () => {
    expect(evidenceFor(runWith()).limits).toEqual(EVIDENCE_LIMITS);
    expect(evidenceFor(runWith({ sbi: 'The outage.' })).limits).toEqual(EVIDENCE_LIMITS);
  });

  test('does not mutate the run or the signals, and does not change the score', () => {
    const run = runWith({ sbi: 'The outage was last week and I rushed it.', hypotheses: '1. a\n2. b\n3. c' });
    const signals = deriveSignals(run);
    const frozenRun = JSON.stringify(run);
    const frozenSignals = JSON.stringify(signals);
    const before = scoreRun(run, blueprint.scoring_rubric, 0);
    buildEvidence(run, signals);
    expect(JSON.stringify(run)).toBe(frozenRun);
    expect(JSON.stringify(signals)).toBe(frozenSignals);
    expect(scoreRun(run, blueprint.scoring_rubric, 0)).toEqual(before);
  });

  test('is deterministic', () => {
    const run = runWith({ sbi: 'The outage was last week.', exploration: OWNS_PART });
    expect(evidenceFor(run)).toEqual(evidenceFor(run));
  });
});
