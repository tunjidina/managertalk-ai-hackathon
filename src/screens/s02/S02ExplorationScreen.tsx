import React from 'react';

import S02StageScreen from './S02StageScreen';
import { S02BlueprintMissing, useS02Blueprint } from './S02BlueprintGuard';

/** Stage 2 — Exploration. Tomás's account is elicited before rebuttal. */
const S02ExplorationScreen: React.FC = () => {
  const blueprint = useS02Blueprint();

  if (!blueprint) {
    return <S02BlueprintMissing />;
  }

  return <S02StageScreen blueprint={blueprint} stage="exploration" />;
};

export default S02ExplorationScreen;
