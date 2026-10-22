import React from 'react';

import styles from './Card.module.css';

type CardVoice = 'you' | 'tomas' | 'coach';
type CardTone = 'raised' | 'sunk';

interface CardProps extends React.HTMLAttributes<HTMLElement> {
  as?: 'div' | 'section' | 'article';
  tone?: CardTone;
  /** Adds the rule colour for a speaker. The speaker's name must still be written in the card. */
  voice?: CardVoice;
}

const Card: React.FC<CardProps> = ({
  as: Tag = 'div',
  tone = 'raised',
  voice,
  className,
  ...rest
}) => (
  <Tag
    className={[styles.card, styles[tone], voice ? styles[voice] : '', className]
      .filter(Boolean)
      .join(' ')}
    {...rest}
  />
);

export default Card;
