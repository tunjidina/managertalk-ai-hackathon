import React from 'react';

import styles from './Button.module.css';

type ButtonVariant = 'primary' | 'secondary' | 'quiet';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

/**
 * Primary is the one amber action on a screen; secondary is outlined; quiet
 * is text-only. A native button throughout, so keyboard and assistive
 * technology behaviour is the browser's own. type defaults to "button" so a
 * button inside a form never submits it by accident.
 */
const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  className,
  type = 'button',
  ...rest
}) => (
  <button
    type={type}
    className={[styles.button, styles[variant], className].filter(Boolean).join(' ')}
    {...rest}
  />
);

export default Button;
