// src/engine/s02/conversationEngine.ts
//
// The model wrapper for MT-S02.
//
// TWO ADAPTERS, ONE INTERFACE.
//
//   ScriptedConversationEngine — default. Answers with Tomás's authored,
//                              approved lines (./scriptedDialogue), chosen by
//                              rule. No network, no key, no generated text.
//                              Every reply is labelled "Scripted". The app
//                              ships and every screen, the stage machine and
//                              the validators are exercisable without a model.
//
//   RemoteConversationEngine — posts to a server endpoint that holds the
//                              API key. It is NOT configured with a key
//                              here, and must not be: Create React App
//                              inlines every REACT_APP_* value into the
//                              public bundle, so a key placed in the
//                              client is published with the site. The
//                              endpoint is expected to be a Cloud Function
//                              or equivalent that adds the key server-side.
//
// When an endpoint is configured, createConversationEngine() wraps the
// remote adapter in FallbackConversationEngine: a remote failure (timeout,
// outage, auth rejection, malformed reply) falls back to the scripted engine, and the
// response says so through `source` and `fallbackReason`.
//
// Nothing here throws. Every call returns a discriminated result, matching
// engine/scenarioState.ts.

import {
  ScenarioBlueprint,
  S02InputStage,
  stageDefinition
} from '../../types/scenarioBlueprint';
import {
  CAUSALITY_MARKERS,
  NAMED_SOURCE_MARKERS,
  OUTAGE_MARKERS,
  PERSONALITY_MARKERS,
  REBUTTAL_MARKERS,
  containsAny,
  countQuestions,
  wordCount
} from './textSignals';
import { getFirebaseAuth, isFirebaseConfigured } from '../../lib/firebase';
import {
  EMPLOYEE_RESPONSE_STYLES,
  EmployeeResponseStyle
} from './styleSelection';
import { selectScriptedReply } from './scriptedDialogue';

// -----------------------------
// Types
// -----------------------------

// The style type and chooser live in ./styleSelection so the server can share
// them. Re-exported here so existing imports keep working.
export type { EmployeeResponseStyle } from './styleSelection';

export interface EngineTurn {
  stage: S02InputStage;
  managerInput: string;
  employeeLines: string[];
  style: EmployeeResponseStyle;
  /** Which adapter produced the turn. Optional: turns are in-memory only. */
  source?: 'stub' | 'remote';
  /** Model identifier reported by the remote endpoint, when there is one. */
  model?: string;
  /** Why the remote engine was bypassed, when the stub answered in its place. */
  fallbackReason?: EngineErrorCode;
}

export interface EngineRequest {
  blueprint: ScenarioBlueprint;
  stage: S02InputStage;
  managerInput: string;
  priorTurns: EngineTurn[];
}

export interface EngineResponse {
  style: EmployeeResponseStyle;
  /** Rendered as Tomás's turn. Composed from blueprint strings only. */
  lines: string[];
  /** Blueprint prohibitions the manager input tripped, verbatim. */
  constraintViolations: string[];
  /** Which adapter produced this. Surfaced so a stub is never mistaken for a model. */
  source: 'stub' | 'remote';
  /** Model identifier reported by the remote endpoint, when there is one. */
  model?: string;
  /** Set when a remote engine failed and the stub answered instead. */
  fallbackReason?: EngineErrorCode;
}

export type EngineErrorCode =
  | 'not-configured'
  | 'unavailable'
  | 'invalid-request'
  | 'invalid-response'
  | 'unauthenticated'
  | 'rate-limited'
  | 'daily-limit-user'
  | 'daily-limit-global'
  | 'timeout'
  | 'unknown';

export type EngineResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: EngineErrorCode; message: string };

export interface ConversationEngine {
  readonly kind: 'stub' | 'remote';
  respond(request: EngineRequest): Promise<EngineResult<EngineResponse>>;
}

// -----------------------------
// System prompt
// -----------------------------

// The prompt builders live in ./prompts so the server can share them
// without pulling in the browser Firebase SDK this module imports.
// Re-exported here so existing imports keep working.
export { buildSystemPrompt, buildStagePrompt } from './prompts';

// -----------------------------
// Constraint enforcement
// -----------------------------

/**
 * Which of the stage's authored prohibitions the manager input tripped.
 * Returns the blueprint's own strings so nothing is paraphrased back at
 * the user.
 */
