import { s02ResumeMessage } from './s02Navigation';

test('the resume message names the saved step, or nothing when there is none', () => {
  expect(s02ResumeMessage(null)).toBeUndefined();
  expect(s02ResumeMessage('exploration')).toContain('Step 2 of 5');
  expect(s02ResumeMessage('closing')).toContain('Step 5 of 5');
  expect(s02ResumeMessage('scoring')).toContain('the scoring step');
});
