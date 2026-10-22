// src/types/scenarioBlueprint.ts
//
// The shape of a ManagerTalk scenario blueprint (MT-S02 onwards).
//
// Scenario 1 predates this type and has a different, incompatible shape —
// it is loaded by utils/jsonLoader.ts and is deliberately untouched here.
// Nothing in this file affects MT-S01.

// -----------------------------
// Stages
// -----------------------------

/** The five authored conversation stages, plus the two terminal screens. */
export type S02Stage =
  | 'sbi'
  | 'exploration'
  | 'hypotheses'
  | 'commitments'
  | 'closing'
  | 'scoring'
  | 'feedback';

/** Strict progression. Index order is the only permitted path. */
export const S02_STAGE_ORDER: S02Stage[] = [
  'sbi',
  'exploration',
  'hypotheses',
  'commitments',
  'closing',
  'scoring',
  'feedback'
];

/** Stages that take manager input. Scoring and feedback are terminal. */
export type S02InputStage =
  | 'sbi'
  | 'exploration'
  | 'hypotheses'
  | 'commitments'
  | 'closing';

export const S02_INPUT_STAGES: S02InputStage[] = [
  'sbi',
  'exploration',
  'hypotheses',
  'commitments',
  'closing'
];

// -----------------------------
// Blueprint sections
// -----------------------------

export interface ScenarioStakes {
  employee: string;
  manager: string;
  team: string;
  organisation: string;
}

export interface ScenarioSummary {
  core_scenario: string;
  stakes: ScenarioStakes;
  ambiguity: string[];
}

export interface EvidenceItem {
  id: string;
  source: string;
  observed: string;
  not_proven: string;
}

/**
 * Every authored stage carries the same three lists. `requirements` and
 * `prohibited` drive the engine's constraint enforcement; the third is
 * rendered and never resolved.
 */
export interface StageDefinition {
  requirements: string[];
  prohibited: string[];
  ambiguity_to_preserve: string[];
}

export interface ConversationFlowDefinition {
  stage_1_sbi_statement: StageDefinition;
  stage_2_exploration: StageDefinition;
  stage_3_root_cause_hypotheses: StageDefinition;
  stage_4_commitment_builder: StageDefinition;
  stage_5_closing: StageDefinition;
}

export interface CommitmentExpectations {
  acceptable: string[];
  unacceptable: string[];
  structural: string[];
}

export type ScoreTier = 'excellent' | 'adequate' | 'poor';

export interface ScoringRubric {
  excellent: { criteria: string[] };
  adequate: { criteria: string[] };
  poor: { criteria: string[] };
}

/**
 * Four branches, not three. These are NOT the scoring tiers: 'avoidance'
 * and 'escalation' are orthogonal to how the run scored, so a run can be
 * adequate AND have escalated incorrectly. See engine/s02/feedbackSelector.
 */
export type FeedbackBranch = 'good' | 'poor' | 'avoidance' | 'escalation';

export interface FeedbackLogic {
  good: { focus: string[] };
  poor: { focus: string[] };
  avoidance: { focus: string[] };
  escalation: { focus: string[] };
}

// -----------------------------
// UI text
// -----------------------------
//
// Every string rendered by an S02 screen comes from here. Nothing in the
// components invents copy.

export interface StageScreenText {
  title: string;
  purpose: string;
  manager_guidance: string[];
  input_prompt: string;
}

export interface ScoringScreenText {
  title: string;
  purpose: string;
  display_text: {
    excellent: string[];
    adequate: string[];
    poor: string[];
  };
}

export interface FeedbackScreenText {
  title: string;
  purpose: string;
  display_template: string[];
  constraints: string[];
}

export interface UiScreens {
  sbi: StageScreenText;
  exploration: StageScreenText;
  hypotheses: StageScreenText;
  commitments: StageScreenText;
  closing: StageScreenText;
  scoring: ScoringScreenText;
  feedback: FeedbackScreenText;
}

// -----------------------------
// Implementation notes
// -----------------------------
//
// Serialised into the conversation engine's system prompt. Not rendered.

export interface ImplementationNotes {
  behaviour_model_employee: string[];
  behaviour_model_manager: string[];
  branching_constraints: string[];
  commitment_constraints: string[];
  closing_constraints: string[];
  scoring_constraints: string[];
  feedback_constraints: string[];
  prohibitions: string[];
  ambiguity_rules: string[];
  evidence_rules: string[];
  conversation_flow_rules: string[];
}

// -----------------------------
// The blueprint
// -----------------------------

export interface ScenarioBlueprint {
  scenario_id: string;
  title: string;
  difficulty: string;
  primary_competency: string;
  summary: ScenarioSummary;
  evidence_pack: EvidenceItem[];
  conversation_flow: ConversationFlowDefinition;
  commitment_expectations: CommitmentExpectations;
  scoring_rubric: ScoringRubric;
  feedback_logic: FeedbackLogic;
  ui_screens: UiScreens;
  implementation_notes: ImplementationNotes;
}

// -----------------------------
// Stage → authored definition
// -----------------------------

/** Maps a runtime stage onto its authored definition in the blueprint. */
export function stageDefinition(
  blueprint: ScenarioBlueprint,
  stage: S02InputStage
): StageDefinition {
  const flow = blueprint.conversation_flow;

  switch (stage) {
    case 'sbi':
      return flow.stage_1_sbi_statement;
    case 'exploration':
      return flow.stage_2_exploration;
    case 'hypotheses':
      return flow.stage_3_root_cause_hypotheses;
    case 'commitments':
      return flow.stage_4_commitment_builder;
    case 'closing':
      return flow.stage_5_closing;
    default:
      return flow.stage_1_sbi_statement;
  }
}

export function stageScreenText(
  blueprint: ScenarioBlueprint,
  stage: S02InputStage
): StageScreenText {
  return blueprint.ui_screens[stage];
}
