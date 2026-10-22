import { ConversationStage, ConversationBranch, ScoreResult } from '../store/conversationState';

export interface ScoringInput {
  clarity: number;
  empathy: number;
  directness: number;
  stage: ConversationStage;
  branch: ConversationBranch | null;
  message: string;
}

export function scoreMessage(input: ScoringInput): ScoreResult {
  const { clarity, empathy, directness } = input;

  const avg = (clarity + empathy + directness) / 3;

  let tier: 'good' | 'mid' | 'poor' = 'mid';
  if (avg >= 4) tier = 'good';
  if (avg <= 2) tier = 'poor';

  return {
    tier,
    clarity,
    empathy,
    directness
  };
}
