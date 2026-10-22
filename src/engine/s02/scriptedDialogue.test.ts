import { readFileSync } from 'fs';
import { join } from 'path';

import { S02InputStage } from '../../types/scenarioBlueprint';
import {
  POSE_FOR_STYLE,
  PriorTurnLike,
  SCRIPTED_REPLIES,
  consideringCount,
  selectScriptedReply
} from './scriptedDialogue';
import { EMPLOYEE_RESPONSE_STYLES } from './styleSelection';

const STAGES: S02InputStage[] = ['sbi', 'exploration', 'hypotheses', 'commitments', 'closing'];
const STAGE_FOR_PREFIX: Record<string, S02InputStage> = {
  SBI: 'sbi',
  EXP: 'exploration',
  HYP: 'hypotheses',
  COM: 'commitments',
  CLO: 'closing'
};

const NEUTRAL = 'What happened from your side?';
const OWNS_PART = 'I rushed that earlier feedback and I never followed up.';
const OUTAGE = 'The outage shows you shut people down.';

// ---------------------------------------------------------------------------
// The approved document is the source of truth for the text.
// ---------------------------------------------------------------------------

function repliesFromDocument() {
  const document = readFileSync(join(__dirname, '../../../docs/P2_TOMAS_DIALOGUE_DRAFT.md'), 'utf8');
  const rows: Array<{ id: string; pose: string; lines: string[] }> = [];
  document.split('\n').forEach((row) => {
    const cells = row.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
    if (cells.length === 3 && /^[A-Z]{3}-[A-Z]\d( \(safety\))?$/.test(cells[0])) {
      rows.push({ id: cells[0].split(' ')[0], pose: cells[1], lines: cells[2].split(' / ').map((line) => line.trim()) });
    }
  });
  return rows;
}

describe('the shipped text matches the approved document', () => {
  test('same replies, in the same order, with identical lines and poses', () => {
    const fromDocument = repliesFromDocument();
    expect(fromDocument).toHaveLength(42);
    expect(SCRIPTED_REPLIES.map((r) => ({ id: r.id, pose: r.pose, lines: r.lines }))).toEqual(fromDocument);
  });

  test('each reply sits in the stage its id prefix names', () => {
    SCRIPTED_REPLIES.forEach((reply) => {
      expect(reply.stage).toBe(STAGE_FOR_PREFIX[reply.id.slice(0, 3)]);
    });
  });
});

// ---------------------------------------------------------------------------
// Mechanical lint, mirroring the authoring rules in the document.
// ---------------------------------------------------------------------------

const BANNED = [
  'outage', 'nadia', 'staff engineer', 'caused', 'promotion', 'promoted', 'rating', 'salary',
  'sorry', 'apolog', 'postmortem', 'post-mortem', 'noticed the silence',
  'i agree', "you're right", 'my mistake', 'i was wrong', 'my fault', 'i accept'
];

