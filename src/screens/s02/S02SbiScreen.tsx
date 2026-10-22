import React from 'react';

import S02StageScreen from './S02StageScreen';
import { S02BlueprintMissing, useS02Blueprint } from './S02BlueprintGuard';

/** Stage 1 — Situation–Behaviour–Impact. */
const S02SbiScreen: React.FC = () => {
  const blueprint = useS02Blueprint();

  if (!blueprint) {
    return <S02BlueprintMissing />;
  }

  return <S02StageScreen blueprint={blueprint} stage="sbi" />;
};

export default S02SbiScreen;
