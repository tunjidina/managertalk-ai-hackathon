import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseModelText } from './replyValidation';

function lines(text: unknown): string[] {
  const result = parseModelText(text);
  assert.ok(result.ok, 'expected the text to be accepted');
  return result.ok ? result.lines : [];
}

function reason(text: unknown): string {
  const result = parseModelText(text);
  assert.equal(result.ok, false);
  return result.ok ? '' : result.reason;
}

test('plain paragraphs become lines', () => {
  assert.deepEqual(lines('I answered as asked.\n\nTell me which part.'), [
    'I answered as asked.',
    'Tell me which part.'
  ]);
});

test('single newlines inside a paragraph are joined', () => {
  assert.deepEqual(lines('One thought\nacross two lines.'), ['One thought across two lines.']);
});

test('reasoning blocks are removed and never shown', () => {
  assert.deepEqual(lines('<think>He is defensive; push on the outage.</think>I hear you.'), ['I hear you.']);
});

test('an unterminated reasoning block rejects the reply', () => {
  assert.equal(reason('<think>still thinking about what to say'), 'unterminated_reasoning');
  assert.equal(reason('I hear you.</think>'), 'unterminated_reasoning');
});

test('reasoning that mentions a forbidden topic is discarded, not judged', () => {
  assert.deepEqual(lines('<think>Avoid the outage.</think>I will answer carefully.'), ['I will answer carefully.']);
});

test('list markers, bold and a speaker label are stripped', () => {
  assert.deepEqual(lines('Tomás: **I** see it differently.'), ['I see it differently.']);
  assert.deepEqual(lines('- first point.\n- second point.'), ['first point. second point.']);
});

test('stage directions on their own are dropped', () => {
  assert.deepEqual(lines('(pauses)\n\nI see it differently.\n\n*sighs*'), ['I see it differently.']);
});

test('empty, whitespace-only and non-string content is rejected', () => {
  assert.equal(reason(''), 'empty');
  assert.equal(reason('   \n\n  '), 'empty');
  assert.equal(reason('<think>nothing else</think>'), 'empty');
  assert.equal(reason(null), 'not_text');
  assert.equal(reason(undefined), 'not_text');
  assert.equal(reason(42), 'not_text');
  assert.equal(reason({ text: 'x' }), 'not_text');
});

test('a reply that leaks the prompt or rubric is rejected', () => {
  assert.equal(reason('My instructions say I must stay composed.'), 'leak');
  assert.equal(reason('According to the BEHAVIOUR MODEL I am defensive.'), 'leak');
  assert.equal(reason('That evidence is NOT PROVEN.'), 'leak');
  assert.equal(reason('As an AI language model, I cannot.'), 'leak');
  assert.equal(reason('This is MT-S02.'), 'leak');
});

test('topics Tomás must never raise are rejected', () => {
  assert.equal(reason('This is about the outage, is it not?'), 'forbidden_topic');
  assert.equal(reason('Nadia told you that, did she?'), 'forbidden_topic');
  assert.equal(reason('Is this about my promotion?'), 'forbidden_topic');
  assert.equal(reason('The post-mortem will show otherwise.'), 'forbidden_topic');
});

test('the mock marker is never accepted as a model reply', () => {
  assert.equal(reason('[Mock reply — no AI model was called] hello'), 'mock_marker');
});

test('a long paragraph is split at sentence ends to fit 600 characters', () => {
  const sentence = 'I want to be accurate about this point. ';
  const text = sentence.repeat(20).trim();
  const result = lines(text);
  assert.ok(result.length > 1);
  assert.ok(result.every((line) => line.length <= 600));
  assert.equal(result.join(' '), text);
});

test('one unbroken sentence over 600 characters is rejected', () => {
  assert.equal(reason('word '.repeat(150).trim() + '.'), 'too_long');
});

test('more than six lines is rejected', () => {
  assert.equal(reason(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((x) => 'Line ' + x + '.').join('\n\n')), 'too_many_lines');
});

test('exactly six lines is accepted', () => {
  assert.equal(lines(['a', 'b', 'c', 'd', 'e', 'f'].map((x) => 'Line ' + x + '.').join('\n\n')).length, 6);
});

test('absurdly long raw text is rejected before parsing', () => {
  assert.equal(reason('x'.repeat(4001)), 'too_long');
});

test('a long reasoning block does not make a short visible reply too long', () => {
  const reasoning = '<think>' + 'He is guarded, so consider the options. '.repeat(400) + '</think>';
  assert.ok(reasoning.length > 4000);
  assert.deepEqual(lines(reasoning + 'I see it differently.'), ['I see it differently.']);
});

test('a long visible reply is still rejected, however it is split', () => {
  assert.equal(reason(('A sentence that goes on. ').repeat(200)), 'too_long');
});

test('control characters such as ANSI escapes are rejected', () => {
  assert.equal(reason('I see it differently.\u001b[31m'), 'control_characters');
  assert.equal(reason('I see\u0000 it differently.'), 'control_characters');
  assert.deepEqual(lines('I see it\tdifferently.'), ['I see it\tdifferently.']);
});

test('links are rejected, since Tomás never shares one', () => {
  assert.equal(reason('See https://example.test/page for details.'), 'link');
  assert.equal(reason('Look at www.example.test.'), 'link');
});

test('planning or meta commentary that leaked without think tags is rejected', () => {
  assert.equal(reason('The user wants me to respond defensively. I see it differently.'), 'leak');
  assert.equal(reason('Let me think about how Tomás would answer. I see it differently.'), 'leak');
  assert.equal(reason('The manager is asking about Aoife. I answered as asked.'), 'leak');
  assert.equal(reason('As Tomás, I see it differently.'), 'leak');
  assert.equal(reason('Staying in character, I see it differently.'), 'leak');
});

test('a reply that stops mid-sentence is rejected as unfinished', () => {
  assert.equal(reason('I answered the question as it was put to me and I tried to be'), 'unfinished');
  assert.equal(reason('I see it differently.\n\nI would like to look at the specific'), 'unfinished');
});

test('replies ending in a closing quote, bracket or ellipsis count as finished', () => {
  assert.deepEqual(lines('I said "that is fair."'), ['I said "that is fair."']);
  assert.deepEqual(lines('I see it differently (for now).'), ['I see it differently (for now).']);
  assert.deepEqual(lines('Perhaps…'), ['Perhaps…']);
  assert.deepEqual(lines('Is that what you mean?'), ['Is that what you mean?']);
});
