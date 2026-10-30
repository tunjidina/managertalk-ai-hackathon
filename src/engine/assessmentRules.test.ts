import fs from 'fs';
import path from 'path';

import { S02_CRITERION_KEYS } from './s02/criteria';

// A static check of firestore.rules. It confirms the rule text says what the
// design requires; it does not execute the rules (that needs the emulator).
const rules = fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8');

function blockFor(collection: string): string {
  const start = rules.indexOf('match /' + collection + '/{docId}');
  expect(start).toBeGreaterThan(-1);
  const rest = rules.slice(start);
  const next = rest.indexOf('match /', 10);
  return next === -1 ? rest : rest.slice(0, next);
}

const block = blockFor('assessmentRecords');

test('records are immutable: no update, no delete', () => {
  expect(block).toMatch(/allow update: if false;/);
  expect(block).toMatch(/allow delete: if false;/);
});

test('create requires the owner: signed in, userId equals uid, document id starts with the uid', () => {
  expect(block).toContain('request.auth != null');
  expect(block).toContain('request.resource.data.userId == request.auth.uid');
  expect(block).toContain("docId.matches(request.auth.uid + '_.*')");
});

test('create allows exactly the whitelisted fields, so free text cannot be written', () => {
  const only = block.match(/hasOnly\(\[([\s\S]*?)\]\)/);
  expect(only).not.toBeNull();
  const fields = (only as RegExpMatchArray)[1].match(/'[A-Za-z]+'/g)!.map((f) => f.replace(/'/g, '')).sort();
  expect(fields).toEqual(
    ['createdAt', 'criteria', 'feedbackBranch', 'rubricVersion', 'runId', 'scenarioId', 'tier', 'userId'].sort()
  );
  expect(block).toContain("request.resource.data.tier in ['excellent', 'adequate', 'poor']");
  expect(block).toContain('request.resource.data.createdAt == request.time');
  expect(S02_CRITERION_KEYS).toHaveLength(17);
});

test('read is limited to the owner (a missing document may be read for the duplicate check)', () => {
  expect(block).toMatch(/allow read: if request\.auth != null\s*&&\s*\(resource == null\s*\|\|\s*resource\.data\.userId == request\.auth\.uid\)/);
});

test('no permissive catch-all was added to the rules', () => {
  expect(rules).not.toMatch(/match \/\{document=\*\*\}/);
  expect(rules).not.toMatch(/allow (read|write)[^;]*:\s*if true/);
});
