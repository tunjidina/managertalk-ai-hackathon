import { listMyAssessments } from './assessmentRecords';
import { S02_CRITERION_KEYS } from './s02/criteria';

const mockQueries: Array<{ collection: string; field: string; op: string; value: unknown }> = [];
let mockDocs: Array<Record<string, unknown>> = [];
let mockError: { code: string } | null = null;

jest.mock('../lib/firebase', () => ({ getFirebaseDb: () => ({}) }));
jest.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ name }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  query: (source: { name: string }, constraint: { field: string; op: string; value: unknown }) => {
    mockQueries.push({ collection: source.name, ...constraint });
    return { source, constraint };
  },
  getDocs: async () => {
    if (mockError) {
      throw mockError;
    }
    return { forEach: (visit: (entry: { data: () => Record<string, unknown> }) => void) => mockDocs.forEach((data) => visit({ data: () => data })) };
  },
  runTransaction: jest.fn(),
  doc: jest.fn(),
  serverTimestamp: jest.fn()
}));

function stored(overrides: Record<string, unknown> = {}) {
  const criteria: Record<string, boolean> = {};
  S02_CRITERION_KEYS.forEach((key) => {
    criteria[key] = false;
  });
  return {
    userId: 'user-a',
    scenarioId: 'MT-S02',
    runId: 'r1',
    rubricVersion: 'mt-s02-rules-v1',
    tier: 'adequate',
    criteria,
    feedbackBranch: 'poor',
    createdAt: { toMillis: () => 1234 },
    ...overrides
  };
}

beforeEach(() => {
  mockQueries.length = 0;
  mockDocs = [];
  mockError = null;
});

test('only the signed-in user\'s records are requested: assessmentRecords filtered by userId', async () => {
  await listMyAssessments('user-a', 'MT-S02');
  expect(mockQueries).toEqual([{ collection: 'assessmentRecords', field: 'userId', op: '==', value: 'user-a' }]);
});

test('records are returned in the stored shape with their commit time', async () => {
  mockDocs = [stored()];
  const result = await listMyAssessments('user-a', 'MT-S02');
  expect(result.ok && result.records).toHaveLength(1);
  expect(result.ok && result.records[0].createdAtMs).toBe(1234);
  expect(result.ok && result.unreadable).toBe(0);
});

test('a record for another user or scenario is not returned, even if it reached the result', async () => {
  mockDocs = [stored({ userId: 'user-b' }), stored({ scenarioId: 'MT-S01', runId: 'r2' }), stored({ runId: 'r3' })];
  const result = await listMyAssessments('user-a', 'MT-S02');
  expect(result.ok && result.records.map((entry) => entry.runId)).toEqual(['r3']);
});

test('a malformed document is counted as unreadable, not guessed at and not silently dropped', async () => {
  mockDocs = [stored(), stored({ runId: 'bad', criteria: { behaviourNamed: true } }), { nonsense: true }];
  const result = await listMyAssessments('user-a', 'MT-S02');
  expect(result.ok && result.records).toHaveLength(1);
  expect(result.ok && result.unreadable).toBe(2);
});

test('a pending server timestamp reads back as no commit time yet', async () => {
  mockDocs = [stored({ createdAt: null })];
  const result = await listMyAssessments('user-a', 'MT-S02');
  expect(result.ok && result.records[0].createdAtMs).toBeNull();
});

test.each([
  ['permission-denied', 'permission-denied'],
  ['unavailable', 'unavailable'],
  ['unauthenticated', 'unauthenticated'],
  ['weird', 'unknown']
])('a %s failure is an error result, never an empty history', async (raw, expected) => {
  mockError = { code: raw };
  const result = await listMyAssessments('user-a', 'MT-S02');
  expect(result.ok).toBe(false);
  expect(result.ok === false && result.code).toBe(expected);
});

test('no user: refused without querying', async () => {
  const result = await listMyAssessments('', 'MT-S02');
  expect(result.ok).toBe(false);
  expect(mockQueries).toHaveLength(0);
});
