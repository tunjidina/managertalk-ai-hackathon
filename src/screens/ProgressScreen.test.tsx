import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

import ProgressScreen from './ProgressScreen';
import { listMyAssessments } from '../engine/assessmentRecords';
import { EXCELLENT_CRITERIA, S02CriterionKey, S02_CRITERION_KEYS } from '../engine/s02/criteria';
import { S02_RUBRIC_VERSION } from '../engine/s02/rubricVersion';
import { useAuthState } from '../store/authState';
import { useNavigationState } from '../store/navigationState';
import { rec } from '../engine/s02/progressFixtures';

jest.mock('../engine/assessmentRecords', () => ({
  ...jest.requireActual('../engine/assessmentRecords'),
  listMyAssessments: jest.fn()
}));

const list = listMyAssessments as jest.Mock;
const [BEHAVIOUR, IMPACT, EXPLORATION] = EXCELLENT_CRITERIA;

function ready(records: ReturnType<typeof rec>[], unreadable = 0) {
  list.mockResolvedValue({ ok: true, records, unreadable });
}

async function show() {
  await act(async () => {
    render(<ProgressScreen />);
  });
}

beforeEach(() => {
  list.mockReset();
  act(() => {
    useAuthState.setState({ status: 'signed_in', user: { uid: 'user-a', email: null, displayName: null } });
    useNavigationState.setState({ currentScreen: 'screen_progress' });
  });
});

test('always shows the honest disclosure and no score, percentage or competency framework', async () => {
  ready([rec('r1', 1000, [BEHAVIOUR])]);
  await show();
  expect(screen.getByText(`Rule-based assessment · ${S02_RUBRIC_VERSION}. This is not an AI judgement.`)).toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(/\d+\s?%|out of|six competenc|AI-generated/i);
});

test('no records: the empty state and a route back to the scenarios', async () => {
  ready([]);
  await show();
  expect(screen.getByText('Complete MT-S02 to establish your progress baseline.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Back to scenarios' }));
  expect(useNavigationState.getState().currentScreen).toBe('scenario_select');
});

test('loading is shown while the read is pending', async () => {
  list.mockReturnValue(new Promise(() => undefined));
  await show();
  expect(screen.getByRole('status')).toHaveTextContent('Loading your progress…');
  expect(screen.queryByText(/Complete MT-S02/)).not.toBeInTheDocument();
});

test('a failed read is an error with Try again, never the empty state', async () => {
  list.mockResolvedValueOnce({ ok: false, code: 'permission-denied', message: 'Your assessments could not be read because the database rejected the request.' });
  await show();
  expect(screen.getByRole('alert')).toHaveTextContent('could not be read because the database rejected the request');
  expect(screen.queryByText(/Complete MT-S02/)).not.toBeInTheDocument();

  ready([rec('r1', 1000, [BEHAVIOUR])]);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  });
  expect(screen.getByText(/This first assessment establishes your baseline/)).toBeInTheDocument();
});

test('only the signed-in user\'s id is requested, for MT-S02', async () => {
  ready([]);
  await show();
  expect(list).toHaveBeenCalledWith('user-a', 'MT-S02');
});

test('one record: baseline established, tier, date and version shown, no comparison claimed', async () => {
  ready([rec('r1', Date.parse('2026-10-30T10:00:00Z'), [BEHAVIOUR, IMPACT], { tier: 'adequate' })]);
  await show();

  const latest = screen.getByRole('region', { name: 'Latest assessment' });
  expect(latest).toHaveTextContent('Adequate');
  expect(latest).toHaveTextContent(`Rubric version: ${S02_RUBRIC_VERSION}`);
  expect(screen.getByText(/This first assessment establishes your baseline\. No comparison is available yet\./)).toBeInTheDocument();
  expect(screen.queryByText('Newly met')).not.toBeInTheDocument();
  expect(screen.queryByText(/since baseline/)).not.toBeInTheDocument();
});

