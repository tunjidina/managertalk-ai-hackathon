import React from 'react';

/**
 * The ManagerTalk icon set: 24px grid, 1.75 stroke, round caps and joins.
 * One path string per shape, drawn in currentColor so an icon takes the
 * colour of the text beside it. Icons are decorative by default and always
 * sit next to a text label; pass `title` only for an icon that stands alone.
 */
const PATHS = {
  observe: [
    'M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z',
    'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'
  ],
  question: [
    'M4 5h16v11H11l-4 4v-4H4z',
    'M10 9.2a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6.9',
    'M12 13.8h.01'
  ],
  hypothesis: [
    'M6 3.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
    'M6 16.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
    'M18 4.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
    'M6 7.5v9',
    'M18 8.5c0 3-3 4-6 4s-6 0-6 4'
  ],
  commitment: [
    'M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
    'M4 10h16',
    'M8 3v4',
    'M16 3v4',
    'M9 15.5l2 2 4-4'
  ],
  door: ['M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17', 'M4 21h16', 'M14.5 12h.01'],
  evidence: [
    'M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z',
    'M14 3v5h5',
    'M9 13h6',
    'M9 17h6'
  ],
  pencil: ['M4 20l1-4L16 5a2.1 2.1 0 0 1 3 3L8 19l-4 1z', 'M14 7l3 3'],
  met: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M8 12.5l2.7 2.7L16 9.5'],
  partial: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M8.5 12h7'],
  tripped: ['M5 21V4', 'M5 4h11l-2 4 2 4H5'],
  replay: ['M4 12a8 8 0 1 0 2.5-5.8', 'M4 4v4h4'],
  compare: [
    'M4 5h6a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4z',
    'M20 5h-6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h6z'
  ],
  scripted: ['M8 4H5v16h3', 'M16 4h3v16h-3', 'M9 9h6', 'M9 13h6'],
  live: [
    'M12 12h.01',
    'M8.5 8.5a5 5 0 0 0 0 7',
    'M15.5 8.5a5 5 0 0 1 0 7',
    'M5.6 5.6a9 9 0 0 0 0 12.8',
    'M18.4 5.6a9 9 0 0 1 0 12.8'
  ],
  mock: [
    'M4 8V6a2 2 0 0 1 2-2h2',
    'M12 4h.01',
    'M16 4h2a2 2 0 0 1 2 2v2',
    'M20 12h.01',
    'M20 16v2a2 2 0 0 1-2 2h-2',
    'M12 20h.01',
    'M8 20H6a2 2 0 0 1-2-2v-2',
    'M4 12h.01'
  ],
  send: ['M21 3L10 14', 'M21 3l-7 18-4-7-7-4 18-7z'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  info: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 11v5', 'M12 8h.01']
} as const;

export type IconName = keyof typeof PATHS;

export const ICON_NAMES = Object.keys(PATHS) as IconName[];

interface IconProps {
  name: IconName;
  size?: number;
  /** Set only when the icon stands alone; otherwise it is hidden from assistive technology. */
  title?: string;
  className?: string;
}

const Icon: React.FC<IconProps> = ({ name, size = 20, title, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    role={title ? 'img' : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
    focusable="false"
  >
    {PATHS[name].map((d, index) => (
      <path key={index} d={d} />
    ))}
  </svg>
);

export default Icon;
