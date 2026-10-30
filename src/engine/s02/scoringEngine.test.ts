import mtS02 from '../../data/scenarios/mt-s02.json';
import { ScenarioBlueprint } from '../../types/scenarioBlueprint';
import { buildEvidence } from './evidence';
import { S02RunInput, deriveSignals, scoreRun } from './scoringEngine';
import { S02_RUBRIC_VERSION } from './rubricVersion';
import { isBoundaryClarification, withoutBoundaryClarifications } from './textSignals';

const blueprint = mtS02 as unknown as ScenarioBlueprint;
const rubric = blueprint.scoring_rubric as never;
const NOW = Date.parse('2026-10-30T10:00:00Z');

const CLEAN_CLOSING =
  'So we agree to check in on 2026-11-20, and I will start that conversation. Does that work for you?';

function runWith(closing: string, overrides: Partial<S02RunInput> = {}): S02RunInput {
  return {
    sbi:
      'In the sprint review on Tuesday you said the rollback plan was fine and moved on when Maya asked a question, ' +
      'and the room went quiet afterwards, which I noticed.',
    exploration:
      'What was going on for you in that review? How did the question land? What would have helped you answer it? ' +
      'Is there something I could have set up differently?',
    hypotheses:
      '- The sprint review format leaves little room to think\n' +
      '- The rota that week was heavy\n' +
      '- I rushed the end of our 1:1 and did not follow up',
    managerCommitment: {
      owner: 'manager',
      action: 'Share the review agenda two days ahead',
      date: '2026-11-06',
      context: 'weekly sprint review'
    },
    employeeCommitment: {
      owner: 'employee',
      action: 'Bring one open question to each sprint review',
      date: '2026-11-10',
      context: 'weekly sprint review'
    },
    closing,
    checkpointDate: '2026-11-20',
    checkpointInitiator: 'Maya',
    ...overrides
  };
}

function reassurance(closing: string): boolean {
  return deriveSignals(runWith(closing), NOW).reassuranceInsteadOfStructure;
}

test('the rubric version is fixed for this rule set', () => {
  expect(S02_RUBRIC_VERSION).toBe('mt-s02-rules-v1');
});

describe('boundary clarifications are not reassurance', () => {
  test.each([
    'This conversation is not about your role, rating or promotion.',
    'Nothing here is a decision about your rating or promotion.',
    "We're not discussing promotion today.",
    'Neither your role nor your rating is being decided here.',
    'To be clear, this is not a performance review.',
    'I am not making any decision about your technical judgement.',
    'I cannot promise anything about your promotion, and this is not about that.'
  ])('%s', (sentence) => {
    expect(isBoundaryClarification(sentence)).toBe(true);
    expect(reassurance(sentence + ' ' + CLEAN_CLOSING)).toBe(false);
  });
});

describe('genuine reassurance is still detected', () => {
  test.each([
    "Don't worry, this won't affect your promotion.",
    'Your job is safe.',
    "You'll be fine - your rating will stay the same.",
    "I'll make sure you get promoted.",
    'There might be a bonus in it.',
    'This will not affect your rating.',
    'Do not worry about the pay rise.',
    'This is resolved, so we are done with this.'
  ])('%s', (sentence) => {
    expect(isBoundaryClarification(sentence)).toBe(false);
    expect(reassurance(sentence + ' ' + CLEAN_CLOSING)).toBe(true);
  });
});

describe('negation is judged one sentence at a time', () => {
  test('a boundary sentence does not excuse a separate reassuring sentence', () => {
    expect(reassurance("This is not about your promotion. Don't worry, you'll be fine. " + CLEAN_CLOSING)).toBe(true);
  });

  test('a negation elsewhere does not excuse reassurance about promotion', () => {
    expect(reassurance("This is not easy. Don't worry about your promotion. " + CLEAN_CLOSING)).toBe(true);
  });

  test('a bare promotion mention with no negation is still reassurance', () => {
    expect(reassurance('You will be promoted soon. ' + CLEAN_CLOSING)).toBe(true);
  });

  test('only the boundary sentences are removed from the text', () => {
    const text = "This is not about your rating. Don't worry, you'll be fine. We meet on 2026-11-20.";
    expect(withoutBoundaryClarifications(text)).toBe("Don't worry, you'll be fine. We meet on 2026-11-20.");
  });
});

describe('tier boundaries', () => {
  const boundary = 'This conversation is not about your role, rating or promotion.';

  test('a full run with the boundary clarification is excellent, not poor', () => {
    const result = scoreRun(runWith(boundary + ' ' + CLEAN_CLOSING), rubric, NOW);
    expect(result.signals.reassuranceInsteadOfStructure).toBe(false);
    expect(result.tier).toBe('excellent');
    expect(result.missed).toEqual([]);
  });

  test('the same run with genuine reassurance instead is poor', () => {
    const result = scoreRun(runWith("Don't worry, this won't affect your promotion. " + CLEAN_CLOSING), rubric, NOW);
    expect(result.signals.reassuranceInsteadOfStructure).toBe(true);
    expect(result.tier).toBe('poor');
  });

  test('missing an excellent criterion but no poor one is adequate', () => {
    const result = scoreRun(
      runWith(boundary + ' ' + CLEAN_CLOSING, {
        hypotheses: '- The rota that week was heavy\n- The meeting format is tight'
      }),
      rubric,
      NOW
    );
    expect(result.tier).toBe('adequate');
  });

  test('missing an adequate criterion is poor', () => {
    const result = scoreRun(runWith(boundary + ' ' + CLEAN_CLOSING, { sbi: 'You were quiet.' }), rubric, NOW);
    expect(result.tier).toBe('poor');
  });

  test('any other poor check still makes the run poor despite the boundary sentence', () => {
    const result = scoreRun(
      runWith(boundary + ' ' + CLEAN_CLOSING, { sbi: 'Because of you the outage dragged on and the team lost a day of work.' }),
      rubric,
      NOW
    );
    expect(result.tier).toBe('poor');
  });
});

describe('evidence', () => {
  test('a boundary sentence is not quoted as a reassurance concern', () => {
    const run = runWith('This conversation is not about your role, rating or promotion. ' + CLEAN_CLOSING);
    const signals = deriveSignals(run, NOW);
    const evidence = buildEvidence(run, signals);
    expect(evidence.items.some((item) => item.id === 'reassurance-used')).toBe(false);
  });

  test('genuine reassurance is quoted, and the boundary sentence is not', () => {
    const run = runWith("This is not about your promotion. Don't worry, you'll be fine. " + CLEAN_CLOSING);
    const evidence = buildEvidence(run, deriveSignals(run, NOW));
    const item = evidence.items.find((entry) => entry.id === 'reassurance-used');
    expect(item).toBeDefined();
    expect(item && item.quote).toContain("Don't worry");
    expect(item && item.quote).not.toContain('not about your promotion');
  });
});
