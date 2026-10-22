import { readFileSync } from 'fs';
import { join } from 'path';

import mtS02 from '../../data/scenarios/mt-s02.json';
import { ScenarioBlueprint } from '../../types/scenarioBlueprint';
import { sourceLabel } from '../../screens/s02/S02StageScreen';
import {
  ConversationEngine,
  EngineErrorCode,
  EngineRequest,
  EngineResponse,
  EngineResult,
  EngineTurn,
  FallbackConversationEngine,
  MAX_MANAGER_INPUT_CHARS,
  MOCK_MODEL_ID,
  MAX_PRIOR_TURNS,
  RemoteConversationEngine,
  StubConversationEngine,
  buildStagePrompt,
  buildSystemPrompt,
  ALLOWED_API_PATHS,
  createConversationEngine,
  endpointPolicyFor,
  isAllowedEndpoint,
  parseRemoteReply
} from './conversationEngine';

// Test-local Firebase double, so results never depend on .env files or
// REACT_APP_FIREBASE_* variables on the machine running the tests. The
// engine only uses these two functions.
interface MockUser {
  getIdToken: () => Promise<string>;
}

const mockFirebase: { configured: boolean; user: MockUser | null } = {
  configured: false,
  user: null
};

jest.mock('../../lib/firebase', () => ({
  isFirebaseConfigured: () => mockFirebase.configured,
  getFirebaseAuth: () => ({ currentUser: mockFirebase.user })
}));

const blueprint = mtS02 as unknown as ScenarioBlueprint;
const ENDPOINT = 'https://example.test/api/s02/turn';

function request(overrides: Partial<EngineRequest> = {}): EngineRequest {
  return {
    blueprint,
    stage: 'sbi',
    managerInput: 'In Tuesday\'s review you cut across Priya twice.',
    priorTurns: [],
    ...overrides
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body)
  } as unknown as Response;
}

/**
 * The response data of a successful result. Throws on failure, so the
 * assertions that follow never run behind a condition and a failed result
 * fails the test with its own code and message.
 */
function dataOf(result: EngineResult<EngineResponse>): EngineResponse {
  if (!result.ok) {
    throw new Error('Expected a successful result, got ' + result.code + ': ' + result.message);
  }
  return result.data;
}

function remote(getIdToken: () => Promise<string | null> = () => Promise.resolve('token-123')) {
  return new RemoteConversationEngine({ endpoint: ENDPOINT, getIdToken, timeoutMs: 50 });
}

let fetchMock: jest.Mock;
const originalEndpoint = process.env.REACT_APP_S02_ENGINE_ENDPOINT;

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  mockFirebase.configured = false;
  mockFirebase.user = null;
  delete process.env.REACT_APP_S02_ENGINE_ENDPOINT;
});

afterEach(() => {
  jest.useRealTimers();
  if (originalEndpoint === undefined) {
    delete process.env.REACT_APP_S02_ENGINE_ENDPOINT;
  } else {
    process.env.REACT_APP_S02_ENGINE_ENDPOINT = originalEndpoint;
  }
});

