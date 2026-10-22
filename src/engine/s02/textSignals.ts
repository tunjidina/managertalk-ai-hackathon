// src/engine/s02/textSignals.ts
//
// Shared detectors for the MT-S02 engines.
//
// These are MARKERS, not UI copy. Nothing in this file is rendered. They
// exist because the blueprint's prohibitions are stated behaviourally
// ("No outage reference", "Stating Tomás caused silence") and something
// has to turn free text into a boolean.
//
// Every detector is deliberately conservative: a false negative leaves a
// run scored more generously, a false positive accuses a manager of a
// prohibition they did not commit. The second failure is worse, so the
// marker sets are narrow and require reasonably explicit phrasing.

/** Normalises smart quotes, dashes and whitespace before matching. */
export function normalise(input: string): string {
  return input
    .toLowerCase()
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Word-boundary matching, NOT substring matching.
 *
 * Substring matching is wrong here and was caught by the engine probe: the
 * marker 'hr' matched inside "three weeks ago", which routed a run that
 * did everything right into the escalation feedback branch. 'pip' inside
 * "pipeline" and 'raise' inside "raised a concern" are the same failure.
 *
 * Lookbehind would be tidier but is unsupported in older Safari, which
 * this project's browserslist still includes, so the boundary is expressed
 * as an optional non-alphanumeric character on each side.
 */
function markerPattern(marker: string): RegExp {
  const cleaned = escapeRegExp(marker.trim());
  return new RegExp('(^|[^a-z0-9])' + cleaned + '([^a-z0-9]|$)');
}

export function containsAny(input: string, markers: string[]): boolean {
  const text = normalise(input);
  for (let i = 0; i < markers.length; i += 1) {
    if (markerPattern(markers[i]).test(text)) {
      return true;
    }
  }
  return false;
}

export function matchedMarkers(input: string, markers: string[]): string[] {
  const text = normalise(input);
  const hits: string[] = [];
  for (let i = 0; i < markers.length; i += 1) {
    if (markerPattern(markers[i]).test(text)) {
      hits.push(markers[i]);
    }
  }
  return hits;
}

// -----------------------------
// Prohibition markers
// -----------------------------

/** "No outage reference" (stage 1), "No use of outage as behavioural proof". */
export const OUTAGE_MARKERS: string[] = [
  'outage',
  'incident',
  'postmortem',
  'post-mortem',
  'went down',
  'production failure',
  'invalidation path'
];

/** "Stating Tomás caused silence", "No causal claims not supported by evidence". */
export const CAUSALITY_MARKERS: string[] = [
  'caused the silence',
  'you caused',
  'because of you',
  'you made the room',
  'you shut',
  'as a result of your',
  'your behaviour caused',
  'your behavior caused',
  'you are the reason',
  "you're the reason",
  'this led to the outage',
  'which is why the'
];

/** "Diagnosing personality", "No personality diagnoses". */
export const PERSONALITY_MARKERS: string[] = [
  'you are defensive',
  "you're defensive",
  'you are arrogant',
  "you're arrogant",
  'your personality',
  'your ego',
  'you have a problem with',
  'you always',
  'you never',
  'the kind of person',
  'type of person',
  'insecure',
  'narcissis'
];

/** "Using Nadia's report as opening evidence" / as decisive evidence. */
export const NAMED_SOURCE_MARKERS: string[] = [
  'nadia',
  'a staff engineer told me',
  'someone reported',
  'someone told me',
  'it has been reported'
];

/** "Trading evidence", "Correcting his account in real time". */
export const REBUTTAL_MARKERS: string[] = [
  'actually, ',
  "that's not what",
  'that is not what',
  'the data shows',
  'the data says',
  'i have evidence',
  'let me correct',
  'you are wrong',
  "you're wrong",
  'but the routing data',
  'but the peer feedback'
];

/** "Reassurance beyond authority", "No promises about promotion...". */
export const REASSURANCE_MARKERS: string[] = [
  'your job is safe',
  'nothing to worry about',
  "don't worry",
  'do not worry',
  'this will not affect your',
  'this won\'t affect your',
  'promotion',
  'promoted',
  'pay rise',
  'pay raise',
  'bonus',
  'rating will',
  'you will be fine',
  "you'll be fine"
];

/** "Implying resolution", "Must not imply resolution". */
export const RESOLUTION_MARKERS: string[] = [
  'this is resolved',
  'matter is closed',
  'case closed',
  'we are done with this',
  "we're done with this",
  'put this behind us',
  'consider this settled',
  'no need to revisit'
];

/** "No unilateral intervention with Aoife". */
export const AOIFE_MARKERS: string[] = ['aoife'];

/** Commitments requiring concession of the technical position. */
export const CONCESSION_MARKERS: string[] = [
  'admit you were wrong',
  'accept you were wrong',
  'concede',
  'agree that you were wrong',
  'acknowledge you were wrong',
  'apologise',
  'apologize',
  'say sorry'
];

/**
 * "Attitudinal commitments" — the blueprint lists three by name
 * (be more mindful / work on tone / be more approachable). These extend
 * that set to the same grammatical family: a disposition rather than an act.
 */
export const ATTITUDINAL_MARKERS: string[] = [
  'be more mindful',
  'be mindful',
  'work on tone',
  'work on my tone',
  'work on his tone',
  'be more approachable',
  'be approachable',
  'be more aware',
  'be aware of',
  'be more patient',
  'be patient',
  'be more open',
  'be open to',
  'be more receptive',
  'be less defensive',
  'try to be',
  'make an effort to be',
  'be more collaborative',
  'be more respectful',
  'improve my attitude',
  'improve his attitude',
  'reflect on'
];

/** Escalation into formal process, skipping intermediate steps. */
export const FORMAL_PROCESS_MARKERS: string[] = [
  'hr',
  'human resources',
  'performance improvement plan',
  'pip',
  'formal warning',
  'written warning',
  'disciplinary',
  'performance management',
  'escalate this to',
  'on record',
  'formal process'
];

/** Manager naming her own earlier process failure as a live hypothesis. */
export const MANAGER_CONTRIBUTION_MARKERS: string[] = [
  'i rushed',
  'i was rushed',
  'rushed',
  'eight minutes',
  'end of our 1:1',
  'end of the 1:1',
  'i did not follow up',
  "i didn't follow up",
  'i never followed up',
  'my own contribution',
  'i may have contributed',
  'i contributed',
  'my handling',
  'the way i delivered',
  'how i delivered',
  'i should have'
];

/** Hypotheses that do not locate the cause in the employee. */
export const NON_EMPLOYEE_CAUSE_MARKERS: string[] = [
  'rota',
  'workstream',
  'sprint review format',
  'meeting format',
  'deference',
  'defer to',
  'team culture',
  'reorg',
  'working preference',
  'written preference',
  'prefers writing',
  'in writing',
  'my own',
  'i rushed',
  'i did not follow up',
  "i didn't follow up",
  'i should have'
];

// -----------------------------
// Structural detectors
// -----------------------------

/** ISO date, D/M/Y, or an explicitly named month-and-day. */
const DATE_PATTERNS: RegExp[] = [
  /\b\d{4}-\d{2}-\d{2}\b/,
  /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/,
  /\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i,
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}\b/i
];

export function containsExplicitDate(input: string): boolean {
  for (let i = 0; i < DATE_PATTERNS.length; i += 1) {
    if (DATE_PATTERNS[i].test(input)) {
      return true;
    }
  }
  return false;
}

/** Counts question marks — the exploration stage asks for 3–5 questions. */
export function countQuestions(input: string): number {
  const matches = input.match(/\?/g);
  return matches ? matches.length : 0;
}

/**
 * Counts distinct listed items: newline-separated lines, or numbered /
 * bulleted entries. Used for the hypotheses stage.
 */
export function countListItems(input: string): number {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length > 1) {
    return lines.length;
  }

  const numbered = input.match(/(^|\s)\d+[).]\s/g);
  if (numbered && numbered.length > 1) {
    return numbered.length;
  }

  const semicolons = input.split(';').filter((part) => part.trim().length > 0);
  return semicolons.length;
}

export function wordCount(input: string): number {
  const trimmed = input.trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}
