import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import mtS02 from '../../data/scenarios/mt-s02.json';
import { ScenarioBlueprint } from '../../types/scenarioBlueprint';
import { useS02SessionState } from '../../store/s02SessionState';
import {
  ConversationEngine,
  EngineRequest,
  EngineResponse,
  EngineResult,
  MAX_MANAGER_INPUT_CHARS,
  MOCK_MODEL_ID
} from '../../engine/s02/conversationEngine';
import S02StageScreen, { JOURNEY, MIN_MANAGER_INPUT_CHARS, continueLabel } from './S02StageScreen';

// The engine module reads Firebase only to attach a sign-in token to remote
// calls; these tests never make one.
jest.mock('../../lib/firebase', () => ({
  isFirebaseConfigured: () => false,
  getFirebaseAuth: () => ({ currentUser: null })
}));

// By default the real (scripted) engine answers. A test can install its own.
const engineHolder: { engine: ConversationEngine | null } = { engine: null };
jest.mock('../../engine/s02/conversationEngine', () => {
  const actual = jest.requireActual('../../engine/s02/conversationEngine');
  return {
    ...actual,
    createConversationEngine: () => engineHolder.engine || actual.createConversationEngine()
  };
});

const blueprint = mtS02 as unknown as ScenarioBlueprint;
const MESSAGE = 'In the sprint review, when Aoife raised her concern, you answered at length and no owner was agreed.';

function engineReturning(make: (request: EngineRequest) => Promise<EngineResult<EngineResponse>>): ConversationEngine {
  return { kind: 'remote', respond: make };
}

function okResponse(overrides: Partial<EngineResponse> = {}): Promise<EngineResult<EngineResponse>> {
  return Promise.resolve({
    ok: true,
    data: { style: 'technical_detail', lines: ['A reply line.'], constraintViolations: [], source: 'stub', ...overrides }
  });
}

function renderStage(props: Partial<React.ComponentProps<typeof S02StageScreen>> = {}) {
  return render(<S02StageScreen blueprint={blueprint} stage="sbi" {...props} />);
}

async function send(text: string = MESSAGE) {
  await userEvent.type(screen.getByRole('textbox'), text);
  userEvent.click(screen.getByRole('button', { name: /^Send/ }));
}

beforeEach(() => {
  engineHolder.engine = null;
  act(() => useS02SessionState.getState().resetSession());
});

describe('orientation', () => {
  test('shows where the learner is among the five steps, and what to do next', () => {
    renderStage();
    const nav = screen.getByRole('navigation', { name: 'Conversation progress' });
    expect(nav).toHaveTextContent('Step 1 of 5.');
    expect(nav).toHaveTextContent('Write your message below, then press Send.');
    const items = screen.getAllByRole('listitem').filter((item) => nav.contains(item));
    expect(items.map((item) => item.textContent?.replace(/^\d+\s*/, ''))).toEqual(JOURNEY.map((j) => j.label));
    expect(items.filter((item) => item.getAttribute('aria-current') === 'step')).toHaveLength(1);
    expect(items[0]).toHaveAttribute('aria-current', 'step');
  });

  test('marks the right step on every stage', () => {
    JOURNEY.forEach((item, index) => {
      const { unmount } = renderStage({ stage: item.stage });
      const current = screen.getAllByRole('listitem').filter((li) => li.getAttribute('aria-current') === 'step');
      expect(current).toHaveLength(1);
      expect(current[0]).toHaveTextContent(String(index + 1));
      unmount();
    });
  });

  test('keeps the manager guidance and no longer shows the model-facing "Ambiguity To Preserve" block', () => {
    renderStage();
    expect(screen.getByText('Manager Guidance')).toBeInTheDocument();
    expect(screen.queryByText(/Ambiguity To Preserve/i)).not.toBeInTheDocument();
  });

  test('names the reply as Tomás\'s, not by the scenario competency', () => {
    renderStage();
    expect(screen.queryByText(blueprint.primary_competency)).not.toBeInTheDocument();
  });
});

describe('composer', () => {
  test('Send and Continue are disabled until there is a message and a reply', () => {
    renderStage();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Continue/ })).toBeDisabled();
  });

  test('shows a character count tied to the field and caps the length', () => {
    renderStage();
    const field = screen.getByRole('textbox');
    expect(field).toHaveAttribute('maxLength', String(MAX_MANAGER_INPUT_CHARS));
    const hint = document.getElementById(field.getAttribute('aria-describedby') as string);
    expect(hint).toHaveTextContent('0 of ' + MAX_MANAGER_INPUT_CHARS + ' characters');
    fireEvent.change(field, { target: { value: 'hello' } });
    expect(hint).toHaveTextContent('5 of ' + MAX_MANAGER_INPUT_CHARS + ' characters');
  });

  test('a very short entry is not sent and explains why', () => {
    renderStage();
    const field = screen.getByRole('textbox');
    fireEvent.change(field, { target: { value: 'ok' } });
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByText(/Write a little more, at least/)).toHaveTextContent(
      'at least ' + MIN_MANAGER_INPUT_CHARS + ' characters'
    );
    fireEvent.change(field, { target: { value: MESSAGE } });
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
    expect(screen.queryByText(/Write a little more/)).not.toBeInTheDocument();
  });

  test('says that progress saves automatically', () => {
    renderStage();
    expect(screen.getByText(/saves automatically on this device/)).toBeInTheDocument();
  });

  test('Ctrl+Enter sends; plain Enter does not', async () => {
    renderStage();
    const field = screen.getByRole('textbox');
    await userEvent.type(field, MESSAGE);
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(screen.queryByText("Tomás's reply")).not.toBeInTheDocument();
    fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true });
    expect(await screen.findByText("Tomás's reply")).toBeInTheDocument();
  });
});