describe('RemoteConversationEngine', () => {
  test('sends the ID token, scenario id, stage id and capped prior turns, and returns the reply', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        style: 'evidence_challenge',
        lines: ['  Which review do you mean?  '],
        model: 'nvidia/nemotron-3-super-120b-a12b'
      })
    );

    const turns: EngineTurn[] = [];
    for (let i = 0; i < MAX_PRIOR_TURNS + 2; i += 1) {
      turns.push({ stage: 'sbi', managerInput: 'turn ' + i, employeeLines: ['ok'], style: 'technical_detail' });
    }

    const result = await remote().respond(request({ priorTurns: turns }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(ENDPOINT);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer token-123');

    const body = JSON.parse(init.body);
    expect(Object.keys(body).sort()).toEqual(['managerInput', 'priorTurns', 'scenarioId', 'stage']);
    expect(body.scenarioId).toBe(blueprint.scenario_id);
    expect(body.stage).toBe('sbi');
    expect(body.priorTurns).toHaveLength(MAX_PRIOR_TURNS);
    expect(body.priorTurns[0].managerInput).toBe('turn 2');

    expect(result).toMatchObject({
      ok: true,
      data: {
        source: 'remote',
        style: 'evidence_challenge',
        lines: ['Which review do you mean?'],
        model: 'nvidia/nemotron-3-super-120b-a12b',
        constraintViolations: expect.any(Array)
      }
    });
  });

  test('never sends client-built prompt text', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { lines: ['Go on.'] }));
    await remote().respond(request());

    const rawBody: string = fetchMock.mock.calls[0][1].body;
    const body = JSON.parse(rawBody);
    expect(body).not.toHaveProperty('system');
    expect(rawBody).not.toContain(buildSystemPrompt(blueprint));
    expect(rawBody).not.toContain(buildStagePrompt(blueprint, 'sbi'));
    expect(rawBody).not.toContain('STAGE: sbi');
  });

  test('sends no Authorization header when no token provider is configured', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { lines: ['Go on.'] }));
    const engine = new RemoteConversationEngine({ endpoint: ENDPOINT, timeoutMs: 50 });
    await engine.respond(request());
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
  });

  test('does not call the endpoint without an ID token', async () => {
    const result = await remote(() => Promise.resolve(null)).respond(request());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, code: 'unauthenticated' });
  });

  test('treats a token provider that throws as unauthenticated', async () => {
    const result = await remote(() => Promise.reject(new Error('expired'))).respond(request());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, code: 'unauthenticated' });
  });

  test('rejects over-long and empty input before any network call', async () => {
    const long = await remote().respond(
      request({ managerInput: 'x'.repeat(MAX_MANAGER_INPUT_CHARS + 1) })
    );
    const empty = await remote().respond(request({ managerInput: '   ' }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(long).toMatchObject({ ok: false, code: 'invalid-request' });
    expect(empty).toMatchObject({ ok: false, code: 'invalid-request' });
  });

  test.each([
    [401, 'unauthenticated'],
    [403, 'unauthenticated'],
    [429, 'rate-limited'],
    [500, 'unavailable']
  ])('maps HTTP %i to %s', async (status, code) => {
    fetchMock.mockResolvedValue(jsonResponse(status, {}));
    const result = await remote().respond(request());
    expect(result).toMatchObject({ ok: false, code });
  });

  test('rejects a reply that is not JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('Unexpected token'))
    });
    const result = await remote().respond(request());
    expect(result).toMatchObject({ ok: false, code: 'invalid-response' });
  });

  test('reports a timeout when the endpoint does not answer in time', async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          if (init.signal) {
            init.signal.addEventListener('abort', () => reject(new Error('aborted')));
          }
        })
    );
    const result = await remote().respond(request());
    expect(result).toMatchObject({ ok: false, code: 'timeout' });
  });

  test('reports a timeout, not a parse failure, when it fires while the body is being read', async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          new Promise((_resolve, reject) => {
            if (init.signal) {
              init.signal.addEventListener('abort', () => reject(new Error('aborted')));
            }
          })
      })
    );
    const result = await remote().respond(request());
    expect(result).toMatchObject({ ok: false, code: 'timeout' });
  });

  test('clears its timeout timer after a successful reply', async () => {
    jest.useFakeTimers();
    fetchMock.mockResolvedValue(jsonResponse(200, { lines: ['Go on.'] }));
    const result = await remote().respond(request());
    expect(result.ok).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('reports a network failure as unavailable', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const result = await remote().respond(request());
    expect(result).toMatchObject({ ok: false, code: 'unavailable' });
  });

  test('without an endpoint it is not configured', async () => {
    const engine = new RemoteConversationEngine({ endpoint: '' });
    const result = await engine.respond(request());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, code: 'not-configured' });
  });
});

