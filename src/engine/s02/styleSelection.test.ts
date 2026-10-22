import { EMPLOYEE_RESPONSE_STYLES, chooseStyle } from './styleSelection';

describe('chooseStyle', () => {
  test('outage or named-source language calls for an evidence challenge', () => {
    expect(chooseStyle('sbi', 'The outage shows you shut people down.')).toBe('evidence_challenge');
    expect(chooseStyle('exploration', 'Nadia told me you cut people off.')).toBe('evidence_challenge');
  });

  test('causality language calls for composed disagreement', () => {
    expect(chooseStyle('sbi', 'Your reply caused the silence in the room.')).toBe('composed_disagreement');
  });

  test('commitments and closing default to procedural compliance, other stages to technical detail', () => {
    expect(chooseStyle('commitments', 'I will send the note by Friday.')).toBe('procedural_compliance');
    expect(chooseStyle('closing', 'We will meet again on the 14th.')).toBe('procedural_compliance');
    expect(chooseStyle('exploration', 'What did you understand Aoife to be asking?')).toBe('technical_detail');
  });

  test('the outage rule outranks the stage default', () => {
    expect(chooseStyle('closing', 'Remember the outage.')).toBe('evidence_challenge');
  });

  test('every style it can return is in the accepted list', () => {
    const inputs = ['The outage.', 'It caused this.', 'Plain text.'];
    for (const stage of ['sbi', 'closing'] as const) {
      for (const input of inputs) {
        expect(EMPLOYEE_RESPONSE_STYLES).toContain(chooseStyle(stage, input));
      }
    }
  });
});