export function detectStageViolations(
  blueprint: ScenarioBlueprint,
  stage: S02InputStage,
  managerInput: string
): string[] {
  const definition = stageDefinition(blueprint, stage);
  const violations: string[] = [];

  const tripped = (needle: string): boolean => {
    for (let i = 0; i < definition.prohibited.length; i += 1) {
      if (definition.prohibited[i].toLowerCase().indexOf(needle) !== -1) {
        return true;
      }
    }
    return false;
  };

  const add = (needle: string) => {
    for (let i = 0; i < definition.prohibited.length; i += 1) {
      if (
        definition.prohibited[i].toLowerCase().indexOf(needle) !== -1 &&
        violations.indexOf(definition.prohibited[i]) === -1
      ) {
        violations.push(definition.prohibited[i]);
      }
    }
  };

  if (tripped('outage') && containsAny(managerInput, OUTAGE_MARKERS)) {
    add('outage');
  }

  if (tripped('caused silence') && containsAny(managerInput, CAUSALITY_MARKERS)) {
    add('caused silence');
  }

  if (tripped('nadia') && containsAny(managerInput, NAMED_SOURCE_MARKERS)) {
    add('nadia');
  }

  if (tripped('trading evidence') && containsAny(managerInput, REBUTTAL_MARKERS)) {
    add('trading evidence');
  }

  if (tripped('correcting his account') && containsAny(managerInput, REBUTTAL_MARKERS)) {
    add('correcting his account');
  }

  if (tripped('personality') && containsAny(managerInput, PERSONALITY_MARKERS)) {
    add('personality');
  }

  if (
    tripped('softening into a question') &&
    stage === 'sbi' &&
    countQuestions(managerInput) > 0 &&
    wordCount(managerInput) > 0
  ) {
    add('softening into a question');
  }

  return violations;
}

// -----------------------------
// Scripted adapter
// -----------------------------

/**
 * The default engine, and the fallback for every remote failure. It answers
 * with Tomás's authored lines (./scriptedDialogue), chosen by rule: no model,
 * no network and no generated text. Selection is deterministic for a given
 * session: variants alternate with the turns already taken in the stage, and
 * a Considering reply is restrained first and fuller later.
 *
 * Its responses carry source 'stub', so the screen labels every reply
 * "Scripted reply" (see sourceLabel), never as AI-generated.
 */
export class ScriptedConversationEngine implements ConversationEngine {
  readonly kind = 'stub' as const;

  async respond(request: EngineRequest): Promise<EngineResult<EngineResponse>> {
    const { blueprint, stage, managerInput } = request;

    if (wordCount(managerInput) === 0) {
      return {
        ok: false,
        code: 'invalid-response',
        message: 'No manager input was provided for this stage.'
      };
    }

    const violations = detectStageViolations(blueprint, stage, managerInput);
    const selection = selectScriptedReply({
      stage,
      managerInput,
      priorTurns: request.priorTurns,
      violated: violations.length > 0
    });

    return {
      ok: true,
      data: {
        style: selection.style,
        lines: selection.reply.lines.slice(),
        constraintViolations: violations,
        source: 'stub'
      }
    };
  }
}

// -----------------------------
// Remote adapter
// -----------------------------

export const DEFAULT_REMOTE_TIMEOUT_MS = 20000;

/**
 * The model id the mock backend (functions/src/mockModel.ts) reports. A
 * reply carrying exactly this id was produced by no AI model and must be
 * labelled that way; any other id, even one containing "mock", is treated
 * as a real model's.
 */
export const MOCK_MODEL_ID = 'managertalk-mock';

/** Longest manager input sent to the endpoint. Mirrors the server cap. */
export const MAX_MANAGER_INPUT_CHARS = 2000;

/** Only the most recent turns are sent; older context adds cost, not realism. */
export const MAX_PRIOR_TURNS = 10;

const MAX_RESPONSE_LINES = 6;
const MAX_RESPONSE_LINE_CHARS = 600;
const MAX_MODEL_ID_CHARS = 120;

const TIMEOUT_RESULT: { ok: false; code: EngineErrorCode; message: string } = {
  ok: false,
  code: 'timeout',
  message: 'The conversation service took too long to reply.'
};

