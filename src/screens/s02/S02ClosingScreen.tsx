import React from 'react';

import S02StageScreen, { styles } from './S02StageScreen';
import { S02BlueprintMissing, useS02Blueprint } from './S02BlueprintGuard';
import {
  currentRunInput,
  useS02SessionState
} from '../../store/s02SessionState';
import { scoreRun } from '../../engine/s02/scoringEngine';
import { selectFeedback } from '../../engine/s02/feedbackSelector';

/**
 * Stage 5 — Closing.
 *
 * The checkpoint date and initiator are separate fields because the
 * closing constraints require both by name, and because every commitment
 * date must fall on or before the checkpoint — a check that needs a
 * parseable date, not a date mentioned somewhere in prose.
 *
 * Scoring and feedback are resolved here, on the way out of the stage, so
 * the scoring screen renders a completed result rather than computing
 * during render.
 */
const S02ClosingScreen: React.FC = () => {
  const blueprint = useS02Blueprint();

  const checkpointDate = useS02SessionState((state) => state.checkpointDate);
  const checkpointInitiator = useS02SessionState((state) => state.checkpointInitiator);
  const setCheckpoint = useS02SessionState((state) => state.setCheckpoint);
  const setScore = useS02SessionState((state) => state.setScore);
  const setFeedback = useS02SessionState((state) => state.setFeedback);

  if (!blueprint) {
    return <S02BlueprintMissing />;
  }

  const handleBeforeAdvance = () => {
    const run = currentRunInput(useS02SessionState.getState());
    const score = scoreRun(run, blueprint.scoring_rubric);
    setScore(score);
    setFeedback(
      selectFeedback(score.signals, score.tier, blueprint.feedback_logic)
    );
  };

  const extras = (
    <div style={styles.fieldGrid}>
      <div style={styles.fieldGroup}>
        <div style={styles.field}>
          <label style={styles.fieldLabel} htmlFor="s02-checkpoint-date">
            follow-up date
          </label>
          <input
            id="s02-checkpoint-date"
            type="date"
            style={styles.input}
            value={checkpointDate}
            onChange={(event) =>
              setCheckpoint(event.target.value, checkpointInitiator)
            }
          />
        </div>
      </div>

      <div style={styles.fieldGroup}>
        <div style={styles.field}>
          <label style={styles.fieldLabel} htmlFor="s02-checkpoint-initiator">
            initiator
          </label>
          <input
            id="s02-checkpoint-initiator"
            style={styles.input}
            value={checkpointInitiator}
            onChange={(event) =>
              setCheckpoint(checkpointDate, event.target.value)
            }
          />
        </div>
      </div>
    </div>
  );

  return (
    <S02StageScreen
      blueprint={blueprint}
      stage="closing"
      extras={extras}
      onBeforeAdvance={handleBeforeAdvance}
    />
  );
};

export default S02ClosingScreen;
