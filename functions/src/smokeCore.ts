// functions/src/smokeCore.ts
//
// The logic behind scripts/smoke-live.mjs: a small, capped check that a
// Nebius Token Factory model answers in the shape this service expects.
// It lives here, not in the script, so it can be tested with a fake fetch.
//
// SAFE BY DEFAULT. Unless `live` is true, runSmoke() makes no request and
// needs no key: it only returns the plan. When live, it makes at most
// HARD_MAX_CALLS requests in total (one model-list call plus completions),
// prints only counts, timings, token usage and validated reply text, and
// redacts the key from everything it emits. It never prints headers, raw
// response bodies or reasoning text.

import { MAX_TOKENS_CEILING, NEBIUS_CHAT_COMPLETIONS_URL, NEMOTRON_NANO_MODEL_ID, NEMOTRON_SUPER_MODEL_ID } from './nebiusModel';
import { buildTrustedPrompt } from './prompts';
import { parseModelText } from './replyValidation';
import { ValidTurnRequest } from './validate';

export const HARD_MAX_CALLS = 20;
export const NEBIUS_MODELS_URL = 'https://api.tokenfactory.nebius.com/v1/models';

export interface SmokeVariant {
  name: string;
  model: string;
  /** Extra top-level request fields. Experimental variants only. */
  extraBody?: Record<string, unknown>;
  experimental?: boolean;
  /**
   * Other spellings of the same model that Nebius pages use. Tried, in order,
   * only if `model` is not in the live model list (exact or case-insensitive).
   */
  aliases?: string[];
}

export function defaultVariants(): SmokeVariant[] {
  return [
    {
      name: 'nano-default',
      model: NEMOTRON_NANO_MODEL_ID,
      // The Token Factory endpoints page lists Nano as NVIDIA/Nemotron-3-Nano-30B-A3B;
      // the cookbook's lowercase spelling is covered by the case-insensitive match.
      aliases: ['NVIDIA/Nemotron-3-Nano-30B-A3B']
    },
    { name: 'super-default', model: NEMOTRON_SUPER_MODEL_ID },
    {
      name: 'super-thinking-off (experimental)',
      model: NEMOTRON_SUPER_MODEL_ID,
      // Unverified: whether Token Factory forwards a chat-template flag.
      extraBody: { chat_template_kwargs: { enable_thinking: false } },
      experimental: true
    }
  ];
}

/** Fixed, non-sensitive manager messages. */
const SAMPLE_REQUESTS: ValidTurnRequest[] = [
  {
    scenarioId: 'MT-S02',
    stage: 'sbi',
    managerInput:
      'In the sprint review, when Aoife raised her concern, you answered at length and no owner was agreed. Afterwards the room went quiet and the point was not followed up.',
    priorTurns: []
  },
  {
    scenarioId: 'MT-S02',
    stage: 'exploration',
    managerInput:
      'What did you understand Aoife to be asking? And how did my earlier feedback land with you? I delivered it in a rush and never followed up.',
    priorTurns: []
  },
  {
    scenarioId: 'MT-S02',
    stage: 'hypotheses',
    managerInput:
      'I am holding a few explanations open: my rushed feedback, the review format, and the way juniors defer to domain experts. None of them is settled.',
    priorTurns: []
  }
];

export interface SmokeOptions {
  live: boolean;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  variants?: SmokeVariant[];
  /** Total request budget including the model-list call; clamped to HARD_MAX_CALLS. */
  maxCalls?: number;
  maxTokens?: number;
  timeoutMs?: number;
  /**
   * Print a short preview of each reply that passed validation. Off by
   * default: the default output is counts, timings and token usage only.
   * Raw bodies and reasoning are never printed in either mode.
   */
  showReplies?: boolean;
  /**
   * Proceed without verifying model ids against the model list. Off by
   * default: if the list cannot be read, no completions are sent. Use it only
   * to test a model the list endpoint does not show; ids are then unverified.
   */
  skipModelList?: boolean;
  emit: (line: string) => void;
}

export interface CallRecord {
  variant: string;
  status: number | 'timeout' | 'network';
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  finishReason?: string;
  contentNull: boolean;
  reasoningFieldPresent: boolean;
  validation: 'ok' | string;
}

