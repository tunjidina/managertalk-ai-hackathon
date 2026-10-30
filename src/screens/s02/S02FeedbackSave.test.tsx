import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import mtS02 from '../../data/scenarios/mt-s02.json';
import { ScenarioBlueprint } from '../../types/scenarioBlueprint';
import { currentRunInput, useS02SessionState } from '../../store/s02SessionState';
import { useAuthState } from '../../store/authState';
import { scoreRun } from '../../engine/s02/scoringEngine';
import { selectFeedback } from '../../engine/s02/feedbackSelector';
import { saveAssessment } from '../../engine/assessmentRecords';
import S02FeedbackScreen from './S02FeedbackScreen';

jest.mock('../../engine/assessmentRecords', () => ({
  ...jest.requireActual('../../engine/assessmentRecords'),
  saveAssessment: jest.fn()
}));

const save = saveAssessment as jest.Mock;
const blueprint = mtS02 as unknown as ScenarioBlueprint;

beforeEach(() => {
  save.mockReset();
  act(() => {
    useAuthState.setState({ status: 'signed_in', user: { uid: 'user-a', email: null, displayName: null } });
    const store = useS02SessionState.getState();
    store.resetSession();
    store.setInput('sbi', 'You went quiet in the sprint review and the room noticed it afterwards.');
    const score = scoreRun(currentRunInput(useS02SessionState.getState()), blueprint.scoring_rubric);
    store.setScore(score);
    store.setFeedback(selectFeedback(score.signals, score.tier, blueprint.feedback_logic));
  });
});

test('a failed save is announced with a Retry that reuses the run and ends saved', async () => {
  save
    .mockResolvedValueOnce({ ok: false, code: 'permission-denied', message: 'The database rejected the request.' })
    .mockResolvedValueOnce({ ok: true, duplicate: false });
  const runId = useS02SessionState.getState().runId;

  await act(async () => {
    await useS02SessionState.getState().persistAssessment('user-a');
  });
  render(<S02FeedbackScreen />);

  expect(screen.getByRole('status')).toHaveTextContent('Assessment not saved. The database rejected the request.');
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  });

  expect(screen.getByRole('status')).toHaveTextContent('Assessment saved');
  expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  expect(save.mock.calls[1][0].runId).toBe(runId);
});

test('the status is never "saved" before the write succeeds', async () => {
  render(<S02FeedbackScreen />);
  expect(screen.getByRole('status')).toHaveTextContent('has not been saved yet');
  expect(screen.getByRole('status')).not.toHaveTextContent('Assessment saved');
});
