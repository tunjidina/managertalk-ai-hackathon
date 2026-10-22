// -----------------------------
// Types (from your documents)
// -----------------------------

export type ConversationBranch =
  | 'guarded'
  | 'factual_challenge'
  | 'partial_openness'
  | 'polite_disengagement';

export interface BranchDetectionResult {
  branch: ConversationBranch;
  signalsMatched: string[];
}

// -----------------------------
// Signal Definitions (from JSON Blueprint)
// -----------------------------

const branchSignals: Record<ConversationBranch, string[]> = {
  guarded: [
    'short answers',
    'high formality',
    'minimal context',
    'it’s fine',
    'okay',
    'i don’t know',
    'brief reply',
  ],

  factual_challenge: [
    'precise dates',
    'workload references',
    'evidence-based counterpoints',
    'that’s not correct',
    'actually',
    'the report wasn’t late',
    'the segmentation error wasn’t mine',
  ],

  partial_openness: [
    'acknowledges disappointment',
    'describes promotion process',
    'i felt',
    'i was disappointed',
    'the promotion',
    'i don’t feel valued',
  ],

  polite_disengagement: [
    'agreeing to everything',
    'no meaningful commitment',
    'emotionally distant closure',
    'sure',
    'sounds good',
    'okay then',
  ],
};

// -----------------------------
// Branch Detection Logic
// -----------------------------

export function detectBranch(userMessage: string): BranchDetectionResult {
  const msg = userMessage.toLowerCase();
  const matched: { branch: ConversationBranch; signals: string[] }[] = [];

  for (const branch of Object.keys(branchSignals) as ConversationBranch[]) {
    const signals = branchSignals[branch];
    const matchedSignals = signals.filter((signal) =>
      msg.includes(signal.toLowerCase())
    );

    if (matchedSignals.length > 0) {
      matched.push({ branch, signals: matchedSignals });
    }
  }

  // If multiple branches match, choose the one with strongest signal density
  if (matched.length > 0) {
    matched.sort((a, b) => b.signals.length - a.signals.length);
    return {
      branch: matched[0].branch,
      signalsMatched: matched[0].signals,
    };
  }

  // Default fallback (from JSON Blueprint: polite disengagement is lowest-energy branch)
  return {
    branch: 'polite_disengagement',
    signalsMatched: [],
  };
}