describe('parseRemoteReply', () => {
  test('defaults a missing style to technical_detail', () => {
    expect(parseRemoteReply({ lines: ['Fine.'] })).toEqual({
      style: 'technical_detail',
      lines: ['Fine.'],
      model: undefined
    });
  });

  test.each([
    ['null body', null],
    ['unknown style', { style: 'shouting', lines: ['No.'] }],
    ['missing lines', { style: 'technical_detail' }],
    ['empty lines', { lines: [] }],
    ['too many lines', { lines: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }],
    ['non-string line', { lines: [42] }],
    ['blank line', { lines: ['   '] }],
    ['over-long line', { lines: ['x'.repeat(601)] }]
  ])('rejects %s', (_label, body) => {
    expect(parseRemoteReply(body)).toBeNull();
  });

  test('drops an implausible model id', () => {
    const reply = parseRemoteReply({ lines: ['Ok.'], model: 'm'.repeat(121) });
    expect(reply && reply.model).toBeUndefined();
  });
});

describe('FallbackConversationEngine', () => {
  function failing(code: EngineErrorCode): ConversationEngine {
    return {
      kind: 'remote',
      respond: () => Promise.resolve({ ok: false, code, message: 'failed' })
    };
  }

  test('answers from the stub and records why when the remote fails', async () => {
    const engine = new FallbackConversationEngine(failing('timeout'), new StubConversationEngine());
    const result = await engine.respond(request());
    const data = dataOf(result);
    expect(data?.source).toBe('stub');
    expect(data?.fallbackReason).toBe('timeout');
    expect(data?.lines.length).toBeGreaterThan(0);
  });

  test.each([
    ['HTTP 401', () => jsonResponse(401, {}), 'unauthenticated'],
    ['HTTP 429', () => jsonResponse(429, {}), 'rate-limited'],
    ['a malformed reply', () => jsonResponse(200, { lines: 'not an array' }), 'invalid-response']
  ])('falls back with the real remote reason after %s', async (_label, makeResponse, reason) => {
    fetchMock.mockResolvedValue(makeResponse());
    const engine = new FallbackConversationEngine(remote(), new StubConversationEngine());
    const result = await engine.respond(request());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const data = dataOf(result);
    expect(data?.source).toBe('stub');
    expect(data?.fallbackReason).toBe(reason);
    expect(data?.model).toBeUndefined();
  });

  test('does not hide an invalid request behind the stub', async () => {
    const engine = new FallbackConversationEngine(
      failing('invalid-request'),
      new StubConversationEngine()
    );
    const result = await engine.respond(request());
    expect(result).toMatchObject({ ok: false, code: 'invalid-request' });
  });

  test('passes a successful remote reply through untouched', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { lines: ['Go on.'] }));
    const engine = new FallbackConversationEngine(remote(), new StubConversationEngine());
    const result = await engine.respond(request());
    const data = dataOf(result);
    expect(data?.source).toBe('remote');
    expect(data?.fallbackReason).toBeUndefined();
  });
});

// Joined at runtime so the test data itself is not a script URL literal.
const JAVASCRIPT_URL = ['javascript', 'alert(1)'].join(':');
const API_PATH = '/api/s02/turn';
const LOCAL_EMULATOR = 'http://127.0.0.1:5001/demo/us-central1/s02Turn';

describe('endpointPolicyFor', () => {
  test('only exactly "development" selects the development policy', () => {
    expect(endpointPolicyFor('development')).toBe('development');
  });

  test.each([['production'], ['test'], [undefined], [''], ['staging'], ['Development']])(
    'treats %p as production',
    (nodeEnv) => {
      expect(endpointPolicyFor(nodeEnv)).toBe('production');
    }
  );

  test('Jest runs under the strict policy', () => {
    expect(endpointPolicyFor(process.env.NODE_ENV)).toBe('production');
  });

  test('the allow-list holds exactly the S02 turn route', () => {
    expect(ALLOWED_API_PATHS).toEqual([API_PATH]);
  });
});

