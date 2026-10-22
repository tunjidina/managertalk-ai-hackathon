/**
 * Shared layout metrics.
 *
 * The single source of truth for these three numbers is src/index.css, which
 * declares them as CSS custom properties and overrides them below 480px. This
 * module re-exports them as inline-style values so screens stay responsive
 * without needing media queries they cannot express.
 *
 * Each value carries the previous desktop literal as a var() fallback, so a
 * screen renders exactly as it did before if the stylesheet is missing.
 *
 * To change a metric, edit index.css. Editing only this file changes the
 * fallback, not the value that is actually used.
 */

import React from 'react';

export const PAGE_PADDING = 'var(--mt-page-padding, 40px)';
export const PAGE_MAX_WIDTH = 'var(--mt-page-max-width, 900px)';
export const CARD_MIN_WIDTH = 'var(--mt-card-min-width, 300px)';

/**
 * The standard page container metrics, for new screens.
 *
 * Spread this before a screen's own properties:
 *
 *   page: { ...pageContainer, fontFamily: 'Inter, sans-serif', ... }
 *
 * Existing screens reference the constants above directly rather than
 * spreading this, so that adopting the responsive values required no change
 * to their style objects beyond the two values themselves.
 */
export const pageContainer: React.CSSProperties = {
  padding: PAGE_PADDING,
  maxWidth: PAGE_MAX_WIDTH,
  margin: '0 auto',
  boxSizing: 'border-box'
};
