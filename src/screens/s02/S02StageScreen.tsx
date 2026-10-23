import React, { useMemo, useState } from 'react';

import {
  S02InputStage,
  ScenarioBlueprint,
  stageScreenText
} from '../../types/scenarioBlueprint';
import { nextStage } from '../../engine/s02/stageMachine';
import { useS02SessionState } from '../../store/s02SessionState';
import { Chip } from '../../ui';
import {
  EngineTurn,
  MAX_MANAGER_INPUT_CHARS,
  MOCK_MODEL_ID,
  createConversationEngine
} from '../../engine/s02/conversationEngine';

interface Props {
  blueprint: ScenarioBlueprint;
  stage: S02InputStage;
  /** Structured fields this stage needs beyond the free-text input. */
  extras?: React.ReactNode;
  /** Blocks advancing until the stage's structured fields are valid. */
  canAdvance?: boolean;
  /** Runs after the engine turn and before the stage advances. */
  onBeforeAdvance?: () => void;
}

/**
 * The shared body of the five authored stages.
 *
 * Every string on screen comes from the blueprint's ui_screens block or
 * from the engine's response. The only strings this component owns are
 * the navigation verbs on its two buttons and the source label under the
 * employee's turn, which says whether the reply was generated or scripted.
 */

/**
 * Says where the employee's turn came from, so a script is never taken for
 * a model. Every fallback label starts with "Scripted reply" and names the
 * reason in plain words, without error codes.
 */
export function sourceLabel(turn: EngineTurn): string | null {
  if (turn.source === 'remote') {
    // Exact match only: the mock backend's reply must never be labelled
    // as AI-generated, and no other model id may borrow the mock label.
    if (turn.model === MOCK_MODEL_ID) {
      return 'Mock reply — no AI model was called';
    }
    return turn.model ? 'AI-generated reply · ' + turn.model : 'AI-generated reply';
  }
  if (turn.fallbackReason) {
    switch (turn.fallbackReason) {
      case 'timeout':
        return 'Scripted reply · the AI conversation partner took too long to respond';
      case 'unauthenticated':
        return "Scripted reply · we couldn't confirm your sign-in for the AI conversation partner";
      case 'rate-limited':
        return 'Scripted reply · the AI conversation partner is busy right now';
      case 'daily-limit-user':
        return "Scripted reply · you've reached today's limit for the AI conversation partner, so practice continues with scripted replies";
      case 'daily-limit-global':
        return 'Scripted reply · the AI conversation partner has reached its limit for today, so practice continues with scripted replies';
      default:
        return 'Scripted reply · the AI conversation partner is unavailable';
    }
  }
  if (turn.source === 'stub') {
    return 'Scripted reply';
  }
  return null;
}
/**
 * The badge shown with each reply, so the origin is visible at a glance and
 * not only in the sentence beneath. Scripted and fallback replies are always
 * "Scripted"; only a validated model reply from the endpoint is "Live".
 */
export function chipFor(turn: EngineTurn): { kind: 'scripted' | 'mock' | 'live'; label?: string } | null {
  if (turn.source === 'remote') {
    if (turn.model === MOCK_MODEL_ID) {
      return { kind: 'mock' };
    }
    return { kind: 'live', label: turn.model ? 'Live · ' + turn.model : 'Live' };
  }
  if (turn.source === 'stub') {
    return { kind: 'scripted' };
  }
  return null;
}

/** The five conversation stages in order, with the short names shown to the learner. */
export const JOURNEY: Array<{ stage: S02InputStage; label: string }> = [
  { stage: 'sbi', label: 'Name the behaviour' },
  { stage: 'exploration', label: 'Ask for his account' },
  { stage: 'hypotheses', label: 'Hold explanations open' },
  { stage: 'commitments', label: 'Agree commitments' },
  { stage: 'closing', label: 'Close with a date' }
];

/** What the Continue button leads to, in words the learner sees. */
export function continueLabel(stage: S02InputStage): string {
  const next = nextStage(stage);
  const entry = JOURNEY.filter((item) => item.stage === next)[0];
  return entry ? 'Continue: ' + entry.label : 'Continue to your score';
}

