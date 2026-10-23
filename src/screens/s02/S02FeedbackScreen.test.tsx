import React from 'react';
import { act, render, screen, within } from '@testing-library/react';

import mtS02 from '../../data/scenarios/mt-s02.json';
import { ScenarioBlueprint } from '../../types/scenarioBlueprint';
import { currentRunInput, useS02SessionState } from '../../store/s02SessionState';
import { scoreRun } from '../../engine/s02/scoringEngine';
import { selectFeedback } from '../../engine/s02/feedbackSelector';
import S02FeedbackScreen from './S02FeedbackScreen';

const blueprint = mtS02 as unknown as ScenarioBlueprint;

function arrange(inputs: Partial<Record<'sbi' | 'exploration' | 'hypotheses' | 'closing', string>>) {
  act(() => {
    const store = useS02SessionState.getState();
    store.resetSession();
    Object.keys(inputs).forEach((stage) =>
      store.setInput(stage as 'sbi', (inputs as Record<string, string>)[stage])
    );
    const run = currentRunInput(useS02SessionState.getState());
    const score = scoreRun(run, blueprint.scoring_rubric);
    store.setScore(score);
    store.setFeedback(selectFeedback(score.signals, score.tier, blueprint.feedback_logic));
  });
}

describe('feedback screen: evidence is separate from interpretation', () => {
  test('shows the manager\'s own sentence verbatim under "What you actually wrote"', () => {
    const quoted = 'The outage last week shows the pattern.';
    arrange({ sbi: 'In the sprint review Aoife raised a concern. ' + quoted + ' Nobody followed up.' });
    render(<S02FeedbackScreen />);

    const evidence = screen.getByRole('region', { name: 'What you actually wrote' });
    const blockquote = within(evidence).getByText((_, element) => element?.tagName === 'BLOCKQUOTE');
    expect(blockquote).toHaveTextContent('“' + quoted + '”');
    expect(within(evidence).getByText(/Concern:/)).toBeInTheDocument();
    expect(evidence).toHaveTextContent('This section does not interpret intent.');
    expect(evidence).toHaveTextContent('does not measure intent, tone, or how Tomás received it');
  });

  test('labels the authored guidance as interpretation, not measurement', () => {
    arrange({ sbi: 'The outage was last week.' });
    render(<S02FeedbackScreen />);
    expect(screen.getByText(/^Coaching interpretation · /)).toBeInTheDocument();
    expect(screen.getByText(/not measured from your words and does not read your intent/)).toBeInTheDocument();
  });

  test('the quoted text is not repeated inside the authored guidance', () => {
    const quoted = 'The outage last week shows the pattern.';
    arrange({ sbi: quoted });
    render(<S02FeedbackScreen />);
    expect(screen.getAllByText(quoted, { exact: false })).toHaveLength(1);
  });

  test('with nothing entered it quotes nothing and says what was not entered', () => {
    arrange({});
    render(<S02FeedbackScreen />);
    const evidence = screen.getByRole('region', { name: 'What you actually wrote' });
    expect(within(evidence).queryByText((_, element) => element?.tagName === 'BLOCKQUOTE')).toBeNull();
    expect(evidence).toHaveTextContent('Nothing was entered in Exploration.');
    expect(evidence).toHaveTextContent('No follow-up date was entered in the structured field.');
    expect(evidence).not.toHaveTextContent('Strength:');
  });

  test('shows no evidence section before a score exists', () => {
    act(() => useS02SessionState.getState().resetSession());
    render(<S02FeedbackScreen />);
    expect(screen.queryByRole('region', { name: 'What you actually wrote' })).not.toBeInTheDocument();
  });
});