// WIRE CONTRACT — everything this client sends:
//
//   POST <endpoint>
//   Authorization: Bearer <Firebase ID token>
//   {
//     scenarioId:   string          blueprint.scenario_id, e.g. "MT-S02"
//     stage:        S02InputStage   the stage ID ("sbi", "exploration", …)
//     managerInput: string          1–MAX_MANAGER_INPUT_CHARS characters
//     priorTurns:   [{ stage, managerInput, employeeLines }]
//                                   at most MAX_PRIOR_TURNS, most recent last
//   }
//
// No prompt text is sent. The server must build the system and stage
// prompts from its own trusted copy of the blueprint (buildSystemPrompt and
// buildStagePrompt below are exported for that), never from the request.
// Worst case is one 2,000-character input plus ten prior turns of up to
// 2,000 + 6 × 600 characters: about 58,000 UTF-16 characters. Encoded as
// UTF-8 that is up to about 175 KB (non-Latin text takes up to 3 bytes per
// character), so the server's 256 KiB raw-body limit accepts every request
// this client can produce.

// ENDPOINT POLICY — where the Firebase ID token may be sent.
//
//   production  every build except `npm start`: Jest, `npm run build`, the
//               demo, and any unknown or missing NODE_ENV. Only an exact
//               same-origin path from ALLOWED_API_PATHS is accepted.
//   development `npm start` only (NODE_ENV exactly "development"). The
//               same paths, plus http/https URLs on localhost, 127.0.0.0/8
//               or [::1] for a local proxy or emulator.
//
// CRA fixes NODE_ENV at build time and does not let REACT_APP_* override
// it, so a production build cannot be talked into the development rules.

export type EndpointPolicy = 'development' | 'production';

/** Exact same-origin API paths a build may call. Add a path here per new route. */
export const ALLOWED_API_PATHS: string[] = ['/api/s02/turn'];

/** Only exactly "development" relaxes the policy; everything else fails closed. */
export function endpointPolicyFor(nodeEnv: string | undefined): EndpointPolicy {
  return nodeEnv === 'development' ? 'development' : 'production';
}

/** Fixed base for resolving relative endpoints; never contacted. */
const SAME_ORIGIN_BASE = 'https://same-origin.invalid';

function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') {
    return true;
  }
  // The URL parser normalises IPv4 forms (0x7f.1, 127.1, 2130706433, …) to
  // dotted decimal before this check.
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
}

/**
 * An exact allow-listed path. The parsed path must equal the input, so
 * anything the parser rewrites — dot segments, %2e, backslashes, tabs,
 * spaces — or a query or fragment is rejected, as is "//host" and "/\host".
 */
function isAllowedRelativePath(endpoint: string): boolean {
  if (endpoint.charAt(1) === '/' || endpoint.charAt(1) === '\\') {
    return false;
  }

  let resolved: URL;
  try {
    resolved = new URL(endpoint, SAME_ORIGIN_BASE);
  } catch (error) {
    return false;
  }

  return (
    resolved.origin === SAME_ORIGIN_BASE &&
    resolved.search === '' &&
    resolved.hash === '' &&
    resolved.pathname === endpoint &&
    ALLOWED_API_PATHS.indexOf(resolved.pathname) !== -1
  );
}

