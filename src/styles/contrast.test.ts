import fs from 'fs';
import path from 'path';

// Reads the real tokens.css, so the test and the stylesheet cannot drift.
const css = fs.readFileSync(path.join(__dirname, 'tokens.css'), 'utf8');

function token(name: string): string {
  const match = new RegExp('--mt-' + name + ':\\s*(#[0-9A-Fa-f]{6})\\s*;').exec(css);
  if (!match) {
    throw new Error('Token --mt-' + name + ' is missing or not a 6-digit hex colour');
  }
  return match[1];
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const value = parseInt(hex.slice(i, i + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

// [foreground, background, minimum ratio, what it is]
const TEXT_PAIRS: Array<[string, string, number, string]> = [
  ['ink', 'paper', 4.5, 'body text on page'],
  ['ink', 'card', 4.5, 'body text on card'],
  ['ink', 'sunk', 4.5, 'body text on sunk surface'],
  ['ink-2', 'paper', 4.5, 'secondary text on page'],
  ['ink-2', 'card', 4.5, 'secondary text on card'],
  ['ink-2', 'sunk', 4.5, 'secondary text on sunk surface'],
  ['you', 'paper', 4.5, 'manager voice on page'],
  ['you', 'card', 4.5, 'manager voice on card'],
  ['tomas', 'paper', 4.5, 'employee voice on page'],
  ['tomas', 'card', 4.5, 'employee voice on card'],
  ['coach', 'paper', 4.5, 'coach voice on page'],
  ['coach', 'card', 4.5, 'coach voice on card'],
  ['coach', 'sunk', 4.5, 'coach voice on sunk surface'],
  ['amber-ink', 'paper', 4.5, 'amber text on page'],
  ['amber-ink', 'card', 4.5, 'amber text on card'],
  ['ink', 'amber', 4.5, 'primary button label'],
  ['ink', 'amber-hover', 4.5, 'primary button label, hover'],
  ['ink', 'highlight', 4.5, 'text on strength highlight']
];

// Non-text parts that identify a control or show focus need 3:1 (WCAG 1.4.11).
const NON_TEXT_PAIRS: Array<[string, string, number, string]> = [
  ['border-strong', 'paper', 3, 'input border on page'],
  ['border-strong', 'card', 3, 'input border on card'],
  ['focus', 'paper', 3, 'focus ring on page'],
  ['focus', 'card', 3, 'focus ring on card']
];

describe('design token contrast (WCAG 2.x)', () => {
  test.each(TEXT_PAIRS)('%s on %s reaches %s:1 (%s)', (fg, bg, minimum) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(minimum);
  });

  test.each(NON_TEXT_PAIRS)('%s on %s reaches %s:1 (%s)', (fg, bg, minimum) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(minimum);
  });

  test('white label on the live chip background reaches 4.5:1', () => {
    expect(contrast('#FFFFFF', token('you'))).toBeGreaterThanOrEqual(4.5);
  });

  test('the hairline is decorative and is not used as a control border', () => {
    expect(contrast(token('hairline'), token('paper'))).toBeLessThan(3);
    expect(css).toMatch(/--mt-hairline is decorative only/);
  });
});

describe('reduced motion', () => {
  test('every duration token is zeroed under prefers-reduced-motion', () => {
    const durations = css.match(/--mt-dur-[a-z]+:\s*\d+ms/g) || [];
    expect(durations.length).toBeGreaterThanOrEqual(4);

    const reduced = css.slice(css.indexOf('prefers-reduced-motion'));
    durations.forEach((declaration) => {
      const name = declaration.split(':')[0];
      expect(reduced).toMatch(new RegExp(name + ':\\s*0ms'));
    });
  });
});