export interface SmokeReport {
  live: boolean;
  plannedCalls: number;
  callsMade: number;
  modelListChecked: boolean;
  calls: CallRecord[];
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

export async function runSmoke(options: SmokeOptions): Promise<SmokeReport> {
  let variants = options.variants || defaultVariants();
  const requested = Number.isFinite(options.maxCalls) ? (options.maxCalls as number) : 6;
  const budget = Math.max(0, Math.min(Math.floor(requested), HARD_MAX_CALLS));
  const maxTokens = Math.max(1, Math.min(options.maxTokens || 600, MAX_TOKENS_CEILING));
  const timeoutMs = options.timeoutMs || 20_000;
  const key = options.apiKey || '';

  const emit = (line: string) => {
    options.emit(key ? line.split(key).join('[redacted]') : line);
  };

  // The model-list call uses one request of the budget unless it is skipped.
  const completionBudget = Math.max(0, options.skipModelList ? budget : budget - 1);
  const report: SmokeReport = {
    live: options.live,
    plannedCalls: options.live ? budget : 0,
    callsMade: 0,
    modelListChecked: false,
    calls: []
  };

  emit(options.live ? 'LIVE RUN: requests will be sent to Nebius Token Factory.' : 'DRY RUN: no request will be made.');
  emit('Completions URL: ' + NEBIUS_CHAT_COMPLETIONS_URL);
  emit('Budget: at most ' + budget + ' requests in total (hard cap ' + HARD_MAX_CALLS + '), max_tokens ' + maxTokens + '.');
  emit('Variants:');
  for (const variant of variants) {
    emit('  - ' + variant.name + ' -> ' + variant.model + (variant.extraBody ? ' + ' + JSON.stringify(variant.extraBody) : ''));
  }

  if (!options.live) {
    emit('Re-run with --live and SMOKE_CONFIRM=yes-make-live-calls to send requests. The key is read from NEBIUS_API_KEY.');
    return report;
  }

  if (!key) {
    throw new Error('NEBIUS_API_KEY is not set; refusing to run live.');
  }
  const fetchImpl = options.fetchImpl;
  if (!fetchImpl) {
    throw new Error('No fetch implementation supplied.');
  }
  if (budget < 1) {
    return report;
  }

  const authHeaders = { Authorization: 'Bearer ' + key, Accept: 'application/json' };

  // 1) Model list: confirm the exact ids before spending completions. If it
  //    cannot be read, stop: completions against unverified ids would be a
  //    guess, and each failed attempt can wait for the full timeout.
  if (options.skipModelList) {
    emit('Model list check SKIPPED (--skip-model-list): model ids are unverified.');
  } else {
    report.callsMade += 1;
    const listController = new AbortController();
    const listTimer = setTimeout(() => listController.abort(), timeoutMs);
    let ids: string[] | null = null;
    let failure = 'network error or timeout';
    try {
      const listed = await fetchImpl(NEBIUS_MODELS_URL, {
        method: 'GET',
        redirect: 'error',
        signal: listController.signal,
        headers: authHeaders
      });
      report.modelListChecked = listed.ok;
      if (listed.status === 401 || listed.status === 403) {
        emit('The model list request was refused (status ' + listed.status + '): check the key. No completions were sent.');
        return report;
      }
      if (!listed.ok) {
        failure = 'status ' + listed.status;
      } else {
        const body = (await listed.json()) as { data?: Array<{ id?: unknown }> };
        ids = (body.data || []).map((entry) => entry.id).filter((id): id is string => typeof id === 'string');
      }
    } catch (error) {
      failure = 'network error, timeout or unreadable response';
    } finally {
      clearTimeout(listTimer);
    }

    if (ids === null) {
      report.modelListChecked = false;
      emit('Model list could not be read (' + failure + '). No completions were sent. Re-run with --skip-model-list to test unverified ids.');
      return report;
    }

    emit('Model list returned ' + ids.length + ' models.');
    // Only spend completions on ids the platform actually lists. A case-only
    // difference, or a documented alias, is resolved to the listed spelling
    // for this run and reported, so the product default can be fixed from
    // real evidence.
    const checked: SmokeVariant[] = [];
    const findListed = (wanted: string): string | undefined =>
      ids!.indexOf(wanted) !== -1 ? wanted : ids!.find((id) => id.toLowerCase() === wanted.toLowerCase());
    for (const variant of variants) {
      const direct = findListed(variant.model);
      if (direct === variant.model) {
        emit('  ' + variant.model + ': exact match');
        checked.push(variant);
        continue;
      }
      if (direct) {
        emit('  ' + variant.model + ': CASE MISMATCH, using the listed spelling ' + direct + ' for this run');
        checked.push({ ...variant, model: direct });
        continue;
      }
      const aliasHit = (variant.aliases || []).map(findListed).find((id): id is string => !!id);
      if (aliasHit) {
        emit('  ' + variant.model + ': NOT LISTED, but its alias is; using ' + aliasHit + ' for this run');
        checked.push({ ...variant, model: aliasHit });
      } else {
        emit('  ' + variant.model + ': NOT FOUND, skipped');
      }
    }
    variants = checked;
    const nemotron = ids.filter((id) => id.toLowerCase().indexOf('nemotron') !== -1);
    emit('  Nemotron ids listed: ' + (nemotron.length ? nemotron.join(', ') : 'none'));
    if (variants.length === 0) {
      emit('None of the candidate models are listed. No completions were sent.');
      return report;
    }
  }

  // 2) Completions, round-robin over variants and sample prompts, within budget.
  let made = 0;
  while (made < completionBudget && variants.length > 0) {
    const variant = variants[made % variants.length];
    const prompt = buildTrustedPrompt(SAMPLE_REQUESTS[Math.floor(made / variants.length) % SAMPLE_REQUESTS.length]);
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const started = Date.now();
    const record: CallRecord = {
      variant: variant.name,
      status: 'network',
      latencyMs: 0,
      contentNull: true,
      reasoningFieldPresent: false,
      validation: 'no_reply'
    };

    report.callsMade += 1;
    made += 1;
    try {
      const response = await fetchImpl(NEBIUS_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        redirect: 'error',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: variant.model,
          messages: prompt.messages,
          max_tokens: maxTokens,
          temperature: 0.8,
          top_p: 0.95,
          stream: false,
          ...(variant.extraBody || {})
        })
      });
      record.status = response.status;
      if (response.ok) {
        const body = (await response.json()) as {
          usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
          choices?: Array<{ finish_reason?: unknown; message?: { content?: unknown; reasoning?: unknown; reasoning_content?: unknown } }>;
        };
        const choice = body.choices && body.choices[0];
        const message = choice && choice.message;
        record.promptTokens = typeof body.usage?.prompt_tokens === 'number' ? body.usage.prompt_tokens : undefined;
        record.completionTokens = typeof body.usage?.completion_tokens === 'number' ? body.usage.completion_tokens : undefined;
        record.finishReason = typeof choice?.finish_reason === 'string' ? choice.finish_reason : undefined;
        record.contentNull = !(message && typeof message.content === 'string' && message.content.trim().length > 0);
        record.reasoningFieldPresent = !!(message && (message.reasoning || message.reasoning_content));
        const parsed = parseModelText(message ? message.content : undefined);
        record.validation = parsed.ok ? 'ok' : parsed.reason;
        if (parsed.ok) {
          emit(
            options.showReplies
              ? '  [' + variant.name + '] reply: ' + parsed.lines.join(' / ').slice(0, 200)
              : '  [' + variant.name + '] reply passed validation (' + parsed.lines.length + ' lines); text not shown'
          );
        }
      }
    } catch (error) {
      record.status = timedOut ? 'timeout' : 'network';
    } finally {
      clearTimeout(timer);
      record.latencyMs = Date.now() - started;
    }
    report.calls.push(record);
  }

  // 3) Summary, per variant.
  emit('Summary:');
  for (const variant of variants) {
    const rows = report.calls.filter((call) => call.variant === variant.name);
    if (rows.length === 0) {
      continue;
    }
    const latencies = rows.map((row) => row.latencyMs);
    const ok = rows.filter((row) => row.validation === 'ok').length;
    const nulls = rows.filter((row) => row.contentNull).length;
    const reasoning = rows.filter((row) => row.reasoningFieldPresent).length;
    const promptTokens = rows.reduce((sum, row) => sum + (row.promptTokens || 0), 0);
    const completionTokens = rows.reduce((sum, row) => sum + (row.completionTokens || 0), 0);
    const statuses = rows.map((row) => String(row.status)).join(',');
    const tally = (values: string[]) => {
      const counts: Record<string, number> = {};
      values.forEach((value) => (counts[value] = (counts[value] || 0) + 1));
      return Object.keys(counts).sort().map((key) => key + ' x' + counts[key]).join(', ');
    };
    const hitCap = rows.filter((row) => typeof row.completionTokens === 'number' && row.completionTokens >= maxTokens).length;
    emit(
      '    outcomes: ' + tally(rows.map((row) => row.validation)) +
        '; finish: ' + tally(rows.map((row) => row.finishReason || 'none')) +
        '; reached max_tokens: ' + hitCap
    );
    emit(
      '  ' + variant.name + ': ' + rows.length + ' calls, ' + ok + ' valid, ' + nulls + ' empty-content, ' +
        reasoning + ' with reasoning field, latency p50 ' + percentile(latencies, 50) + ' ms / p95 ' + percentile(latencies, 95) +
        ' ms, tokens in ' + promptTokens + ' / out ' + completionTokens + ', statuses [' + statuses + ']'
    );
  }
  emit('Total requests made: ' + report.callsMade + ' of ' + budget + ' budgeted.');
  return report;
}
