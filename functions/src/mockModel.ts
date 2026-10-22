// functions/src/mockModel.ts
//
// The only model client in P2-A. It never makes a network call and never
// echoes the manager's text. Every reply is unmistakably a mock: the model
// id is MOCK_MODEL_ID and every line starts with MOCK_MARKER, so it cannot
// be mistaken for a real model response even where a label only shows the
// lines.

import { TrustedPrompt } from './prompts';

/** The styles the client accepts (src/engine/s02/conversationEngine.ts). */
export const EMPLOYEE_RESPONSE_STYLES = [
  'technical_detail',
  'evidence_challenge',
  'procedural_compliance',
  'composed_disagreement'
] as const;
export type EmployeeResponseStyle = (typeof EMPLOYEE_RESPONSE_STYLES)[number];

/** What a model client returns; the handler checks it before replying. */
export interface ModelReply {
  style: EmployeeResponseStyle;
  lines: string[];
  model: string;
}

export type ModelClient = (prompt: TrustedPrompt) => Promise<ModelReply>;

export const MOCK_MODEL_ID = 'managertalk-mock';
export const MOCK_MARKER = '[Mock reply — no AI model was called]';

export const mockModel: ModelClient = async (prompt) => ({
  style: 'technical_detail',
  model: MOCK_MODEL_ID,
  lines: [
    MOCK_MARKER +
      ' The server received your "' +
      prompt.stage +
      '" message and built its prompt from ' +
      prompt.scenarioId +
      ' (' +
      prompt.messages.length +
      ' messages).',
    MOCK_MARKER + ' A generated reply will appear here once a model is connected.'
  ]
});
