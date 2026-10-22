// functions/src/replyValidation.ts
//
// Turns a model's raw text into the `lines` of a reply, or rejects it.
//
// The model's text is untrusted output. It is never shown as it arrives:
// reasoning blocks are removed, formatting is normalised, and a reply that
// leaks the prompt, mentions topics Tomás must never raise, or does not fit
// the wire limits is rejected whole. A rejection becomes a failure the
// client answers from the scripted engine, never a displayed reply.

import { MAX_EMPLOYEE_LINES, MAX_EMPLOYEE_LINE_CHARS } from './validate';

export type RejectionReason =
  | 'not_text'
  | 'empty'
  | 'unterminated_reasoning'
  | 'leak'
  | 'forbidden_topic'
  | 'mock_marker'
  | 'control_characters'
  | 'link'
  | 'unfinished'
  | 'too_long'
  | 'too_many_lines';

export type ParsedReply = { ok: true; lines: string[] } | { ok: false; reason: RejectionReason };

/** Text that only appears if the prompt, rubric or instructions leaked into the reply. */
const LEAK_MARKERS = [
  'behaviour model',
  'branching constraints',
  'commitment constraints',
  'closing constraints',
  'scoring constraints',
  'feedback constraints',
  'ambiguity rules',
  'ambiguity to preserve',
  'evidence rules',
  'evidence pack',
  'not proven',
  'prohibitions',
  'conversation flow rules',
  'system prompt',
  'my instructions',
  'these instructions',
  'as an ai',
  'language model',
  'scenario:',
  'primary competency',
  'mt-s0'
];

/**
 * Planning or meta commentary. A real reply from Tomás never talks about
 * "the user" or "the manager" in the third person or about playing a role; if
 * it does, the model's reasoning has leaked into the visible text without
 * <think> tags and the reply is rejected.
 */
const META_MARKERS = [
  'the user',
  'the manager',
  'the employee',
  'the assistant',
  'let me think',
  'i should respond',
  'roleplay',
  'role-play',
  'in character',
  'as tomás',
  'as tomas'
];

/** Topics the blueprint forbids Tomás from introducing. */
const FORBIDDEN_TOPICS = [
  'outage',
  'postmortem',
  'post-mortem',
  'nadia',
  'staff engineer',
  'promotion',
  'promoted',
  'pay rise',
  'salary',
  'performance rating'
];

const MOCK_MARKER = '[mock';

/** Raw text beyond this is refused unread. Reasoning may be inlined, so this is generous. */
const MAX_RAW_CHARS = 100_000;

/** The visible reply, after reasoning is removed, must be a short roleplay turn. */
const MAX_VISIBLE_CHARS = 4000;

/** Control characters other than tab and newline (ANSI escapes, NUL and the like). */
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

/** A finished sentence ends in terminal punctuation, optionally followed by a closing quote or bracket. */
const SENTENCE_END = /[.!?…]["'”’)\]]*$/;

function stripReasoning(text: string): string | null {
  const withoutBlocks = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  if (/<\/?think>/i.test(withoutBlocks)) {
    return null;
  }
  return withoutBlocks;
}

function cleanParagraph(paragraph: string): string {
  return paragraph
    .replace(/\*\*/g, '')
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, '')
    .replace(/^\s*(?:tom[aá]s)\s*:\s*/i, '')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** A paragraph that is only a stage direction, such as "(pauses)" or "*sighs*". */
function isStageDirection(paragraph: string): boolean {
  return /^\([^)]*\)$/.test(paragraph) || /^\*[^*]*\*$/.test(paragraph);
}

/** Splits an over-long paragraph at sentence ends so each piece fits the line limit. */
function splitToFit(paragraph: string): string[] | null {
  if (paragraph.length <= MAX_EMPLOYEE_LINE_CHARS) {
    return [paragraph];
  }
  const sentences = paragraph.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [paragraph];
  const pieces: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length > MAX_EMPLOYEE_LINE_CHARS) {
      return null;
    }
    if (current && (current + ' ' + trimmed).length > MAX_EMPLOYEE_LINE_CHARS) {
      pieces.push(current);
      current = trimmed;
    } else {
      current = current ? current + ' ' + trimmed : trimmed;
    }
  }
  if (current) {
    pieces.push(current);
  }
  return pieces;
}

export function parseModelText(content: unknown): ParsedReply {
  if (typeof content !== 'string') {
    return { ok: false, reason: 'not_text' };
  }
  if (content.length > MAX_RAW_CHARS) {
    return { ok: false, reason: 'too_long' };
  }

  const visible = stripReasoning(content);
  if (visible === null) {
    return { ok: false, reason: 'unterminated_reasoning' };
  }

  if (visible.length > MAX_VISIBLE_CHARS) {
    return { ok: false, reason: 'too_long' };
  }
  if (CONTROL_CHARACTERS.test(visible)) {
    return { ok: false, reason: 'control_characters' };
  }

  const lower = visible.toLowerCase();
  if (/https?:\/\/|www\./.test(lower)) {
    return { ok: false, reason: 'link' };
  }
  if (lower.indexOf(MOCK_MARKER) !== -1) {
    return { ok: false, reason: 'mock_marker' };
  }
  if (LEAK_MARKERS.some((marker) => lower.indexOf(marker) !== -1)) {
    return { ok: false, reason: 'leak' };
  }
  if (META_MARKERS.some((marker) => lower.indexOf(marker) !== -1)) {
    return { ok: false, reason: 'leak' };
  }
  if (FORBIDDEN_TOPICS.some((topic) => lower.indexOf(topic) !== -1)) {
    return { ok: false, reason: 'forbidden_topic' };
  }

  const paragraphs = visible
    .split(/\n\s*\n/)
    .map(cleanParagraph)
    .filter((paragraph) => paragraph.length > 0 && !isStageDirection(paragraph));

  if (paragraphs.length === 0) {
    return { ok: false, reason: 'empty' };
  }

  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const pieces = splitToFit(paragraph);
    if (!pieces) {
      return { ok: false, reason: 'too_long' };
    }
    lines.push(...pieces);
  }

  if (lines.length > MAX_EMPLOYEE_LINES) {
    return { ok: false, reason: 'too_many_lines' };
  }

  // A reply cut off by a token limit that the provider did not flag ends
  // mid-sentence. The last line must be a finished sentence.
  if (!SENTENCE_END.test(lines[lines.length - 1])) {
    return { ok: false, reason: 'unfinished' };
  }

  return { ok: true, lines };
}
