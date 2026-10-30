import mtS02 from '../data/scenarios/mt-s02.json';
import { ScenarioBlueprint } from '../types/scenarioBlueprint';
import { currentRunInput, hasUnsavedAssessment, useS02SessionState } from './s02SessionState';
import { scoreRun } from '../engine/s02/scoringEngine';
import { selectFeedback } from '../engine/s02/feedbackSelector';
import { resetScenarioStateForSignOut } from '../utils/signOutReset';
import { confirmDiscardUnsavedAssessment, UNSAVED_ASSESSMENT_WARNING } from '../utils/confirmDiscardUnsaved';
import { saveAssessment } from '../engine/assessmentRecords';

jest.mock('../engine/assessmentRecords', () => ({
  ...jest.requireActual('../engine/assessmentRecords'),
  saveAssessment: jest.fn()
}));

const save = saveAssessment as jest.Mock;
const blueprint = mtS02 as unknown as ScenarioBlueprint;

function finishRun() {
  const state = useS02SessionState.getState();
  state.setInput('sbi', 'You went quiet in the sprint review and the room noticed it afterwards.');
  const score = scoreRun(currentRunInput(useS02SessionState.getState()), blueprint.scoring_rubric);
  state.setScore(score);
  state.setFeedback(selectFeedback(score.signals, score.tier, blueprint.feedback_logic));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  save.mockReset();
  useS02SessionState.getState().resetSession();
});

test('each run has its own id, and a reset or sign-out regenerates it', () => {
  const first = useS02SessionState.getState().runId;
  expect(first.length).toBeGreaterThan(8);
  expect(useS02SessionState.getState().runId).toBe(first);

  useS02SessionState.getState().resetSession();
  const second = useS02SessionState.getState().runId;
  expect(second).not.toBe(first);

  resetScenarioStateForSignOut();
  expect(useS02SessionState.getState().runId).not.toBe(second);
});

test('nothing is saved before the run has a result, or without a user', async () => {
  await useS02SessionState.getState().persistAssessment('user-a');
  finishRun();
  await useS02SessionState.getState().persistAssessment('');
  expect(save).not.toHaveBeenCalled();
  expect(useS02SessionState.getState().assessmentSave.status).toBe('idle');
});

test('saving is awaited: saving first, saved only after the write succeeds', async () => {
  const write = deferred<{ ok: true; duplicate: boolean }>();
  save.mockReturnValue(write.promise);
  finishRun();

  const pending = useS02SessionState.getState().persistAssessment('user-a');
  expect(useS02SessionState.getState().assessmentSave.status).toBe('saving');

  write.resolve({ ok: true, duplicate: false });
  await pending;
  expect(useS02SessionState.getState().assessmentSave.status).toBe('saved');
  expect(save).toHaveBeenCalledTimes(1);
});

test('a double click saves once: a second call while saving, or after saved, does nothing', async () => {
  const write = deferred<{ ok: true; duplicate: boolean }>();
  save.mockReturnValue(write.promise);
  finishRun();

  const first = useS02SessionState.getState().persistAssessment('user-a');
  const second = useS02SessionState.getState().persistAssessment('user-a');
  write.resolve({ ok: true, duplicate: false });
  await Promise.all([first, second]);
  await useS02SessionState.getState().persistAssessment('user-a');

  expect(save).toHaveBeenCalledTimes(1);
});

test('a failed save is reported as failed, with a message, and is never shown as saved', async () => {
  save.mockResolvedValue({ ok: false, code: 'unavailable', message: 'Could not reach the database. Your assessment is not saved.' });
  finishRun();

  await useS02SessionState.getState().persistAssessment('user-a');

  const { assessmentSave } = useS02SessionState.getState();
  expect(assessmentSave.status).toBe('failed');
  expect(assessmentSave.message).toContain('not saved');
  expect(hasUnsavedAssessment(useS02SessionState.getState())).toBe(true);
});