describe('dialogue lint', () => {
  test('42 unique replies', () => {
    expect(SCRIPTED_REPLIES).toHaveLength(42);
    expect(new Set(SCRIPTED_REPLIES.map((r) => r.id)).size).toBe(42);
  });

  test('1 to 3 lines each, every line under 600 characters and non-empty', () => {
    SCRIPTED_REPLIES.forEach((reply) => {
      expect(reply.lines.length).toBeGreaterThanOrEqual(1);
      expect(reply.lines.length).toBeLessThanOrEqual(3);
      reply.lines.forEach((line) => {
        expect(line.trim().length).toBeGreaterThan(0);
        expect(line.length).toBeLessThan(600);
      });
    });
  });

  test('no banned topic or concession phrase appears', () => {
    SCRIPTED_REPLIES.forEach((reply) => {
      const text = reply.lines.join(' ').toLowerCase();
      BANNED.forEach((phrase) => expect([reply.id, text.includes(phrase)]).toEqual([reply.id, false]));
    });
  });

  test('the only request for writing is in the closing (CLO-M1)', () => {
    const asking = SCRIPTED_REPLIES.filter((r) => /writing|written|short note|write /i.test(r.lines.join(' '))).map((r) => r.id);
    expect(asking).toEqual(['CLO-M1']);
  });

  test('every Considering reply keeps something unresolved; from Hypotheses on, the technical question', () => {
    const considering = SCRIPTED_REPLIES.filter((r) => r.pose === 'Considering');
    expect(considering.map((r) => r.id)).toEqual(['SBI-O1', 'EXP-O1', 'EXP-O2', 'HYP-O1', 'HYP-O2', 'COM-O1', 'CLO-O1']);
    considering.forEach((reply) => {
      const text = reply.lines.join(' ').toLowerCase();
      expect(['technical', 'not saying', "don't know", 'not convinced', 'still'].some((k) => text.includes(k))).toBe(true);
      if (['hypotheses', 'commitments', 'closing'].includes(reply.stage)) {
        expect(text).toContain('technical');
      }
    });
  });

  test('every stage has at least one reply for every style, so selection never falls through', () => {
    STAGES.forEach((stage) => {
      EMPLOYEE_RESPONSE_STYLES.forEach((style) => {
        const found = SCRIPTED_REPLIES.filter((r) => r.stage === stage && r.pose === POSE_FOR_STYLE[style]);
        expect([stage, style, found.length > 0]).toEqual([stage, style, true]);
      });
      expect(SCRIPTED_REPLIES.some((r) => r.stage === stage && r.pose === 'Considering')).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Selection: poses, alternation, and the restrained-first Considering order.
// ---------------------------------------------------------------------------

function turnFrom(stage: S02InputStage, lines: string[]): PriorTurnLike {
  return { stage, employeeLines: lines };
}

/** Plays a session turn by turn, feeding each reply back in as a prior turn. */
function playSession(turns: Array<{ stage: S02InputStage; input: string; violated?: boolean }>): string[] {
  const prior: PriorTurnLike[] = [];
  return turns.map((turn) => {
    const { reply } = selectScriptedReply({
      stage: turn.stage,
      managerInput: turn.input,
      priorTurns: prior.slice(),
      violated: !!turn.violated
    });
    prior.push(turnFrom(turn.stage, reply.lines));
    return reply.id;
  });
}

describe('selectScriptedReply', () => {
  test('the pose follows the response style the existing rules choose', () => {
    expect(selectScriptedReply({ stage: 'exploration', managerInput: NEUTRAL, priorTurns: [], violated: false }).reply.pose).toBe('Explaining');
    expect(selectScriptedReply({ stage: 'exploration', managerInput: OUTAGE, priorTurns: [], violated: false }).reply.pose).toBe('Guarded');
    expect(selectScriptedReply({ stage: 'sbi', managerInput: 'Your reply caused the silence.', priorTurns: [], violated: false }).reply.pose).toBe('Composed');
    expect(selectScriptedReply({ stage: 'commitments', managerInput: 'I will send the note on Friday.', priorTurns: [], violated: false }).reply.pose).toBe('Measured');
  });

  test('variants alternate with the turns already taken in the stage', () => {
    expect(playSession([
      { stage: 'exploration', input: NEUTRAL },
      { stage: 'exploration', input: NEUTRAL },
      { stage: 'exploration', input: NEUTRAL },
      { stage: 'hypotheses', input: NEUTRAL }
    ])).toEqual(['EXP-E1', 'EXP-E2', 'EXP-E1', 'HYP-E1']);
  });

  test('a stage with a single variant for a pose always returns it', () => {
    expect(playSession([
      { stage: 'commitments', input: 'Let us fix a date.' },
      { stage: 'commitments', input: 'Let us fix a date.' }
    ]).every((id) => id.startsWith('COM-M'))).toBe(true);
  });

  test('bringing in the outage, a named source or causality blocks the Considering reply', () => {
    for (const extra of [' The outage proves it.', ' Nadia told me you cut people off.', ' So your reply caused the silence.']) {
      const result = selectScriptedReply({ stage: 'exploration', managerInput: OWNS_PART + extra, priorTurns: [], violated: false });
      expect(result.reply.pose).not.toBe('Considering');
      expect(['Guarded', 'Composed']).toContain(result.reply.pose);
    }
  });

  test('a prohibition in the input blocks the Considering reply', () => {
    const blocked = selectScriptedReply({ stage: 'exploration', managerInput: OWNS_PART, priorTurns: [], violated: true });
    expect(blocked.reply.pose).not.toBe('Considering');
    const allowed = selectScriptedReply({ stage: 'exploration', managerInput: OWNS_PART, priorTurns: [], violated: false });
    expect(allowed.reply.id).toBe('EXP-O1');
  });
});

describe('Considering: restrained first, fuller later', () => {
  test('the first Considering reply in a session is the stage\'s restrained line, the next the fuller one', () => {
    expect(playSession([
      { stage: 'exploration', input: OWNS_PART },
      { stage: 'exploration', input: OWNS_PART }
    ])).toEqual(['EXP-O1', 'EXP-O2']);
  });

  test('a first acknowledgement that comes late is still restrained', () => {
    expect(playSession([{ stage: 'hypotheses', input: OWNS_PART }])).toEqual(['HYP-O1']);
  });

  test('across stages openness only steps up: EXP-O1, then HYP-O2, then the single COM and CLO lines', () => {
    expect(playSession([
      { stage: 'exploration', input: OWNS_PART },
      { stage: 'hypotheses', input: OWNS_PART },
      { stage: 'commitments', input: OWNS_PART },
      { stage: 'closing', input: OWNS_PART }
    ])).toEqual(['EXP-O1', 'HYP-O2', 'COM-O1', 'CLO-O1']);
  });

  test('non-Considering turns in between do not use up the restrained reply', () => {
    expect(playSession([
      { stage: 'exploration', input: NEUTRAL },
      { stage: 'exploration', input: OWNS_PART },
      { stage: 'hypotheses', input: NEUTRAL },
      { stage: 'hypotheses', input: OWNS_PART }
    ])).toEqual(['EXP-E1', 'EXP-O1', 'HYP-E1', 'HYP-O2']);
  });

  test('the count is derived from the turns alone', () => {
    const o1 = SCRIPTED_REPLIES.find((r) => r.id === 'EXP-O1')!;
    const e1 = SCRIPTED_REPLIES.find((r) => r.id === 'EXP-E1')!;
    expect(consideringCount([])).toBe(0);
    expect(consideringCount([turnFrom('exploration', e1.lines)])).toBe(0);
    expect(consideringCount([turnFrom('exploration', e1.lines), turnFrom('exploration', o1.lines)])).toBe(1);
  });

  test('deterministic: the same session gives the same replies every time', () => {
    const session = [
      { stage: 'sbi' as const, input: NEUTRAL },
      { stage: 'exploration' as const, input: OWNS_PART },
      { stage: 'exploration' as const, input: OUTAGE },
      { stage: 'hypotheses' as const, input: OWNS_PART },
      { stage: 'commitments' as const, input: 'I will send the note on Friday.' },
      { stage: 'closing' as const, input: OWNS_PART }
    ];
    const first = playSession(session);
    for (let i = 0; i < 5; i += 1) {
      expect(playSession(session)).toEqual(first);
    }
    // EXP-G2, not G1: variants alternate by turns already taken in the stage,
    // and the Considering reply was the first turn of Exploration.
    expect(first).toEqual(['SBI-E1', 'EXP-O1', 'EXP-G2', 'HYP-O2', 'COM-M1', 'CLO-O1']);
  });

  test('a replay starts restrained again: a reset session repeats the opening sequence exactly', () => {
    const opening = [
      { stage: 'exploration' as const, input: OWNS_PART },
      { stage: 'exploration' as const, input: OWNS_PART }
    ];
    const firstRun = playSession(opening);
    const replay = playSession(opening);
    expect(firstRun).toEqual(['EXP-O1', 'EXP-O2']);
    expect(replay).toEqual(firstRun);
  });

  test('the same prior turns and input always select the same reply (a pure function)', () => {
    const prior = [turnFrom('exploration', SCRIPTED_REPLIES.find((r) => r.id === 'EXP-O1')!.lines)];
    const results = [0, 1, 2, 3].map(() =>
      selectScriptedReply({ stage: 'hypotheses', managerInput: OWNS_PART, priorTurns: prior, violated: false }).reply.id
    );
    expect(new Set(results)).toEqual(new Set(['HYP-O2']));
  });
});