/** A credential-free http/https URL on a loopback host. Development only. */
function isAllowedLoopbackUrl(endpoint: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch (error) {
    return false;
  }

  if (parsed.username !== '' || parsed.password !== '') {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  return isLoopbackHostname(parsed.hostname);
}

/**
 * Whether the Firebase ID token may be sent to this endpoint under the
 * given policy. Rejected in every mode: malformed URLs, other schemes,
 * embedded credentials, non-loopback hosts, protocol-relative tricks, and
 * any path not exactly on ALLOWED_API_PATHS.
 */
export function isAllowedEndpoint(endpoint: string, policy: EndpointPolicy): boolean {
  if (typeof URL === 'undefined' || typeof endpoint !== 'string' || endpoint.length === 0) {
    return false;
  }

  if (endpoint.charAt(0) === '/') {
    return isAllowedRelativePath(endpoint);
  }

  return policy === 'development' && isAllowedLoopbackUrl(endpoint);
}

export interface RemoteEngineConfig {
  /**
   * A server endpoint that holds the model API key. NOT the model
   * provider's URL: putting a provider key in this client publishes it,
   * because CRA inlines REACT_APP_* into the bundle.
   */
  endpoint: string;
  timeoutMs?: number;
  /**
   * Returns the signed-in user's Firebase ID token, or null when there is
   * none. When supplied, a request without a token is never sent: the
   * endpoint is expected to reject it anyway, and the round trip would
   * only delay the fallback.
   */
  getIdToken?: () => Promise<string | null>;
}

interface RemoteReply {
  style: EmployeeResponseStyle;
  lines: string[];
  model?: string;
}

/**
 * Validates the endpoint's reply. Returns null when it is not usable, so a
 * malformed or oversized answer is treated like an outage, never rendered.
 *
 * A missing `style` keeps the original default of technical_detail; an
 * unknown one is rejected.
 */
export function parseRemoteReply(body: unknown): RemoteReply | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }

  const record = body as Record<string, unknown>;

  let style: EmployeeResponseStyle = 'technical_detail';
  if (record.style !== undefined) {
    if (EMPLOYEE_RESPONSE_STYLES.indexOf(record.style as EmployeeResponseStyle) === -1) {
      return null;
    }
    style = record.style as EmployeeResponseStyle;
  }

  if (
    !Array.isArray(record.lines) ||
    record.lines.length === 0 ||
    record.lines.length > MAX_RESPONSE_LINES
  ) {
    return null;
  }

  const lines: string[] = [];
  for (let i = 0; i < record.lines.length; i += 1) {
    const line = record.lines[i];
    if (typeof line !== 'string') {
      return null;
    }
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_RESPONSE_LINE_CHARS) {
      return null;
    }
    lines.push(trimmed);
  }

  const model =
    typeof record.model === 'string' &&
    record.model.length > 0 &&
    record.model.length <= MAX_MODEL_ID_CHARS
      ? record.model
      : undefined;

  return { style, lines, model };
}

/**
 * The header the function sets on a 429 that is its own daily cap
 * (functions/src/handler.ts, LIMIT_HEADER). Absent on a provider 429.
 */
const LIMIT_HEADER = 'x-managertalk-limit';

function readLimitHeader(response: Response): string | null {
  return response.headers && typeof response.headers.get === 'function'
    ? response.headers.get(LIMIT_HEADER)
    : null;
}

function statusError(
  status: number,
  limit: string | null = null
): { code: EngineErrorCode; message: string } {
  if (status === 401 || status === 403) {
    return {
      code: 'unauthenticated',
      message: 'The conversation service did not accept your sign-in.'
    };
  }
  if (status === 429 && limit === 'daily-user') {
    return {
      code: 'daily-limit-user',
      message: 'You have reached today\'s limit for the AI conversation partner.'
    };
  }
  if (status === 429 && limit === 'daily-global') {
    return {
      code: 'daily-limit-global',
      message: 'The AI conversation partner has reached its limit for today.'
    };
  }
  if (status === 429) {
    return {
      code: 'rate-limited',
      message: 'The conversation service is busy. Please wait a moment.'
    };
  }
  return {
    code: 'unavailable',
    message: 'The conversation service returned status ' + status + '.'
  };
}

export class RemoteConversationEngine implements ConversationEngine {
  readonly kind = 'remote' as const;

  private readonly config: RemoteEngineConfig;

  constructor(config: RemoteEngineConfig) {
    this.config = config;
  }