test('retry writes the same record id (original runId) and ends saved', async () => {
  save
    .mockResolvedValueOnce({ ok: false, code: 'unavailable', message: 'down' })
    .mockResolvedValueOnce({ ok: true, duplicate: false });
  finishRun();
  const runId = useS02SessionState.getState().runId;

  await useS02SessionState.getState().persistAssessment('user-a');
  await useS02SessionState.getState().retryAssessmentSave('user-a');

  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[0][0].runId).toBe(runId);
  expect(save.mock.calls[1][0].runId).toBe(runId);
  expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0]);
  expect(useS02SessionState.getState().assessmentSave.status).toBe('saved');
  expect(hasUnsavedAssessment(useS02SessionState.getState())).toBe(false);
});

test('retry does nothing unless the last save failed', async () => {
  save.mockResolvedValue({ ok: true, duplicate: false });
  finishRun();
  await useS02SessionState.getState().retryAssessmentSave('user-a');
  expect(save).not.toHaveBeenCalled();
});

test('a duplicate response (record already exists) counts as saved', async () => {
  save.mockResolvedValue({ ok: true, duplicate: true });
  finishRun();
  await useS02SessionState.getState().persistAssessment('user-a');
  expect(useS02SessionState.getState().assessmentSave.status).toBe('saved');
});

test('a save that finishes after a reset cannot mark the new run as saved or failed', async () => {
  const write = deferred<{ ok: true; duplicate: boolean }>();
  save.mockReturnValue(write.promise);
  finishRun();
  const oldRun = useS02SessionState.getState().runId;

  const pending = useS02SessionState.getState().persistAssessment('user-a');
  useS02SessionState.getState().resetSession();
  const newRun = useS02SessionState.getState().runId;
  expect(newRun).not.toBe(oldRun);

  write.resolve({ ok: true, duplicate: false });
  await pending;

  expect(useS02SessionState.getState().runId).toBe(newRun);
  expect(useS02SessionState.getState().assessmentSave.status).toBe('idle');
});

test('a late failure from the old run does not show as a failure on the new run', async () => {
  const write = deferred<{ ok: false; code: string; message: string }>();
  save.mockReturnValue(write.promise);
  finishRun();

  const pending = useS02SessionState.getState().persistAssessment('user-a');
  useS02SessionState.getState().resetSession();
  write.resolve({ ok: false, code: 'unavailable', message: 'down' });
  await pending;

  expect(useS02SessionState.getState().assessmentSave.status).toBe('idle');
});

test('the saved record describes the run as it finished, even if inputs change while saving', async () => {
  const write = deferred<{ ok: true; duplicate: boolean }>();
  save.mockReturnValue(write.promise);
  finishRun();
  const tier = useS02SessionState.getState().score?.tier;

  const pending = useS02SessionState.getState().persistAssessment('user-a');
  useS02SessionState.getState().setInput('sbi', '');
  write.resolve({ ok: true, duplicate: false });
  await pending;

  expect(save.mock.calls[0][0].tier).toBe(tier);
});

describe('warning before a new run discards an unsaved assessment', () => {
  test('no result yet, or a saved assessment: no prompt', async () => {
    const ask = jest.fn(() => true);
    expect(confirmDiscardUnsavedAssessment(ask)).toBe(true);

    save.mockResolvedValue({ ok: true, duplicate: false });
    finishRun();
    await useS02SessionState.getState().persistAssessment('user-a');
    expect(confirmDiscardUnsavedAssessment(ask)).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });

  test('failed or still saving: asks, and honours the answer', async () => {
    save.mockResolvedValue({ ok: false, code: 'unavailable', message: 'down' });
    finishRun();
    await useS02SessionState.getState().persistAssessment('user-a');

    const decline = jest.fn(() => false);
    expect(confirmDiscardUnsavedAssessment(decline)).toBe(false);
    expect(decline).toHaveBeenCalledWith(UNSAVED_ASSESSMENT_WARNING);
    expect(useS02SessionState.getState().score).not.toBeNull();

    expect(confirmDiscardUnsavedAssessment(() => true)).toBe(true);
  });

  test('a result that was never submitted for saving also asks', () => {
    finishRun();
    const ask = jest.fn(() => false);
    expect(confirmDiscardUnsavedAssessment(ask)).toBe(false);
    expect(ask).toHaveBeenCalledTimes(1);
  });
});