describe('isAllowedEndpoint (production policy: Jest, build, demo, unknown)', () => {
  test('allows the exact same-origin turn route', () => {
    expect(isAllowedEndpoint(API_PATH, 'production')).toBe(true);
  });

  test.each([
    ['trailing slash', '/api/s02/turn/'],
    ['query string', '/api/s02/turn?x=1'],
    ['fragment', '/api/s02/turn#a'],
    ['another route', '/api/s02/other'],
    ['different case', '/API/s02/turn'],
    ['doubled slash inside the path', '/api//s02/turn'],
    ['dot segments', '/api/s02/../s02/turn'],
    ['encoded dot segments', '/api/%2e%2e/s02/turn'],
    ['percent-encoded letter', '/api/s02/%74urn'],
    ['backslash separators', '/api\\s02\\turn'],
    ['trailing tab', '/api/s02/turn\t'],
    ['leading space', ' /api/s02/turn'],
    ['no leading slash', 'api/s02/turn'],
    ['https host', 'https://example.test/api/s02/turn'],
    ['https host on the turn path', 'https://example.test' + API_PATH],
    ['loopback http', 'http://localhost:5001/api/s02/turn'],
    ['loopback IPv4', 'http://127.0.0.1/api/s02/turn'],
    ['loopback IPv6', 'http://[::1]/api/s02/turn'],
    ['loopback https', 'https://localhost:8443/api/s02/turn'],
    ['protocol-relative URL', '//evil.test/api/s02/turn'],
    ['backslash protocol-relative URL', '/\\evil.test/api/s02/turn'],
    ['tab-smuggled protocol-relative URL', '/\t/evil.test/api/s02/turn'],
    ['javascript scheme', JAVASCRIPT_URL],
    ['data scheme', 'data:text/plain,x'],
    ['ftp scheme', 'ftp://example.test/api/s02/turn'],
    ['https with credentials', 'https://user:pass@example.test/api/s02/turn'],
    ['malformed URL', 'not a url'],
    ['empty string', '']
  ])('rejects %s', (_label, endpoint) => {
    expect(isAllowedEndpoint(endpoint, 'production')).toBe(false);
  });
});

describe('isAllowedEndpoint (development policy: npm start only)', () => {
  test.each([
    ['the exact turn route', API_PATH],
    ['the Functions emulator on 127.0.0.1', LOCAL_EMULATOR],
    ['http localhost', 'http://localhost:5001/demo/us-central1/s02Turn'],
    ['http 127.0.0.1 with the turn path', 'http://127.0.0.1:8080/api/s02/turn'],
    ['http IPv6 loopback', 'http://[::1]:5001/x'],
    ['hex-form IPv4 loopback', 'http://0x7f.1/x'],
    ['short-form IPv4 loopback', 'http://127.1/x'],
    ['another 127.0.0.0/8 address', 'http://127.10.20.30:9000/x'],
    ['https localhost', 'https://localhost:8443/x']
  ])('allows %s', (_label, endpoint) => {
    expect(isAllowedEndpoint(endpoint, 'development')).toBe(true);
  });

  test.each([
    ['an https remote host', 'https://example.test/api/s02/turn'],
    ['an http remote host', 'http://example.com/x'],
    ['loopback with username and password', 'http://user:pass@localhost:5001/x'],
    ['loopback with username only', 'https://user@127.0.0.1/x'],
    ['localhost lookalike', 'http://localhost.evil.test/x'],
    ['loopback lookalike', 'http://127.0.0.1.evil.test/x'],
    ['localhost with a trailing dot', 'http://localhost./x'],
    ['a relative path off the allow-list', '/api/s02/other'],
    ['a relative path with a query', '/api/s02/turn?debug=1'],
    ['protocol-relative URL', '//evil.test/x'],
    ['backslash protocol-relative URL', '/\\evil.test/x'],
    ['tab-smuggled protocol-relative URL', '/\t/evil.test/x'],
    ['javascript scheme', JAVASCRIPT_URL],
    ['data scheme', 'data:text/plain,x'],
    ['ftp on loopback', 'ftp://localhost/x'],
    ['malformed URL', 'not a url'],
    ['empty string', '']
  ])('rejects %s', (_label, endpoint) => {
    expect(isAllowedEndpoint(endpoint, 'development')).toBe(false);
  });
});

