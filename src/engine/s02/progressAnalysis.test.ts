import { EXCELLENT_CRITERIA } from './criteria';
import { rec } from './progressFixtures';
import { analyseProgress } from './progressAnalysis';
import { S02_RUBRIC_VERSION } from './rubricVersion';

const [BEHAVIOUR, IMPACT, EXPLORATION, CONTRIBUTION, HYPOTHESES, COMMITMENTS, CHECKPOINT] = EXCELLENT_CRITERIA;

test('no records: nothing to analyse, nothing invented', () => {
  const analysis = analyseProgress([]);
  expect(analysis.latest).toBeNull();
  expect(analysis.baseline).toBeNull();
  expect(analysis.canCompare).toBe(false);
  expect(analysis.history).toEqual([]);
  expect(analysis.priorities).toEqual([]);
});

test('one current-version record is the baseline and nothing is compared with it', () => {
  const only = rec('r1', 1000, [BEHAVIOUR, IMPACT]);
  const analysis = analyseProgress([only]);

  expect(analysis.latest).toBe(only);
  expect(analysis.baseline).toBe(only);
  expect(analysis.canCompare).toBe(false);
  expect(analysis.comparison).toBeNull();
  expect(analysis.excellent.every((item) => item.change === null)).toBe(true);
  expect(analysis.excellent.find((item) => item.key === BEHAVIOUR)!.metInLatest).toBe(true);
});

test('two current-version records: baseline is the earliest, latest the newest, whatever the input order', () => {
  const first = rec('r1', 1000, [BEHAVIOUR]);
  const second = rec('r2', 2000, [BEHAVIOUR, IMPACT]);
  const analysis = analyseProgress([second, first]);

  expect(analysis.baseline).toBe(first);
  expect(analysis.latest).toBe(second);
  expect(analysis.canCompare).toBe(true);
  expect(analysis.history.map((entry) => entry.record.runId)).toEqual(['r2', 'r1']);
});

test('newly met, no longer met and unchanged are classified against the baseline', () => {
  const baseline = rec('r1', 1000, [BEHAVIOUR, IMPACT, EXPLORATION]);
  const latest = rec('r2', 2000, [BEHAVIOUR, EXPLORATION, CONTRIBUTION, HYPOTHESES]);
  const { comparison } = analyseProgress([baseline, latest]);

  expect(comparison!.newlyMet).toEqual([CONTRIBUTION, HYPOTHESES]);
  expect(comparison!.noLongerMet).toEqual([IMPACT]);
  expect(comparison!.unchanged).toEqual([BEHAVIOUR, EXPLORATION, COMMITMENTS, CHECKPOINT]);
  expect(comparison!.newlyMet.length + comparison!.noLongerMet.length + comparison!.unchanged.length).toBe(7);
});

test('development priorities are the unmet excellent criteria in rubric order', () => {
  const analysis = analyseProgress([rec('r1', 1000, [IMPACT, HYPOTHESES])]);
  expect(analysis.priorities).toEqual([BEHAVIOUR, EXPLORATION, CONTRIBUTION, COMMITMENTS, CHECKPOINT]);
});

test('every criterion met means no priorities', () => {
  expect(analyseProgress([rec('r1', 1000, [...EXCELLENT_CRITERIA])]).priorities).toEqual([]);
});

test('flagged poor checks are exactly those true in the latest record, in rubric order', () => {
  const flagged = rec('r1', 1000, ['reassuranceInsteadOfStructure', 'outageUsedAsEvidence', 'someExploration']);
  const analysis = analyseProgress([flagged]);
  expect(analysis.flaggedPoor).toEqual(['outageUsedAsEvidence', 'reassuranceInsteadOfStructure']);
});

describe('rubric versions', () => {
  const OLD = 'mt-s02-rules-v0';

  test('an older-version record is never the baseline and never compared', () => {
    const old = rec('old', 500, [BEHAVIOUR, IMPACT, EXPLORATION], { version: OLD });
    const current = rec('r1', 2000, [BEHAVIOUR]);
    const analysis = analyseProgress([old, current]);

    expect(analysis.baseline).toBe(current);
    expect(analysis.canCompare).toBe(false);
    expect(analysis.comparison).toBeNull();
    const flags = analysis.history.map((entry) => [entry.record.runId, entry.current]);
    expect(flags).toEqual([['r1', true], ['old', false]]);
  });

  test('with current-version records on both sides of an older one, only the current ones are compared', () => {
    const analysis = analyseProgress([
      rec('a', 1000, [BEHAVIOUR]),
      rec('old', 1500, [BEHAVIOUR, IMPACT, EXPLORATION, CONTRIBUTION], { version: OLD }),
      rec('b', 2000, [BEHAVIOUR, IMPACT])
    ]);
    expect(analysis.baseline!.runId).toBe('a');
    expect(analysis.latest!.runId).toBe('b');
    expect(analysis.comparison!.newlyMet).toEqual([IMPACT]);
    expect(analysis.comparison!.noLongerMet).toEqual([]);
  });

  test('when the latest record is from another version, no criteria, priorities or comparison are produced', () => {
    const analysis = analyseProgress([rec('r1', 1000, [BEHAVIOUR]), rec('new', 3000, [BEHAVIOUR, IMPACT], { version: 'mt-s02-rules-v9' })]);
    expect(analysis.latestIsCurrent).toBe(false);
    expect(analysis.canCompare).toBe(false);
    expect(analysis.comparison).toBeNull();
    expect(analysis.priorities).toEqual([]);
    expect(analysis.flaggedPoor).toEqual([]);
    expect(analysis.excellent.every((item) => item.change === null)).toBe(true);
  });

  test('records of only an older version have no baseline', () => {
    const analysis = analyseProgress([rec('old', 500, [BEHAVIOUR], { version: OLD })]);
    expect(analysis.baseline).toBeNull();
    expect(analysis.canCompare).toBe(false);
  });
});

test('a record whose commit time is still pending is treated as the newest', () => {
  const analysis = analyseProgress([rec('settled', 5000, [BEHAVIOUR]), rec('pending', null, [BEHAVIOUR, IMPACT])]);
  expect(analysis.latest!.runId).toBe('pending');
});
