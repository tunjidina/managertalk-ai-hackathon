import React from 'react';

import Icon, { IconName } from './Icon';
import styles from './Chip.module.css';

/**
 * Says where a reply came from, so authored text is never mistaken for a
 * model. The three kinds differ in shape as well as colour (hollow, dashed,
 * filled), and always carry an icon and words.
 *
 *   scripted  authored lines chosen by rules; no model was called
 *   mock      the server pipeline with its mock model; no AI model was called
 *   live      a model-generated reply; pass the model id from the reply as
 *             `label`. Do not render this kind until live inference has been
 *             implemented and verified.
 */
export type ChipKind = 'scripted' | 'mock' | 'live';

interface ChipProps {
  kind: ChipKind;
  /** Overrides the default wording, for example "Live · <model id>". */
  label?: string;
}

const DEFAULT_LABEL: Record<ChipKind, string> = {
  scripted: 'Scripted',
  mock: 'Mock · no AI model called',
  live: 'Live'
};

const ICON: Record<ChipKind, IconName> = {
  scripted: 'scripted',
  mock: 'mock',
  live: 'live'
};

const Chip: React.FC<ChipProps> = ({ kind, label }) => (
  <span className={[styles.chip, styles[kind]].join(' ')} data-kind={kind}>
    <Icon name={ICON[kind]} size={14} />
    <span>{label || DEFAULT_LABEL[kind]}</span>
  </span>
);

export default Chip;
