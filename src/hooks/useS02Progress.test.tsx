import { act, renderHook, waitFor } from '@testing-library/react';

import { useS02Progress } from './useS02Progress';
import { useAuthState } from '../store/authState';
import { useActiveScenarioState } from '../store/activeScenarioState';
import { useScenarioProgressState } from '../store/scenarioProgressState';
import { useS02SessionState } from '../store/s02SessionState';
import { S02_SCENARIO_ID } from '../data/scenarioRegistry';
import { loadScenarioState, saveScenarioState, markScenarioCompleted } from '../engine/scenarioState';

jest.mock('../engine/scenarioState', () => ({
  loadScenarioState: jest.fn(),
  saveScenarioState: jest.fn(),
  markScenarioCompleted: jest.fn()
}));
jest.mock('../engine/analytics', () => ({ logAnalyticsEvent: jest.fn(() => Promise.resolve()) }));

const load = loadScenarioState as jest.Mock;
const save = saveScenarioState as jest.Mock;
const complete = markScenarioCompleted as jest.Mock;

function savedProgress(uid: string, stage: string, completed = false) {
  return {
    ok: true,
    data: { userId: uid, scenarioId: S02_SCENARIO_ID, currentStep: 'overview', currentStepRaw: stage, completed }
  };
}

function signIn(uid: string) {
  useAuthState.setState({ status: 'signed_in', user: { uid, email: null, displayName: null } });
}

beforeEach(() => {
  load.mockReset();
  save.mockReset().mockResolvedValue({ ok: true, data: null });
  complete.mockReset().mockResolvedValue({ ok: true, data: null });
  useScenarioProgressState.getState().resetProgress();
  useS02SessionState.getState().resetSession();
  useActiveScenarioState.getState().setActiveScenario(S02_SCENARIO_ID);
  signIn('user-a');
});

afterEach(() => {
  useActiveScenarioState.getState().resetActiveScenario();
});

test('an unfinished saved stage waits for a choice and is neither restored nor overwritten', async () => {
  load.mockResolvedValue(savedProgress('user-a', 'exploration'));
  const { result } = renderHook(() => useS02Progress({ enabled: true, resume: true }));

  await waitFor(() => expect(result.current.pendingResumeStage).toBe('exploration'));
  expect(useS02SessionState.getState().stage).toBe('sbi');
  expect(save).not.toHaveBeenCalled();
  expect(load).toHaveBeenCalledWith('user-a', S02_SCENARIO_ID);
});

test('Resume restores the saved stage without writing anything', async () => {
  load.mockResolvedValue(savedProgress('user-a', 'exploration'));
  const { result } = renderHook(() => useS02Progress({ enabled: true, resume: true }));
  await waitFor(() => expect(result.current.pendingResumeStage).toBe('exploration'));

  act(() => result.current.resumeSaved());

  expect(result.current.pendingResumeStage).toBeNull();
  expect(useS02SessionState.getState().stage).toBe('exploration');
  expect(save).not.toHaveBeenCalled();
});

test("Start over stays at stage one and saves 'sbi' to this user's MT-S02 document only", async () => {
  load.mockResolvedValue(savedProgress('user-a', 'hypotheses'));
  const { result } = renderHook(() => useS02Progress({ enabled: true, resume: true }));
  await waitFor(() => expect(result.current.pendingResumeStage).toBe('hypotheses'));

  act(() => result.current.startOver());

  expect(useS02SessionState.getState().stage).toBe('sbi');
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save).toHaveBeenCalledWith('user-a', S02_SCENARIO_ID, 'sbi', false);
  expect(complete).not.toHaveBeenCalled();
});

test.each([
  ['no saved document', 'overview', false],
  ['a saved first stage', 'sbi', false]
])('%s shows no prompt', async (_label, stage, completed) => {
  load.mockResolvedValue(savedProgress('user-a', stage, completed));
  const { result } = renderHook(() => useS02Progress({ enabled: true, resume: true }));

  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(result.current.pendingResumeStage).toBeNull();
  expect(useS02SessionState.getState().stage).toBe('sbi');
});

test('a completed run shows no prompt and restores as before', async () => {
  load.mockResolvedValue(savedProgress('user-a', 'feedback', true));
  const { result } = renderHook(() => useS02Progress({ enabled: true, resume: true }));

  await waitFor(() => expect(useS02SessionState.getState().stage).toBe('feedback'));
  expect(result.current.pendingResumeStage).toBeNull();
});

test('signing out clears a pending choice, and the next account loads only its own document', async () => {
  load.mockImplementation(async (uid: string) =>
    uid === 'user-a' ? savedProgress('user-a', 'exploration') : savedProgress(uid, 'overview')
  );
  const { result } = renderHook(() => useS02Progress({ enabled: true, resume: true }));
  await waitFor(() => expect(result.current.pendingResumeStage).toBe('exploration'));

  act(() => {
    useAuthState.setState({ status: 'signed_out', user: null });
    useScenarioProgressState.getState().resetProgress();
  });
  expect(result.current.pendingResumeStage).toBeNull();

  act(() => signIn('user-b'));

  await waitFor(() => expect(load).toHaveBeenLastCalledWith('user-b', S02_SCENARIO_ID));
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(result.current.pendingResumeStage).toBeNull();
  expect(useS02SessionState.getState().stage).toBe('sbi');
  expect(save).not.toHaveBeenCalled();
});