const S02StageScreen: React.FC<Props> = ({
  blueprint,
  stage,
  extras,
  canAdvance = true,
  onBeforeAdvance
}) => {
  const text = stageScreenText(blueprint, stage);
  const position = JOURNEY.map((item) => item.stage).indexOf(stage);

  const value = useS02SessionState((state) => state.inputs[stage]);
  const setInput = useS02SessionState((state) => state.setInput);
  const requestStatus = useS02SessionState((state) => state.requestStatus);
  const lastError = useS02SessionState((state) => state.lastError);
  const violations = useS02SessionState((state) => state.lastViolations);
  const turns = useS02SessionState((state) => state.turns);
  const beginRequest = useS02SessionState((state) => state.beginRequest);
  const recordTurn = useS02SessionState((state) => state.recordTurn);
  const requestFailed = useS02SessionState((state) => state.requestFailed);
  const advance = useS02SessionState((state) => state.advance);

  const [submitted, setSubmitted] = useState(false);

  const engine = useMemo(() => createConversationEngine(), []);

  const turnForStage = turns.filter((turn) => turn.stage === stage).pop() || null;

  const busy = requestStatus === 'sending';
  const hasInput = value.trim().length > 0;

  const handleSubmit = async () => {
    if (!hasInput || busy) {
      return;
    }

    beginRequest();

    const result = await engine.respond({
      blueprint,
      stage,
      managerInput: value,
      priorTurns: turns
    });

    if (!result.ok) {
      requestFailed(result.message);
      return;
    }

    const turn: EngineTurn = {
      stage,
      managerInput: value,
      employeeLines: result.data.lines,
      style: result.data.style,
      source: result.data.source,
      model: result.data.model,
      fallbackReason: result.data.fallbackReason
    };

    recordTurn(turn, result.data.constraintViolations);
    setSubmitted(true);
  };

  const handleAdvance = () => {
    if (onBeforeAdvance) {
      onBeforeAdvance();
    }
    setSubmitted(false);
    advance();
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <p style={styles.eyebrow}>{blueprint.scenario_id}</p>
        <h1 style={styles.title}>{text.title}</h1>
        <p style={styles.subtitle}>{text.purpose}</p>
      </header>

      <nav aria-label="Conversation progress" style={styles.progress}>
        <ol style={styles.progressList}>
          {JOURNEY.map((item, index) => (
            <li
              key={item.stage}
              style={index === position ? { ...styles.progressItem, ...styles.progressCurrent } : styles.progressItem}
              aria-current={index === position ? 'step' : undefined}
            >
              <span style={styles.progressNumber}>{index + 1}</span> {item.label}
            </li>
          ))}
        </ol>
        <p style={styles.progressText}>
          Step {position + 1} of {JOURNEY.length}.{' '}
          {turnForStage
            ? 'Read Tomás\'s reply, then use the Continue button when you are ready.'
            : 'Write your message below, then press Send. You can change it and send again.'}
        </p>
      </nav>

      <div style={styles.divider} />

      <section style={styles.section}>
        <h2 style={styles.sectionLabel}>Manager Guidance</h2>
        <div style={styles.card}>
          <ul style={styles.list}>
            {text.manager_guidance.map((item, index) => (
              <li key={index} style={styles.listItem}>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {violations.length > 0 && (
        <section style={styles.section}>
          <div style={styles.violationBox} role="alert">
            <ul style={styles.list}>
              {violations.map((item, index) => (
                <li key={index} style={styles.violationItem}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {lastError && (
        <section style={styles.section}>
          <div style={styles.errorBox} role="alert">
            <p style={styles.errorText}>{lastError}</p>
            <p style={styles.errorText}>Your message is kept. Press Send to try again.</p>
          </div>
        </section>
      )}

      <section style={styles.composerSection}>
        <h2 style={styles.sectionLabel}>{text.input_prompt}</h2>

        {extras}

        <div style={styles.composer}>
          <textarea
            style={styles.textarea}
            value={value}
            onChange={(event) => setInput(stage, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                handleSubmit();
              }
            }}
            disabled={busy}
            maxLength={MAX_MANAGER_INPUT_CHARS}
            aria-label={text.input_prompt}
            aria-describedby={'composer-hint-' + stage}
          />
        </div>
        <p id={'composer-hint-' + stage} style={styles.hint}>
          {value.length} of {MAX_MANAGER_INPUT_CHARS} characters. Press Ctrl+Enter (or Cmd+Enter) to send.
        </p>
      </section>

      <div role="status" aria-live="polite">
        {busy && <p style={styles.hint}>Reply arriving…</p>}
        {turnForStage && !busy && (
          <section style={styles.section} aria-label="Tomás's reply">
            <h2 style={styles.sectionLabel}>Tomás's reply</h2>
            <div style={styles.responseCard}>
              <ul style={styles.list}>
                {turnForStage.employeeLines.map((line, index) => (
                  <li key={index} style={styles.listItem}>
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            {chipFor(turnForStage) && (
              <p style={styles.sourceLabel}>
                <Chip
                  kind={(chipFor(turnForStage) as { kind: 'scripted' | 'mock' | 'live' }).kind}
                  label={(chipFor(turnForStage) as { label?: string }).label}
                />
              </p>
            )}
            {sourceLabel(turnForStage) && (
              <p style={styles.sourceLabel}>{sourceLabel(turnForStage)}</p>
            )}
          </section>
        )}
      </div>

      <div style={styles.ctaRow}>
        <button
          style={!hasInput || busy ? { ...styles.cta, ...styles.disabled } : styles.cta}
          onClick={handleSubmit}
          disabled={!hasInput || busy}
        >
          {busy ? 'Sending…' : turnForStage ? 'Send again' : 'Send'}
        </button>

        <button
          style={
            !submitted || !canAdvance
              ? { ...styles.secondary, ...styles.disabled }
              : styles.secondary
          }
          onClick={handleAdvance}
          disabled={!submitted || !canAdvance}
        >
          {continueLabel(stage)}
        </button>
      </div>
      {submitted && !canAdvance && (
        <p style={styles.hint}>Complete the fields above to continue.</p>
      )}
    </div>
  );
};

export default S02StageScreen;

// -----------------------------
// Styles
// -----------------------------

export const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: 'var(--mt-page-padding, 40px)',
    maxWidth: 'var(--mt-page-max-width, 900px)',
    margin: '0 auto',
    fontFamily: 'Inter, sans-serif',
    lineHeight: 1.6,
    color: '#1a1a1a'
  },
  header: {
    marginBottom: '28px'
  },
  eyebrow: {
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#6b7280',
    margin: '0 0 10px 0'
  },
  title: {
    fontSize: '34px',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    lineHeight: 1.2,
    margin: '0 0 12px 0'
  },
  subtitle: {
    fontSize: '17px',
    color: '#444',
    maxWidth: '68ch',
    margin: 0
  },
  divider: {
    height: '1px',
    backgroundColor: '#e6e6e6',
    margin: '0 0 36px 0'
  },
  section: {
    marginBottom: '32px'
  },
  sectionLabel: {
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#6b7280',
    margin: '0 0 16px 0'
  },
  card: {
    padding: '24px',
    backgroundColor: '#fafafa',
    border: '1px solid #e6e6e6',
    borderRadius: '12px'
  },
  cardNeutral: {
    padding: '20px 24px',
    backgroundColor: '#fafafa',
    border: '1px solid #e6e6e6',
    borderLeft: '3px solid #9ca3af',
    borderRadius: '10px'
  },
  responseCard: {
    padding: '20px 24px',
    backgroundColor: '#fafafa',
    border: '1px solid #e6e6e6',
    borderLeft: '3px solid #0078D4',
    borderRadius: '10px'
  },
  list: {
    paddingLeft: '20px',
    margin: 0
  },
  listItem: {
    fontSize: '15px',
    color: '#444',
    marginBottom: '10px'
  },
  progress: {
    marginBottom: '24px'
  },
  progressList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    listStyle: 'none',
    padding: 0,
    margin: '0 0 12px 0'
  },
  progressItem: {
    fontSize: '13px',
    color: '#4B505D',
    padding: '6px 12px',
    border: '1px solid #CFC3B0',
    borderRadius: '999px',
    backgroundColor: '#fff'
  },
  progressCurrent: {
    color: '#1F2430',
    fontWeight: 700,
    borderColor: '#1F2430',
    backgroundColor: '#F4DC9A'
  },
  progressNumber: {
    fontWeight: 700
  },
  progressText: {
    fontSize: '15px',
    color: '#4B505D',
    margin: 0
  },
  hint: {
    fontSize: '13px',
    color: '#4B505D',
    margin: '8px 0 0 0'
  },
  sourceLabel: {
    fontSize: '13px',
    color: '#6b7280',
    margin: '10px 0 0 0'
  },
  violationBox: {
    backgroundColor: '#fff8f0',
    border: '1px solid #f0d4b0',
    borderLeft: '3px solid #b7791f',
    borderRadius: '10px',
    padding: '18px 20px'
  },
  violationItem: {
    fontSize: '15px',
    color: '#7a5312',
    marginBottom: '8px'
  },
  errorBox: {
    backgroundColor: '#fff5f5',
    border: '1px solid #f3c2c2',
    borderRadius: '10px',
    padding: '18px 20px'
  },
  errorText: {
    fontSize: '15px',
    color: '#7a2626',
    margin: 0
  },
  composerSection: {
    marginTop: '8px',
    paddingTop: '28px',
    borderTop: '1px solid #e6e6e6',
    marginBottom: '32px'
  },
  composer: {
    border: '1px solid #dcdcdc',
    borderRadius: '12px',
    backgroundColor: '#fff',
    padding: '8px'
  },
  textarea: {
    width: '100%',
    minHeight: '150px',
    padding: '14px',
    border: 'none',
    resize: 'vertical',
    fontSize: '16px',
    lineHeight: 1.6,
    fontFamily: 'Inter, sans-serif',
    color: '#1a1a1a',
    backgroundColor: 'transparent',
    boxSizing: 'border-box'
  },
  fieldGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '20px',
    marginBottom: '24px'
  },
  fieldGroup: {
    flex: '1 1 260px',
    minWidth: '240px',
    padding: '20px',
    backgroundColor: '#fafafa',
    border: '1px solid #e6e6e6',
    borderRadius: '12px',
    boxSizing: 'border-box'
  },
  fieldGroupTitle: {
    fontSize: '15px',
    fontWeight: 700,
    margin: '0 0 14px 0'
  },
  field: {
    marginBottom: '14px'
  },
  fieldLabel: {
    display: 'block',
    fontSize: '13px',
    fontWeight: 600,
    color: '#374151',
    marginBottom: '6px'
  },
  input: {
    width: '100%',
    padding: '11px 12px',
    borderRadius: '8px',
    border: '1px solid #d4d4d4',
    backgroundColor: '#fff',
    fontSize: '15px',
    fontFamily: 'Inter, sans-serif',
    color: '#1a1a1a',
    boxSizing: 'border-box'
  },
  ctaRow: {
    marginTop: '12px',
    paddingTop: '28px',
    borderTop: '1px solid #e6e6e6',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    alignItems: 'center'
  },
  cta: {
    padding: '16px 28px',
    fontSize: '17px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    backgroundColor: '#0078D4',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer'
  },
  secondary: {
    padding: '16px 28px',
    fontSize: '16px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    backgroundColor: '#fff',
    color: '#374151',
    border: '1px solid #d4d4d4',
    borderRadius: '8px',
    cursor: 'pointer'
  },
  disabled: {
    opacity: 0.55,
    cursor: 'not-allowed'
  }
};
