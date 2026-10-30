import mtS02 from '../data/scenarios/mt-s02.json';
import { ScenarioBlueprint } from '../types/scenarioBlueprint';
import { S02RunInput, scoreRun } from './s02/scoringEngine';
import { selectFeedback } from './s02/feedbackSelector';
import { S02_RUBRIC_VERSION } from './s02/rubricVersion';
import { S02_CRITERION_KEYS } from './s02/criteria';
import { assessmentDocId, buildAssessmentRecord, saveAssessment } from './assessmentRecords';

const mockStore = new Map<string, Record<string, unknown>>();
let mockFailWith: { code: string } | null = null;
let mockTransactionRuns = 0;

jest.mock('../lib/firebase', () => ({ getFirebaseDb: () => ({}) }));
jest.mock('firebase/firestore', () => ({
  doc: (_db: unknown, collection: string, id: string) => ({ path: collection + '/' + id }),
  serverTimestamp: () => ({ sentinel: 'serverTimestamp' }),
  runTransaction: async (_db: unknown, update: (transaction: unknown) => Promise<unknown>) => {
    mockTransactionRuns += 1;
    if (mockFailWith) {
      throw mockFailWith;
    }
    const transaction = {
      get: async (ref: { path: string }) => ({ exists: () => mockStore.has(ref.path) }),
      set: (ref: { path: string }, data: Record<string, unknown>) => mockStore.set(ref.path, data)
    };
    return update(transaction);
  }
}));

const blueprint = mtS02 as unknown as ScenarioBlueprint;
const SECRET_SBI = 'ZEBRA-SECRET-SBI-TEXT you went quiet in the review and the room noticed it';

function sampleScore() {
  const run: S02RunInput = {
    sbi: SECRET_SBI,
    exploration: 'ZEBRA-SECRET-EXPLORATION What happened? How did it land? What would help?',
    hypotheses: '- ZEBRA-SECRET-HYPOTHESIS one\n- two\n- three',
    managerCommitment: { owner: 'manager', action: 'ZEBRA-SECRET-ACTION share the agenda early', date: '2099-01-01', context: 'ZEBRA-SECRET-CONTEXT' },
    employeeCommitment: null,
    closing: 'ZEBRA-SECRET-CLOSING Don\'t worry, you\'ll be fine, this is resolved.',
    checkpointDate: '',
    checkpointInitiator: ''
  };
  const score = scoreRun(run, blueprint.scoring_rubric);
  return { score, feedback: selectFeedback(score.signals, score.tier, blueprint.feedback_logic) };
}

beforeEach(() => {
  mockStore.clear();
  mockFailWith = null;
  mockTransactionRuns = 0;
});

test('the record holds only ids, version, tier, 17 boolean criteria and the feedback branch', () => {
  const { score, feedback } = sampleScore();
  const record = buildAssessmentRecord('user-a', 'MT-S02', 'run-1', score, feedback);

  expect(Object.keys(record).sort()).toEqual(
    ['criteria', 'feedbackBranch', 'rubricVersion', 'runId', 'scenarioId', 'tier', 'userId']
  );
  expect(record.rubricVersion).toBe(S02_RUBRIC_VERSION);
  expect(record.tier).toBe(score.tier);
  expect(record.feedbackBranch).toBe(feedback.branch);
  expect(Object.keys(record.criteria).sort()).toEqual([...S02_CRITERION_KEYS].sort());
  expect(S02_CRITERION_KEYS).toHaveLength(17);
  expect(Object.values(record.criteria).every((value) => typeof value === 'boolean')).toBe(true);
});

test('no manager text, commitment, quotation or rubric wording reaches the record or the stored document', async () => {
  const { score, feedback } = sampleScore();
  const record = buildAssessmentRecord('user-a', 'MT-S02', 'run-1', score, feedback);
  await saveAssessment(record);

  const stored = JSON.stringify(Array.from(mockStore.values())) + JSON.stringify(record);
  expect(stored).not.toContain('ZEBRA-SECRET');
  expect(stored).not.toContain('Don\'t worry');
  for (const line of score.missed.concat(score.met)) {
    expect(stored).not.toContain(line);
  }
});

test('the document id is deterministic: user, scenario and run', () => {
  expect(assessmentDocId('user-a', 'MT-S02', 'run-1')).toBe('user-a_MT-S02_run-1');
});

test('a completed run is written once, with a server timestamp, at assessmentRecords/{id}', async () => {
  const { score, feedback } = sampleScore();
  const result = await saveAssessment(buildAssessmentRecord('user-a', 'MT-S02', 'run-1', score, feedback));

  expect(result).toEqual({ ok: true, duplicate: false });
  const written = mockStore.get('assessmentRecords/user-a_MT-S02_run-1') as Record<string, unknown>;
  expect(written).toBeDefined();
  expect(written.createdAt).toEqual({ sentinel: 'serverTimestamp' });
  expect(written.userId).toBe('user-a');
});

test('saving the same run again is a duplicate success and writes nothing new', async () => {
  const { score, feedback } = sampleScore();
  const record = buildAssessmentRecord('user-a', 'MT-S02', 'run-1', score, feedback);

  await saveAssessment(record);
  const before = JSON.stringify(Array.from(mockStore.entries()));
  const again = await saveAssessment(record);

  expect(again).toEqual({ ok: true, duplicate: true });
  expect(mockStore.size).toBe(1);
  expect(JSON.stringify(Array.from(mockStore.entries()))).toBe(before);
});

test('a different run creates a separate record', async () => {
  const { score, feedback } = sampleScore();
  await saveAssessment(buildAssessmentRecord('user-a', 'MT-S02', 'run-1', score, feedback));
  await saveAssessment(buildAssessmentRecord('user-a', 'MT-S02', 'run-2', score, feedback));
  expect(mockStore.size).toBe(2);
});

test.each([
  ['permission-denied', 'permission-denied'],
  ['unauthenticated', 'unauthenticated'],
  ['unavailable', 'unavailable'],
  ['deadline-exceeded', 'unavailable'],
  ['something-else', 'unknown']
])('a %s failure is reported as failed (%s), never as saved', async (raw, expected) => {
  mockFailWith = { code: raw };
  const { score, feedback } = sampleScore();
  const result = await saveAssessment(buildAssessmentRecord('user-a', 'MT-S02', 'run-1', score, feedback));

  expect(result.ok).toBe(false);
  expect(result.ok === false && result.code).toBe(expected);
  expect(result.ok === false && result.message.length).toBeGreaterThan(0);
  expect(mockStore.size).toBe(0);
});

test('a record with no user is refused without touching the database', async () => {
  const { score, feedback } = sampleScore();
  const result = await saveAssessment(buildAssessmentRecord('', 'MT-S02', 'run-1', score, feedback));
  expect(result.ok).toBe(false);
  expect(mockTransactionRuns).toBe(0);
});
