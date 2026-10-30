import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import ScenarioSelectScreen from './ScenarioSelectScreen';
import { useNavigationState } from '../store/navigationState';
import { SCREEN_TO_STEP_FOR_TEST } from './progressNavigationSupport';

jest.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

test('My progress sits beside Profile on the scenario list and opens the dashboard screen', () => {
  act(() => useNavigationState.setState({ currentScreen: 'scenario_select' }));
  render(<ScenarioSelectScreen />);

  expect(screen.getByRole('button', { name: 'Profile' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'My progress' }));
  expect(useNavigationState.getState().currentScreen).toBe('screen_progress');
});

test('the new screen is registered where exhaustive maps need it, and never maps to a saved MT-S01 step other than overview', () => {
  expect(SCREEN_TO_STEP_FOR_TEST('screen_progress')).toBe('overview');
});