describe('a scripted reply (the default engine)', () => {
  test('is shown with a visible Scripted badge and label, and unlocks the next step by name', async () => {
    renderStage();
    await send();
    expect(await screen.findByText("Tomás's reply")).toBeInTheDocument();
    expect(screen.getByText('Scripted')).toBeInTheDocument();
    expect(screen.getByText('Scripted reply')).toBeInTheDocument();
    expect(screen.queryByText(/AI-generated|Live/)).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Send again' })).toBeEnabled();
    const next = screen.getByRole('button', { name: 'Continue: Ask for his account' });
    expect(next).toBeEnabled();
    expect(screen.getByRole('navigation', { name: 'Conversation progress' })).toHaveTextContent(
      'Read Tomás\'s reply, then use the Continue button'
    );
  });

  test('Continue moves the stage machine forward exactly one stage', async () => {
    renderStage();
    await send();
    userEvent.click(await screen.findByRole('button', { name: /^Continue: / }));
    expect(useS02SessionState.getState().stage).toBe('exploration');
  });

  test('the reply is announced through a polite live region', async () => {
    renderStage();
    await send();
    const reply = await screen.findByText("Tomás's reply");
    expect(reply.closest('[aria-live="polite"]')).not.toBeNull();
  });
});

describe('labels stay truthful for every source', () => {
  test('a validated model reply is the only thing labelled Live, with its model id', async () => {
    engineHolder.engine = engineReturning(() => okResponse({ source: 'remote', model: 'nvidia/some-model' }));
    renderStage();
    await send();
    expect(await screen.findByText('Live · nvidia/some-model')).toBeInTheDocument();
    expect(screen.getByText('AI-generated reply · nvidia/some-model')).toBeInTheDocument();
  });

  test('the mock backend is labelled as a mock, never as AI', async () => {
    engineHolder.engine = engineReturning(() => okResponse({ source: 'remote', model: MOCK_MODEL_ID }));
    renderStage();
    await send();
    expect(await screen.findByText('Mock · no AI model called')).toBeInTheDocument();
    expect(screen.getAllByText('Mock reply — no AI model was called').length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Live/)).not.toBeInTheDocument();
  });

  test.each([
    ['timeout', 'Scripted reply · the AI conversation partner took too long to respond'],
    ['rate-limited', 'Scripted reply · the AI conversation partner is busy right now'],
    ['unavailable', 'Scripted reply · the AI conversation partner is unavailable']
  ] as const)('a fallback after "%s" shows Scripted and says why', async (reason, sentence) => {
    engineHolder.engine = engineReturning(() => okResponse({ source: 'stub', fallbackReason: reason }));
    renderStage();
    await send();
    expect(await screen.findByText('Scripted')).toBeInTheDocument();
    expect(screen.getByText(sentence)).toBeInTheDocument();
    expect(screen.queryByText(/^Live/)).not.toBeInTheDocument();
  });
});

describe('loading, error and retry', () => {
  test('while a reply is pending: the field and Send are locked and "Reply arriving…" is announced', async () => {
    let release: (value: EngineResult<EngineResponse>) => void = () => undefined;
    engineHolder.engine = engineReturning(() => new Promise((resolve) => { release = resolve; }));
    renderStage();
    await send();

    expect(await screen.findByText('Reply arriving…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.queryByText("Tomás's reply")).not.toBeInTheDocument();

    await act(async () => {
      release({ ok: true, data: { style: 'technical_detail', lines: ['Done.'], constraintViolations: [], source: 'stub' } });
    });
    expect(await screen.findByText("Tomás's reply")).toBeInTheDocument();
    expect(screen.queryByText('Reply arriving…')).not.toBeInTheDocument();
  });

  test('a failed request keeps the message, explains how to retry, and does not unlock Continue', async () => {
    engineHolder.engine = engineReturning(() =>
      Promise.resolve({ ok: false, code: 'invalid-request', message: 'Your message is too long.' })
    );
    renderStage();
    await send();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Your message is too long.');
    expect(alert).toHaveTextContent('Your message is kept. Press Send to try again.');
    expect(screen.getByRole('textbox')).toHaveValue(MESSAGE);
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
    expect(screen.getByRole('button', { name: /^Continue/ })).toBeDisabled();
    expect(screen.queryByText("Tomás's reply")).not.toBeInTheDocument();
  });

  test('retrying after a failure works and clears the error', async () => {
    let calls = 0;
    engineHolder.engine = engineReturning(() => {
      calls += 1;
      return calls === 1
        ? Promise.resolve({ ok: false, code: 'unavailable', message: 'Could not reach the conversation service.' })
        : okResponse();
    });
    renderStage();
    await send();
    await screen.findByRole('alert');
    userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText("Tomás's reply")).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('when structured fields are incomplete, Continue stays locked and says why', async () => {
    renderStage({ canAdvance: false });
    await send();
    await screen.findByText("Tomás's reply");
    expect(screen.getByRole('button', { name: /^Continue/ })).toBeDisabled();
    expect(screen.getByText('Complete the fields above to continue.')).toBeInTheDocument();
  });
});

describe('continueLabel', () => {
  test('names the next step for each stage, and the score after the last', () => {
    expect(continueLabel('sbi')).toBe('Continue: Ask for his account');
    expect(continueLabel('exploration')).toBe('Continue: Hold explanations open');
    expect(continueLabel('hypotheses')).toBe('Continue: Agree commitments');
    expect(continueLabel('commitments')).toBe('Continue: Close with a date');
    expect(continueLabel('closing')).toBe('Continue to your score');
  });
});