describe('createConversationEngine', () => {
  test('uses the stub alone when no endpoint is configured', () => {
    const engine = createConversationEngine();
    expect(engine).toBeInstanceOf(StubConversationEngine);
  });

  test('wraps the remote engine with the stub fallback for the allowed route', () => {
    process.env.REACT_APP_S02_ENGINE_ENDPOINT = API_PATH;
    const engine = createConversationEngine();
    expect(engine).toBeInstanceOf(FallbackConversationEngine);
    expect(engine.kind).toBe('remote');
  });

  test('by default (strict under Jest) rejects a loopback endpoint', () => {
    process.env.REACT_APP_S02_ENGINE_ENDPOINT = LOCAL_EMULATOR;
    expect(createConversationEngine()).toBeInstanceOf(StubConversationEngine);
  });

  test('in development sends the token to a loopback endpoint', async () => {
    process.env.REACT_APP_S02_ENGINE_ENDPOINT = LOCAL_EMULATOR;
    mockFirebase.configured = true;
    mockFirebase.user = { getIdToken: () => Promise.resolve('fake-id-token') };
    fetchMock.mockResolvedValue(jsonResponse(200, { lines: ['Go on.'] }));

    const engine = createConversationEngine('development');
    const result = await engine.respond(request());

    expect(engine).toBeInstanceOf(FallbackConversationEngine);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(LOCAL_EMULATOR);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer fake-id-token');
    expect(result).toMatchObject({ ok: true, data: { source: 'remote' } });
  });

  test.each([
    ['production', 'https://example.test/api/s02/turn'],
    ['production', LOCAL_EMULATOR],
    ['production', '//evil.test/api/s02/turn'],
    ['production', '/\\evil.test/api/s02/turn'],
    ['production', '/api/s02/other'],
    ['production', '/api/s02/turn?x=1'],
    ['production', 'https://user:pass@example.test/api/s02/turn'],
    ['development', 'https://example.test/api/s02/turn'],
    ['development', '//evil.test/x'],
    ['development', 'http://user:pass@localhost:5001/x'],
    ['development', 'not a url']
  ] as Array<['production' | 'development', string]>)(
    'under the %s policy, %s selects the plain stub with no token lookup and no request',
    async (policy, endpoint) => {
      process.env.REACT_APP_S02_ENGINE_ENDPOINT = endpoint;
      const getIdToken = jest.fn(() => Promise.resolve('fake-id-token'));
      mockFirebase.configured = true;
      mockFirebase.user = { getIdToken };

      const engine = createConversationEngine(policy);
      const result = await engine.respond(request());

      expect(engine).toBeInstanceOf(StubConversationEngine);
      expect(getIdToken).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
      const data = dataOf(result);
      expect(data.source).toBe('stub');
      expect(data.fallbackReason).toBeUndefined();
    }
  );

  test('sends the signed-in user\'s Firebase ID token to the allowed route', async () => {
    process.env.REACT_APP_S02_ENGINE_ENDPOINT = API_PATH;
    mockFirebase.configured = true;
    mockFirebase.user = { getIdToken: () => Promise.resolve('fake-id-token') };
    fetchMock.mockResolvedValue(jsonResponse(200, { lines: ['Go on.'] }));

    const result = await createConversationEngine().respond(request());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/s02/turn');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer fake-id-token');
    expect(result).toMatchObject({ ok: true, data: { source: 'remote' } });
  });

  test('with Firebase configured but no signed-in user it falls back without sending', async () => {
    process.env.REACT_APP_S02_ENGINE_ENDPOINT = API_PATH;
    mockFirebase.configured = true;
    mockFirebase.user = null;

    const result = await createConversationEngine().respond(request());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, data: { source: 'stub', fallbackReason: 'unauthenticated' } });
  });

  test('without Firebase config the remote engine falls back instead of sending', async () => {
    process.env.REACT_APP_S02_ENGINE_ENDPOINT = API_PATH;
    const result = await createConversationEngine().respond(request());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, data: { source: 'stub', fallbackReason: 'unauthenticated' } });
  });
});