  async respond(request: EngineRequest): Promise<EngineResult<EngineResponse>> {
    if (!this.config.endpoint) {
      return {
        ok: false,
        code: 'not-configured',
        message: 'No conversation endpoint is configured.'
      };
    }

    if (wordCount(request.managerInput) === 0) {
      return {
        ok: false,
        code: 'invalid-request',
        message: 'No manager input was provided for this stage.'
      };
    }

    if (request.managerInput.length > MAX_MANAGER_INPUT_CHARS) {
      return {
        ok: false,
        code: 'invalid-request',
        message:
          'Your message is too long. Please keep it under ' +
          MAX_MANAGER_INPUT_CHARS +
          ' characters.'
      };
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (this.config.getIdToken) {
      let token: string | null = null;
      try {
        token = await this.config.getIdToken();
      } catch (error) {
        token = null;
      }
      if (!token) {
        return {
          ok: false,
          code: 'unauthenticated',
          message: 'Sign in again to use the conversation service.'
        };
      }
      headers.Authorization = 'Bearer ' + token;
    }

    const timeoutMs = this.config.timeoutMs || DEFAULT_REMOTE_TIMEOUT_MS;
    const controller =
      typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (controller) {
        controller.abort();
      }
    }, timeoutMs);

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers,
        signal: controller ? controller.signal : undefined,
        body: JSON.stringify({
          scenarioId: request.blueprint.scenario_id,
          stage: request.stage,
          managerInput: request.managerInput,
          priorTurns: request.priorTurns.slice(-MAX_PRIOR_TURNS).map((turn) => ({
            stage: turn.stage,
            managerInput: turn.managerInput,
            employeeLines: turn.employeeLines
          }))
        })
      });

      if (timedOut) {
        return TIMEOUT_RESULT;
      }

      if (!response.ok) {
        const failure = statusError(response.status, readLimitHeader(response));
        return { ok: false, code: failure.code, message: failure.message };
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch (error) {
        body = null;
      }

      // The abort also cancels reading the body, so a timeout that lands
      // while json() is pending surfaces here as a parse failure.
      if (timedOut) {
        return TIMEOUT_RESULT;
      }

      const reply = parseRemoteReply(body);

      if (!reply) {
        return {
          ok: false,
          code: 'invalid-response',
          message: 'The conversation service returned an unexpected shape.'
        };
      }

      return {
        ok: true,
        data: {
          style: reply.style,
          lines: reply.lines,
          constraintViolations: detectStageViolations(
            request.blueprint,
            request.stage,
            request.managerInput
          ),
          source: 'remote',
          model: reply.model
        }
      };
    } catch (error) {
      if (timedOut) {
        return TIMEOUT_RESULT;
      }
      return {
        ok: false,
        code: 'unavailable',
        message: 'Could not reach the conversation service.'
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

// -----------------------------
// Fallback
// -----------------------------

/**
 * Failures the fallback must not hide. An over-long message is the user's
 * to fix; answering it from the stub would look like the model accepted it.
 */
const NO_FALLBACK_CODES: EngineErrorCode[] = ['invalid-request'];

/**
 * Tries the primary engine and answers from the fallback when it fails.
 * The fallback's response carries `fallbackReason`, so the screen can say
 * the reply is scripted rather than generated.
 */
export class FallbackConversationEngine implements ConversationEngine {
  readonly kind = 'remote' as const;

  private readonly primary: ConversationEngine;
  private readonly fallback: ConversationEngine;

  constructor(primary: ConversationEngine, fallback: ConversationEngine) {
    this.primary = primary;
    this.fallback = fallback;
  }

  async respond(request: EngineRequest): Promise<EngineResult<EngineResponse>> {
    const result = await this.primary.respond(request);

    if (result.ok || NO_FALLBACK_CODES.indexOf(result.code) !== -1) {
      return result;
    }

    const backup = await this.fallback.respond(request);

    if (!backup.ok) {
      return backup;
    }

    return {
      ok: true,
      data: { ...backup.data, fallbackReason: result.code }
    };
  }
}

// -----------------------------
// Selection
// -----------------------------

/**
 * The signed-in user's Firebase ID token. getIdToken() refreshes an expired
 * token itself. S02 screens only render behind AuthGate, so a missing user
 * here means the session ended mid-scenario.
 */
async function currentFirebaseIdToken(): Promise<string | null> {
  if (!isFirebaseConfigured()) {
    return null;
  }
  const user = getFirebaseAuth().currentUser;
  return user ? user.getIdToken() : null;
}

/**
 * The active engine. Reads REACT_APP_S02_ENGINE_ENDPOINT — a URL, never a
 * key. Absent or rejected by isAllowedEndpoint() under the build's policy,
 * the stub answers alone and no ID token is read; allowed, the remote
 * engine answers with the stub as its fallback. The policy parameter
 * exists for tests; the app calls this with no arguments.
 */
export function createConversationEngine(
  policy: EndpointPolicy = endpointPolicyFor(process.env.NODE_ENV)
): ConversationEngine {
  const endpoint = process.env.REACT_APP_S02_ENGINE_ENDPOINT;

  if (endpoint && isAllowedEndpoint(endpoint, policy)) {
    return new FallbackConversationEngine(
      new RemoteConversationEngine({ endpoint, getIdToken: currentFirebaseIdToken }),
      new ScriptedConversationEngine()
    );
  }

  return new ScriptedConversationEngine();
}
