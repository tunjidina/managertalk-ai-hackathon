import { resetScenarioStateForSignOut } from './signOutReset';
import { useActiveScenarioState } from '../store/activeScenarioState';
import { useS02SessionState } from '../store/s02SessionState';
import { SCENARIO_REGISTRY, S02_SCENARIO_ID } from '../data/scenarioRegistry';

test("sign-out clears the previous account's MT-S02 session and active scenario", () => {
  useActiveScenarioState.getState().setActiveScenario(S02_SCENARIO_ID);
  const session = useS02SessionState.getState();
  session.restoreStage('exploration');
  session.setInput('sbi', 'Previous account typed this.');
  session.recordTurn(
    { stage: 'sbi', managerInput: 'Previous account typed this.', employeeLines: ['A reply.'], style: 'technical_detail', source: 'remote' } as never,
    []
  );

  resetScenarioStateForSignOut();

  const after = useS02SessionState.getState();
  expect(after.stage).toBe('sbi');
  expect(after.inputs.sbi).toBe('');
  expect(after.turns).toEqual([]);
  expect(after.score).toBeNull();
  expect(useActiveScenarioState.getState().scenarioId).toBe(SCENARIO_REGISTRY[0].scenarioId);
  expect(useActiveScenarioState.getState().flowKind).toBe('legacy');
});
