import React from 'react';

import S02StageScreen from './S02StageScreen';
import { S02BlueprintMissing, useS02Blueprint } from './S02BlueprintGuard';

/** Stage 3 — Root cause hypotheses. None is a finding. */
const S02HypothesesScreen: React.FC = () => {
  const blueprint = useS02Blueprint();

  if (!blueprint) {
    return <S02BlueprintMissing />;
  }

  return <S02StageScreen blueprint={blueprint} stage="hypotheses" />;
};

export default S02HypothesesScreen;
