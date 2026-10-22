// src/engine/s02/prompts.ts
//
// Builds the MT-S02 model prompts from a scenario blueprint.
//
// Pure by design: no Firebase, no network, no browser APIs. The server
// (functions/) builds its prompts with this same file, copied into
// functions/src/shared/ by functions/scripts/sync-shared.mjs before each
// build, so the client and server can never disagree on prompt wording.
// Keep it free of imports other than the blueprint types.

import {
  ScenarioBlueprint,
  S02InputStage,
  stageDefinition
} from '../../types/scenarioBlueprint';

function section(heading: string, lines: string[]): string {
  return heading + '\n' + lines.map((line) => '- ' + line).join('\n');
}

/**
 * Serialises the Implementation Notes and the blueprint's constraints into
 * the system prompt. This is the whole of Section B plus the per-stage
 * requirements and prohibitions — the model is given the constraints, not
 * a paraphrase of them.
 */
export function buildSystemPrompt(blueprint: ScenarioBlueprint): string {
  const notes = blueprint.implementation_notes;

  const parts: string[] = [
    'SCENARIO: ' + blueprint.scenario_id + ' — ' + blueprint.title,
    'PRIMARY COMPETENCY: ' + blueprint.primary_competency,
    '',
    'CORE SCENARIO',
    blueprint.summary.core_scenario,
    '',
    section('BEHAVIOUR MODEL — EMPLOYEE', notes.behaviour_model_employee),
    '',
    section('BEHAVIOUR MODEL — MANAGER', notes.behaviour_model_manager),
    '',
    section('BRANCHING CONSTRAINTS', notes.branching_constraints),
    '',
    section('COMMITMENT CONSTRAINTS', notes.commitment_constraints),
    '',
    section('CLOSING CONSTRAINTS', notes.closing_constraints),
    '',
    section('SCORING CONSTRAINTS', notes.scoring_constraints),
    '',
    section('FEEDBACK CONSTRAINTS', notes.feedback_constraints),
    '',
    section('PROHIBITIONS', notes.prohibitions),
    '',
    section('AMBIGUITY RULES', notes.ambiguity_rules),
    '',
    section('EVIDENCE RULES', notes.evidence_rules),
    '',
    section('CONVERSATION FLOW RULES', notes.conversation_flow_rules),
    '',
    section(
      'EVIDENCE PACK (use only within stated limits)',
      blueprint.evidence_pack.map(
        (item) =>
          item.id +
          ' ' +
          item.source +
          ' — OBSERVED: ' +
          item.observed +
          ' — NOT PROVEN: ' +
          item.not_proven
      )
    ),
    '',
    section('AMBIGUITY THAT MUST REMAIN', blueprint.summary.ambiguity)
  ];

  return parts.join('\n');
}

/** The per-stage constraints, appended to the system prompt for one turn. */
export function buildStagePrompt(
  blueprint: ScenarioBlueprint,
  stage: S02InputStage
): string {
  const definition = stageDefinition(blueprint, stage);

  return [
    'STAGE: ' + stage,
    section('REQUIREMENTS', definition.requirements),
    section('PROHIBITED', definition.prohibited),
    section('AMBIGUITY TO PRESERVE', definition.ambiguity_to_preserve)
  ].join('\n');
}
