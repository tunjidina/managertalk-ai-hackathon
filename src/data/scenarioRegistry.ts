// src/data/scenarioRegistry.ts
//
// The list of scenarios the app can run, and what kind of flow each uses.
//
// MT-S01 and MT-S02 have incompatible JSON shapes. Rather than force one
// schema onto both — which would mean rewriting Scenario 1's screens and
// its four working engines — the registry records which flow a scenario
// uses, and the selector routes to the matching screen set.

import mtS02 from './scenarios/mt-s02.json';
import { ScenarioBlueprint } from '../types/scenarioBlueprint';
import { scenarioData } from '../utils/jsonLoader';

/**
 * 'legacy' = MT-S01's seven screens and its stateMachine/closing/commitment
 * engines. 'blueprint' = the MT-S02 stage machine driven by a
 * ScenarioBlueprint. New scenarios should be 'blueprint'.
 */
export type ScenarioFlowKind = 'legacy' | 'blueprint';

export interface ScenarioRegistryEntry {
  scenarioId: string;
  title: string;
  difficulty: string;
  primaryCompetency: string;
  flowKind: ScenarioFlowKind;
}

/**
 * Validated at module load. A blueprint missing any required section is a
 * build-time authoring error, not a runtime surprise on stage four.
 */
export const REQUIRED_BLUEPRINT_FIELDS: string[] = [
  'scenario_id',
  'title',
  'difficulty',
  'primary_competency',
  'summary',
  'evidence_pack',
  'conversation_flow',
  'commitment_expectations',
  'scoring_rubric',
  'feedback_logic',
  'ui_screens',
  'implementation_notes'
];

export function missingBlueprintFields(candidate: unknown): string[] {
  if (typeof candidate !== 'object' || candidate === null) {
    return REQUIRED_BLUEPRINT_FIELDS.slice();
  }

  const record = candidate as Record<string, unknown>;

  return REQUIRED_BLUEPRINT_FIELDS.filter((field) => {
    const value = record[field];
    if (value === undefined || value === null) {
      return true;
    }
    if (Array.isArray(value)) {
      return value.length === 0;
    }
    return false;
  });
}

/** True when every required section is present and non-empty. */
export function isValidBlueprint(candidate: unknown): candidate is ScenarioBlueprint {
  return missingBlueprintFields(candidate).length === 0;
}

const MT_S02_BLUEPRINT = mtS02 as unknown as ScenarioBlueprint;

const BLUEPRINTS: Record<string, ScenarioBlueprint> = {
  'MT-S02': MT_S02_BLUEPRINT
};

export const SCENARIO_REGISTRY: ScenarioRegistryEntry[] = [
  {
    scenarioId: scenarioData.scenario_id,
    title: scenarioData.title,
    difficulty: scenarioData.difficulty,
    primaryCompetency: scenarioData.primary_competency,
    flowKind: 'legacy'
  },
  {
    scenarioId: MT_S02_BLUEPRINT.scenario_id,
    title: MT_S02_BLUEPRINT.title,
    difficulty: MT_S02_BLUEPRINT.difficulty,
    primaryCompetency: MT_S02_BLUEPRINT.primary_competency,
    flowKind: 'blueprint'
  }
];

export const S02_SCENARIO_ID = MT_S02_BLUEPRINT.scenario_id;

/** The MT-S02 blueprint. Returns null if the JSON failed validation. */
export function getBlueprint(scenarioId: string): ScenarioBlueprint | null {
  const blueprint = BLUEPRINTS[scenarioId];
  if (!blueprint || !isValidBlueprint(blueprint)) {
    return null;
  }
  return blueprint;
}

export function getRegistryEntry(scenarioId: string): ScenarioRegistryEntry | null {
  for (let i = 0; i < SCENARIO_REGISTRY.length; i += 1) {
    if (SCENARIO_REGISTRY[i].scenarioId === scenarioId) {
      return SCENARIO_REGISTRY[i];
    }
  }
  return null;
}
