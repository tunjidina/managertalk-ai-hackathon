// functions/src/liveConfig.ts
//
// Chooses which model client answers /api/s02/turn.
//
// LIVE MODE IS OFF BY DEFAULT. The live client is built only when ALL of:
//   - mode is exactly "live" (S02_ENGINE_MODE; anything else means mock),
//   - an API key is present (NEBIUS_API_KEY secret),
//   - the caps are valid.
// In every other case the mock model answers, clearly marked as a mock, so a
// missing or misconfigured key can never make the service pretend to be live
// or call a provider. Pure of Firebase imports so it can be unit tested.

import { createNebiusModel, NEMOTRON_NANO_MODEL_ID } from './nebiusModel';
import { ModelClient, mockModel } from './mockModel';
import { createDailyLimiter, CounterStore, DailyLimiter, DEFAULT_LIMITS } from './rateLimit';

export interface LiveConfigInput {
  mode: string | undefined;
  apiKey: string | undefined;
  model: string | undefined;
  userDailyCap: number | undefined;
  globalDailyCap: number | undefined;
  /** Optional overrides for the live client; omitted means the client's own defaults. */
  maxTokens?: number;
  timeoutMs?: number;
}

export interface LiveConfigIo {
  fetchImpl: typeof fetch;
  /** Called only when live mode is selected, so mock mode never touches storage. */
  counterStore: () => CounterStore;
  now?: () => number;
}

export interface SelectedEngine {
  mode: 'mock' | 'live';
  model: ModelClient;
  limiter?: DailyLimiter;
}

export function selectEngine(input: LiveConfigInput, io: LiveConfigIo): SelectedEngine {
  const live = input.mode === 'live' && typeof input.apiKey === 'string' && input.apiKey.length > 0;
  if (!live) {
    return { mode: 'mock', model: mockModel };
  }

  const limits = {
    perUser: input.userDailyCap === undefined ? DEFAULT_LIMITS.perUser : input.userDailyCap,
    global: input.globalDailyCap === undefined ? DEFAULT_LIMITS.global : input.globalDailyCap
  };

  let limiter: DailyLimiter;
  try {
    limiter = createDailyLimiter({ store: io.counterStore(), limits, now: io.now });
  } catch (error) {
    // Invalid caps: refuse to go live rather than run unmetered.
    return { mode: 'mock', model: mockModel };
  }

  // A bad key shape or model id must not take the endpoint down: it is
  // reported as a mock service, never as a failed request.
  try {
    const model = input.model || NEMOTRON_NANO_MODEL_ID;
    return {
      mode: 'live',
      model: createNebiusModel({
        apiKey: input.apiKey as string,
        model,
        fetchImpl: io.fetchImpl,
        maxTokens: input.maxTokens,
        timeoutMs: input.timeoutMs,
        // Reasoning off is verified live for this exact Nano id only; never assumed for other models.
        chatTemplateKwargs: model === NEMOTRON_NANO_MODEL_ID ? { enable_thinking: false } : undefined
      }),
      limiter
    };
  } catch (error) {
    return { mode: 'mock', model: mockModel };
  }
}
