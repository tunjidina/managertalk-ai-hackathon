import React from 'react';

/**
 * The ManagerTalk mark: a door ajar, with a sliver of light on the opening
 * edge. `openness` (0 to 5) widens the light and narrows the door leaf, one
 * step per conversation stage, so the same drawing is the brand mark and the
 * stage tracker. The light marks progress through the conversation only. It
 * is not a score and says nothing about how well the manager is doing.
 *
 * Colours come from the design tokens. The widening animation between stages
 * is added with the roleplay screen, using the doorway duration token.
 */
export const DOORWAY_MAX_OPENNESS = 5;

interface DoorwayMarkProps {
  size?: number;
  openness?: number;
  /** Set when the mark stands alone, for example as a logo; otherwise it is decorative. */
  title?: string;
  className?: string;
}

const LEFT = 12;
const RIGHT = 36;

/** Width of the lit gap for a given openness, in viewBox units. */
export function doorwayGap(openness: number): number {
  const clamped = Math.max(0, Math.min(DOORWAY_MAX_OPENNESS, Math.round(openness)));
  return 3 + clamped * 3.6;
}

const DoorwayMark: React.FC<DoorwayMarkProps> = ({
  size = 40,
  openness = 1,
  title,
  className
}) => {
  const gap = doorwayGap(openness);
  const edge = RIGHT - gap;
  // The leaf narrows toward the far side as it swings, which is the whole
  // perspective cue: the hinge edge keeps full height, the free edge shortens.
  const leaf = `M${LEFT} 8 L${edge} ${8 + 2.2} L${edge} ${43 - 2.2} L${LEFT} 43 Z`;
  const light = `M${edge} ${8 + 2.2} L${RIGHT} 8 L${RIGHT} 43 L${edge} ${43 - 2.2} Z`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      data-openness={openness}
    >
      <path d="M9 43h30" stroke="var(--mt-ink, #1F2430)" strokeWidth={2.5} strokeLinecap="round" />
      <path d={light} fill="var(--mt-amber, #E9A83A)" />
      <path d={leaf} fill="var(--mt-ink, #1F2430)" />
      <circle cx={edge - 3} cy={26} r={1.5} fill="var(--mt-paper, #F6F0E6)" />
      <rect
        x={9}
        y={5}
        width={30}
        height={38}
        rx={3}
        fill="none"
        stroke="var(--mt-ink, #1F2430)"
        strokeWidth={2.5}
      />
    </svg>
  );
};

export default DoorwayMark;
