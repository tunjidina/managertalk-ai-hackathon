import { screenToStep, isLegacyScreen } from '../types/scenarioProgress';
import { Screen } from '../store/navigationState';

/** Test helper: the saved step a screen maps to, asserting it is not a legacy (progress-saving) screen. */
export function SCREEN_TO_STEP_FOR_TEST(screen: Screen): string {
  if (isLegacyScreen(screen)) {
    throw new Error(screen + ' must not be a legacy screen');
  }
  return screenToStep(screen);
}
