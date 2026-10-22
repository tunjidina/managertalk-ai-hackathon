import React, { useState } from 'react';
import { useNavigationState } from '../store/navigationState';
import { useConversationState } from '../store/conversationState';

import { runStateMachine } from '../engine/stateMachine';
import { scenarioData } from '../utils/jsonLoader';

import StageChecklist from '../components/StageChecklist';
import BranchPanel from '../components/BranchPanel';

interface TranscriptEntry {
  role: 'manager' | 'system';
  text: string;
}

const formatLabel = (value: string): string =>
  value
    .split('_')
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const ConversationFlowScreen: React.FC = () => {
  const { setCurrentScreen } = useNavigationState();
  const {
    stage,
    branch,
    setStage,
    setBranch,
    setLastManagerMessage,
    setFailure,
    failure,
    failureReason
  } = useConversationState();

  const [managerMessage, setManagerMessage] = useState('');
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);

  const handleSubmit = () => {
    const result = runStateMachine({
      stage,
      userMessage: managerMessage
    });

    // Store last message
    setLastManagerMessage(managerMessage);

    // Record what the manager said
    setTranscript((entries: TranscriptEntry[]) => [
      ...entries,
      { role: 'manager', text: managerMessage }
    ]);

    // Handle failure
    if (result.failure) {
      setFailure(true, result.failureReason || 'Unknown failure');
      return;
    }

    // Clear failure if previously set
    setFailure(false, null);

    // Note the transition
    setTranscript((entries: TranscriptEntry[]) => [
      ...entries,
      {
        role: 'system',
        text: result.branch
          ? `Stage: ${formatLabel(result.nextStage)} • Branch detected: ${formatLabel(result.branch)}`
          : `Stage: ${formatLabel(result.nextStage)}`
      }
    ]);

    // Update stage + branch
    setStage(result.nextStage);
    if (result.branch) {
      setBranch(result.branch);
    }

    // If we reached commitments → go to CommitmentBuilderScreen
    if (result.nextStage === 'commitments') {
      setCurrentScreen('commitment_builder');
      return;
    }

    // If we reached closing → go to ClosingScreen
    if (result.nextStage === 'closing') {
      setCurrentScreen('closing');
      return;
    }

    // If completed → go to FeedbackScreen
    if (result.nextStage === 'completed') {
      setCurrentScreen('feedback');
      return;
    }

    // Otherwise remain in conversation flow
    setManagerMessage('');
  };

  const renderStagePanel = () => {
    switch (stage) {
      case 'opening':
        return (
          <StageChecklist
            title="Opening"
            items={scenarioData.conversation.opening.required_behaviors}
          />
        );

      case 'performance_sbi':
        return (
          <StageChecklist
            title="Performance (SBI)"
            items={scenarioData.conversation.performance_sbi.required_behaviors}
          />
        );

      case 'exploration':
        return (
          <>
            <StageChecklist
              title="Exploration"
              items={['Follow signals', 'Avoid reassurance', 'Surface perspective']}
            />
            {branch && (
              <BranchPanel
                branch={branch}
                definition={scenarioData.conversation.exploration.branches[branch]}
              />
            )}
          </>
        );

      case 'commitments':
        return (
          <StageChecklist
            title="Commitments"
            items={[
              'Capture manager commitment',
              'Capture employee commitment',
              'Ensure dates and owners'
            ]}
          />
        );

      case 'closing':
        return (
          <StageChecklist
            title="Closing"
            items={scenarioData.conversation.closing.required_behaviors}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <p style={styles.eyebrow}>Conversation</p>
        <h1 style={styles.title}>{scenarioData.title}</h1>

        <div style={styles.badgeRow}>
          <span style={styles.badge}>{formatLabel(stage)}</span>
          {branch && <span style={styles.badgeMuted}>{formatLabel(branch)}</span>}
        </div>
      </header>

      <div style={styles.divider} />

      {/* Guidance */}
      <section style={styles.section}>
        <h2 style={styles.sectionLabel}>Stage Guidance</h2>
        <div style={styles.guidanceStack}>{renderStagePanel()}</div>
      </section>

      {/* Failure notice */}
      {failure && (
        <div style={styles.failureBox}>
          <h3 style={styles.failureTitle}>Conversation Issue</h3>
          <p style={styles.failureText}>{failureReason}</p>
        </div>
      )}

      {/* Transcript */}
      <section style={styles.section}>
        <h2 style={styles.sectionLabel}>Transcript</h2>

        {transcript.length === 0 ? (
          <p style={styles.emptyTranscript}>
            Nothing said yet. Your messages appear here as the conversation progresses.
          </p>
        ) : (
          <div style={styles.transcript}>
            {transcript.map((entry: TranscriptEntry, idx: number) => (
              <div
                key={idx}
                style={entry.role === 'manager' ? styles.rowRight : styles.rowLeft}
              >
                <div
                  style={
                    entry.role === 'manager'
                      ? styles.bubbleManager
                      : styles.bubbleSystem
                  }
                >
                  <p style={styles.bubbleLabel}>
                    {entry.role === 'manager' ? 'You' : 'Session'}
                  </p>
                  <p style={styles.bubbleText}>{entry.text}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Composer */}
      <section style={styles.composerSection}>
        <h2 id="manager-message-label" style={styles.sectionLabel}>Your Message</h2>

        <div style={styles.composer}>
          <textarea
            id="manager-message"
            aria-labelledby="manager-message-label"
            style={styles.textarea}
            value={managerMessage}
            onChange={(e) => setManagerMessage(e.target.value)}
            placeholder="Type what you would say to the employee..."
          />

          <div style={styles.composerFooter}>
            <span style={styles.hint}>
              Name the evidence. Avoid reassurance and promises.
            </span>

            <button
              style={
                managerMessage.trim().length === 0
                  ? { ...styles.cta, ...styles.ctaDisabled }
                  : styles.cta
              }
              onClick={handleSubmit}
              disabled={managerMessage.trim().length === 0}
            >
              Submit Message
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ConversationFlowScreen;

// -----------------------------
// Styles
// -----------------------------

const styles: Record<string, React.CSSProperties> = {
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
    margin: '0 0 14px 0'
  },
  badgeRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px'
  },
  badge: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '999px',
    backgroundColor: '#eef4fb',
    color: '#0b5fa5',
    fontSize: '13px',
    fontWeight: 600
  },
  badgeMuted: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '999px',
    backgroundColor: '#f2f2f2',
    color: '#555',
    fontSize: '13px',
    fontWeight: 600
  },
  divider: {
    height: '1px',
    backgroundColor: '#e6e6e6',
    margin: '0 0 36px 0'
  },
  section: {
    marginBottom: '40px'
  },
  sectionLabel: {
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#6b7280',
    margin: '0 0 16px 0'
  },
  guidanceStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  failureBox: {
    backgroundColor: '#fff5f5',
    border: '1px solid #f3c2c2',
    borderRadius: '10px',
    padding: '18px 20px',
    marginBottom: '32px'
  },
  failureTitle: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#9b2c2c',
    margin: '0 0 6px 0'
  },
  failureText: {
    fontSize: '15px',
    color: '#7a2626',
    margin: 0
  },
  emptyTranscript: {
    fontSize: '15px',
    color: '#6b7280',
    backgroundColor: '#fafafa',
    border: '1px dashed #dcdcdc',
    borderRadius: '10px',
    padding: '20px',
    margin: 0
  },
  transcript: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px'
  },
  rowRight: {
    display: 'flex',
    justifyContent: 'flex-end'
  },
  rowLeft: {
    display: 'flex',
    justifyContent: 'flex-start'
  },
  bubbleManager: {
    maxWidth: '78%',
    padding: '14px 18px',
    borderRadius: '14px 14px 4px 14px',
    backgroundColor: '#eef4fb',
    border: '1px solid #d6e5f5'
  },
  bubbleSystem: {
    maxWidth: '78%',
    padding: '14px 18px',
    borderRadius: '14px 14px 14px 4px',
    backgroundColor: '#fafafa',
    border: '1px solid #e6e6e6'
  },
  bubbleLabel: {
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: '#6b7280',
    margin: '0 0 6px 0'
  },
  bubbleText: {
    fontSize: '15px',
    color: '#1a1a1a',
    margin: 0,
    whiteSpace: 'pre-wrap'
  },
  composerSection: {
    marginTop: '8px',
    paddingTop: '28px',
    borderTop: '1px solid #e6e6e6'
  },
  composer: {
    border: '1px solid #dcdcdc',
    borderRadius: '12px',
    backgroundColor: '#fff',
    padding: '8px 8px 12px 8px'
  },
  textarea: {
    width: '100%',
    minHeight: '128px',
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
  composerFooter: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 6px'
  },
  hint: {
    fontSize: '13px',
    color: '#6b7280'
  },
  cta: {
    padding: '14px 26px',
    fontSize: '16px',
    fontWeight: 600,
    backgroundColor: '#0078D4',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer'
  },
  ctaDisabled: {
    backgroundColor: '#c8d6e2',
    cursor: 'not-allowed'
  }
};