test('two records: shows newly met, no longer met and unchanged, plus per-criterion status', async () => {
  ready([
    rec('r1', 1000, [BEHAVIOUR, IMPACT]),
    rec('r2', 2000, [BEHAVIOUR, EXPLORATION], { tier: 'excellent' })
  ]);
  await show();

  const baseline = screen.getByRole('region', { name: 'Compared with your baseline' });
  expect(within(baseline).getByRole('heading', { name: 'Newly met' }).nextSibling).toHaveTextContent('Exploration elicited before rebuttal.');
  expect(within(baseline).getByRole('heading', { name: 'No longer met' }).nextSibling).toHaveTextContent('Impact stated without causality.');
  expect(within(baseline).getByRole('heading', { name: 'Unchanged' }).nextSibling).toHaveTextContent('One specific observable behaviour named.');

  const criteria = screen.getByRole('region', { name: 'The seven excellent criteria' });
  expect(criteria.querySelectorAll('li')).toHaveLength(7);
  expect(criteria.querySelector('[data-criterion="behaviourNamed"]')).toHaveTextContent('Met');
  expect(criteria.querySelector('[data-criterion="behaviourNamed"]')).toHaveTextContent('Unchanged since baseline');
  expect(criteria.querySelector('[data-criterion="impactWithoutCausality"]')).toHaveTextContent('Not met');
  expect(criteria.querySelector('[data-criterion="impactWithoutCausality"]')).toHaveTextContent('No longer met since baseline');
  expect(criteria.querySelector('[data-criterion="explorationBeforeRebuttal"]')).toHaveTextContent('Newly met since baseline');
});

test('development priorities list the unmet excellent criteria in rubric order', async () => {
  ready([rec('r1', 1000, [IMPACT])]);
  await show();
  const items = within(screen.getByRole('region', { name: 'Development priorities' })).getAllByRole('listitem').map((li) => li.textContent);
  expect(items).toEqual([
    'One specific observable behaviour named.',
    'Exploration elicited before rebuttal.',
    'Manager contribution named as hypothesis.',
    'Multiple explanations held open.',
    'Bilateral commitments with dates and owners.',
    'Clear closing with dated checkpoint.'
  ]);
});

test('flagged poor checks use the rubric wording and do not claim a motive', async () => {
  ready([rec('r1', 1000, ['reassuranceInsteadOfStructure', 'noDatedCheckpoint'])]);
  await show();
  const flags = screen.getByRole('region', { name: 'Checks flagged in the latest assessment' });
  expect(within(flags).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
    'Reassurance used instead of structure.',
    'No dated checkpoint.'
  ]);
  expect(flags).toHaveTextContent('do not show what you meant');
});

test('no flagged checks says so plainly', async () => {
  ready([rec('r1', 1000, [BEHAVIOUR])]);
  await show();
  expect(screen.getByText('None of the six checks that lower a result were flagged.')).toBeInTheDocument();
});

test('mixed versions: the older record is labelled and excluded from the comparison', async () => {
  ready([
    rec('old', 500, [BEHAVIOUR, IMPACT, EXPLORATION], { version: 'mt-s02-rules-v0' }),
    rec('r1', 2000, [BEHAVIOUR])
  ]);
  await show();

  expect(screen.getByText(/This first assessment establishes your baseline/)).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Newly met' })).not.toBeInTheDocument();
  const history = screen.getByRole('region', { name: 'Assessment history' });
  const rows = within(history).getAllByRole('listitem');
  expect(rows).toHaveLength(2);
  expect(rows[0]).not.toHaveTextContent('Earlier rubric — not compared');
  expect(rows[1]).toHaveTextContent('mt-s02-rules-v0');
  expect(rows[1]).toHaveTextContent('Earlier rubric — not compared');
});

test('when the latest assessment used another rubric, criteria are not shown', async () => {
  ready([rec('r1', 1000, [BEHAVIOUR]), rec('new', 3000, [BEHAVIOUR], { version: 'mt-s02-rules-v9' })]);
  await show();
  expect(screen.queryByRole('region', { name: 'The seven excellent criteria' })).not.toBeInTheDocument();
  expect(screen.getByText(/Earlier rubric — not compared\. Criteria and priorities are shown only/)).toBeInTheDocument();
});

test('records that could not be read are reported, not hidden', async () => {
  ready([rec('r1', 1000, [BEHAVIOUR])], 2);
  await show();
  expect(screen.getByText('2 saved assessments could not be read and are not shown.')).toBeInTheDocument();
});

test('history lists date, tier and version for each attempt, newest first', async () => {
  ready([rec('r1', 1000, [], { tier: 'poor' }), rec('r2', 2000, [BEHAVIOUR], { tier: 'excellent' })]);
  await show();
  const rows = within(screen.getByRole('region', { name: 'Assessment history' })).getAllByRole('listitem');
  expect(rows[0]).toHaveTextContent('Excellent');
  expect(rows[1]).toHaveTextContent('Poor');
  expect(rows[0]).toHaveTextContent(S02_RUBRIC_VERSION);
});

test('the dashboard shows no manager text, only stored tiers, versions and rubric wording', async () => {
  ready([rec('r1', 1000, [BEHAVIOUR])]);
  await show();
  const known = new Set<S02CriterionKey>(S02_CRITERION_KEYS);
  expect(known.size).toBe(17);
  expect(document.body.textContent).not.toMatch(/quote|you wrote|your own words/i);
});