describe('sourceLabel', () => {
  const base: EngineTurn = {
    stage: 'sbi',
    managerInput: 'Input',
    employeeLines: ['Line'],
    style: 'technical_detail'
  };

  test.each([
    [
      'remote with a model',
      { source: 'remote' as const, model: 'nvidia/nemotron-3-super-120b-a12b' },
      'AI-generated reply · nvidia/nemotron-3-super-120b-a12b'
    ],
    ['remote without a model', { source: 'remote' as const }, 'AI-generated reply'],
    ['stub with no endpoint', { source: 'stub' as const }, 'Scripted reply'],
    [
      'fallback after a timeout',
      { source: 'stub' as const, fallbackReason: 'timeout' as const },
      'Scripted reply · the AI conversation partner took too long to respond'
    ],
    [
      'fallback after an auth failure',
      { source: 'stub' as const, fallbackReason: 'unauthenticated' as const },
      "Scripted reply · we couldn't confirm your sign-in for the AI conversation partner"
    ],
    [
      'fallback after rate limiting',
      { source: 'stub' as const, fallbackReason: 'rate-limited' as const },
      'Scripted reply · the AI conversation partner is busy right now'
    ],
    [
      'fallback after any other failure',
      { source: 'stub' as const, fallbackReason: 'invalid-response' as const },
      'Scripted reply · the AI conversation partner is unavailable'
    ]
  ])('labels %s', (_label, fields, expected) => {
    expect(sourceLabel({ ...base, ...fields })).toBe(expected);
  });

  test('never labels a fallback as AI-generated', () => {
    const label = sourceLabel({ ...base, source: 'stub', fallbackReason: 'timeout' });
    expect(label).not.toContain('AI-generated');
    expect(label && label.indexOf('Scripted reply')).toBe(0);
  });

  test('returns no label for a turn with no recorded source', () => {
    expect(sourceLabel(base)).toBeNull();
  });

  describe('mock replies', () => {
    const MOCK_LABEL = 'Mock reply — no AI model was called';

    test('the exact mock model id is labelled as a mock, never as AI-generated', () => {
      const label = sourceLabel({ ...base, source: 'remote', model: MOCK_MODEL_ID });
      expect(label).toBe(MOCK_LABEL);
      expect(label).not.toContain('AI-generated');
      expect(label).not.toContain(MOCK_MODEL_ID);
    });

    test.each([
      ['a name that merely contains "mock"', 'not-a-mock-model'],
      ['the mock id with a suffix', 'managertalk-mock-2'],
      ['the mock id with a prefix', 'nvidia/managertalk-mock'],
      ['the mock id in another case', 'ManagerTalk-Mock'],
      ['the mock id with surrounding space', ' managertalk-mock '],
      ['a bare "mock"', 'mock']
    ])('does not treat %s as the mock', (_label, model) => {
      expect(sourceLabel({ ...base, source: 'remote', model })).toBe('AI-generated reply · ' + model);
    });

    test('a real Nemotron reply keeps the AI-generated label', () => {
      expect(
        sourceLabel({ ...base, source: 'remote', model: 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B' })
      ).toBe('AI-generated reply · nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B');
    });

    test('scripted and fallback labels are unaffected by the mock id', () => {
      expect(sourceLabel({ ...base, source: 'stub', model: MOCK_MODEL_ID })).toBe('Scripted reply');
      expect(
        sourceLabel({ ...base, source: 'stub', model: MOCK_MODEL_ID, fallbackReason: 'timeout' })
      ).toBe('Scripted reply · the AI conversation partner took too long to respond');
    });

    test('a mock reply from the remote engine flows through to the mock label', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          style: 'technical_detail',
          lines: ['[Mock reply — no AI model was called] The server received your message.'],
          model: MOCK_MODEL_ID
        })
      );
      const data = dataOf(await remote().respond(request()));
      const turn: EngineTurn = {
        stage: 'sbi',
        managerInput: 'Input',
        employeeLines: data.lines,
        style: data.style,
        source: data.source,
        model: data.model
      };
      expect(sourceLabel(turn)).toBe(MOCK_LABEL);
    });

    test('the client constant and label match the mock backend', () => {
      // functions/ is a separate package, so this reads its source text
      // instead of importing it. A rename on either side fails here.
      const backend = readFileSync(
        join(__dirname, '..', '..', '..', 'functions', 'src', 'mockModel.ts'),
        'utf8'
      );
      expect(backend).toContain("MOCK_MODEL_ID = '" + MOCK_MODEL_ID + "'");
      expect(backend).toContain("MOCK_MARKER = '[" + MOCK_LABEL + "]'");
    });
  });
});
