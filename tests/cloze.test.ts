import { describe, expect, it } from 'vitest';
import { hasCloze, parseCloze } from '../src/study/cloze';

describe('cloze', () => {
  it('splits a sentence into text and blanks', () => {
    expect(parseCloze('Ayer {{c1::fui}} al mercado.')).toEqual([
      { kind: 'text', text: 'Ayer ' },
      { kind: 'blank', answer: 'fui', hint: null },
      { kind: 'text', text: ' al mercado.' },
    ]);
  });

  it('reads an optional hint after a second ::', () => {
    expect(parseCloze('{{c1::fui::ir}}')).toEqual([{ kind: 'blank', answer: 'fui', hint: 'ir' }]);
  });

  it('handles several blanks in one sentence', () => {
    const blanks = parseCloze('Si {{c1::tuviera::tener}} tiempo, {{c2::viajaría}}.').filter(
      (part) => part.kind === 'blank',
    );
    expect(blanks.map((blank) => blank.answer)).toEqual(['tuviera', 'viajaría']);
  });

  it('knows whether a text contains a blank', () => {
    expect(hasCloze('Yo {{c1::tengo}} hambre.')).toBe(true);
    expect(hasCloze('Yo tengo hambre.')).toBe(false);
    expect(hasCloze('Yo {{c1::}} hambre.')).toBe(false);
  });
});
