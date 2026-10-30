import { hasUnsavedAssessment, useS02SessionState } from '../store/s02SessionState';

export const UNSAVED_ASSESSMENT_WARNING =
  'Your last MT-S02 assessment has not been saved yet. Starting a new run now will discard it. Start a new run anyway?';

/**
 * True when it is fine to discard the current MT-S02 run: its assessment is
 * saved or there is none. Otherwise the user must confirm.
 */
export function confirmDiscardUnsavedAssessment(
  confirmFn: (message: string) => boolean = (message) => window.confirm(message)
): boolean {
  if (!hasUnsavedAssessment(useS02SessionState.getState())) {
    return true;
  }
  return confirmFn(UNSAVED_ASSESSMENT_WARNING);
}
