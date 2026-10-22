import { create } from 'zustand';

// -----------------------------
// Screen Types (from your documents)
// -----------------------------

export type Screen =
  | 'scenario_overview'
  | 'overview'
  | 'evidence'
  | 'conversation_flow'
  | 'conversation'
  | 'commitment_builder'
  | 'closing'
  | 'scoring'
  | 'feedback'
  // Post-completion. Not a scenario step: it is reached from Feedback and
  // maps back to the 'feedback' step for progress and analytics purposes.
  | 'certificate'

  // Scenario selection.
  | 'scenario_select'

  // Account settings.
  | 'screen_profile'

  // MT-S02 runs its own stage set. Its JSON shape is incompatible with
  // MT-S01's, so it has its own screens rather than reusing the seven above.
  | 's02_sbi'
  | 's02_exploration'
  | 's02_hypotheses'
  | 's02_commitments'
  | 's02_closing'
  | 's02_scoring'
  | 's02_feedback';

// -----------------------------
// Navigation State Interface
// -----------------------------

export interface NavigationState {
  currentScreen: Screen;

  // Actions
  setCurrentScreen: (screen: Screen) => void;
  resetNavigation: () => void;
}

// -----------------------------
// Zustand Store
// -----------------------------

export const useNavigationState = create<NavigationState>((set) => ({
  currentScreen: 'overview',

  setCurrentScreen: (screen) => set({ currentScreen: screen }),

  resetNavigation: () =>
    set({
      currentScreen: 'overview',
    }),
}));
