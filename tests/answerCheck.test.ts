import { describe, expect, it } from 'vitest';
import {
  acceptableAnswers,
  answerSlots,
  checkAnswer,
  compare,
  normalizeAnswer,
  overallResult,
  suggestedRating,
} from '../src/study/answerCheck';
import { makeCard } from './helpers';

const highlighted = (parts: { text: string; differs: boolean }[]) =>
  parts.map((part) => (part.differs ? `[${part.text}]` : part.text)).join('');

describe('checkAnswer: what counts as correct', () => {
  it('accepts the exact answer', () => {
    expect(checkAnswer('pusieron', 'pusieron').result).toBe('correct');
  });

  it.each([
    ['capital letters', 'Pusieron', 'pusieron'],
    ['extra spaces', '  echar   de  menos ', 'echar de menos'],
    ['missing question marks', 'Jugamos otra', '¿Jugamos otra?'],
    ['an added full stop', 'me da igual.', 'Me da igual'],
    ['commas and exclamation marks', 'hola como estas', '¡Hola, como estas!'],
  ])('ignores %s', (_what, typed, answer) => {
    expect(checkAnswer(typed, answer).result).toBe('correct');
  });

  it('still requires correct accents to be fully right', () => {
    expect(checkAnswer('¿Cómo estás?', '¿Cómo estás?').result).toBe('correct');
  });
});

describe('checkAnswer: accents', () => {
  it.each([
    ['a missing accent', 'esta', 'está'],
    ['an extra accent', 'pusierón', 'pusieron'],
    ['the wrong accent', 'estàs', 'estás'],
    ['n instead of ñ', 'ano', 'año'],
    ['u instead of ü', 'pinguino', 'pingüino'],
    ['several at once', 'como estas', '¿Cómo estás?'],
  ])('counts %s as "almost"', (_what, typed, answer) => {
    expect(checkAnswer(typed, answer).result).toBe('almost');
  });

  it('points at the letter whose accent was missed', () => {
    const check = checkAnswer('esta', 'está');
    expect(highlighted(check.expectedParts)).toBe('est[á]');
    expect(check.expected).toBe('está');
  });

  it('points at every missed accent', () => {
    expect(highlighted(checkAnswer('como estas', 'cómo estás').expectedParts)).toBe('c[ó]mo est[á]s');
  });
});

describe('checkAnswer: wrong answers', () => {
  it('marks a different word as wrong', () => {
    expect(checkAnswer('pusiste', 'pusieron').result).toBe('wrong');
  });

  it('marks a missing word as wrong', () => {
    expect(checkAnswer('desafío', 'el desafío').result).toBe('wrong');
  });

  it('shows the right answer next to the typed one, with the differences marked', () => {
    const check = checkAnswer('pusimos', 'pusieron');
    expect(check.typed).toBe('pusimos');
    expect(check.expected).toBe('pusieron');
    expect(highlighted(check.typedParts)).toBe('pusi[m]o[s]');
    expect(highlighted(check.expectedParts)).toBe('pusi[er]o[n]');
  });

  it('does not mark punctuation, which the check ignores anyway', () => {
    const check = checkAnswer('jugamos otro', '¿Jugamos otra?');
    expect(check.result).toBe('wrong');
    expect(highlighted(check.typedParts)).toBe('jugamos otr[o]');
    expect(highlighted(check.expectedParts)).toBe('¿Jugamos otr[a]?');
  });

  it('treats an empty answer as wrong', () => {
    expect(checkAnswer('   ', 'haga')).toMatchObject({ result: 'wrong', typed: '' });
  });
});

describe('several acceptable answers', () => {
  it('splits on " / " and on ";"', () => {
    expect(acceptableAnswers('Te toca. / Te toca a ti.')).toEqual(['Te toca.', 'Te toca a ti.']);
    expect(acceptableAnswers('el reto; el desafío')).toEqual(['el reto', 'el desafío']);
  });

  it('does not split on a slash without spaces', () => {
    expect(acceptableAnswers('él/ella')).toEqual(['él/ella']);
  });

  it('accepts any of them', () => {
    expect(checkAnswer('te toca a ti', 'Te toca. / Te toca a ti.').result).toBe('correct');
    expect(checkAnswer('Te toca', 'Te toca. / Te toca a ti.').result).toBe('correct');
    expect(checkAnswer('el desafio', 'el reto; el desafío')).toMatchObject({
      result: 'almost',
      expected: 'el desafío',
    });
  });

  it('compares a wrong answer with the alternative it most resembles', () => {
    expect(checkAnswer('el desafiar', 'el reto / el desafío').expected).toBe('el desafío');
  });

  it('lets anything in brackets be left out', () => {
    expect(acceptableAnswers('acordarse (de)')).toEqual(['acordarse (de)', 'acordarse']);
    expect(checkAnswer('acordarse', 'acordarse (de)').result).toBe('correct');
    expect(checkAnswer('acordarse de', 'acordarse (de)').result).toBe('correct');
  });
});

describe('helpers', () => {
  it('normalizes what the check ignores, and nothing else', () => {
    expect(normalizeAnswer('  ¡Hola,  Señor! ')).toBe('hola señor');
  });

  it('marks nothing when two texts are the same apart from capitals', () => {
    const [typed, expected] = compare('Hola', 'hola');
    expect(highlighted(typed)).toBe('Hola');
    expect(highlighted(expected)).toBe('hola');
  });

  it('suggests Good, Hard or Again', () => {
    expect([suggestedRating('correct'), suggestedRating('almost'), suggestedRating('wrong')]).toEqual([3, 2, 1]);
  });

  it('judges a card with several blanks by its worst blank', () => {
    const right = checkAnswer('muevo', 'muevo');
    const accent = checkAnswer('pierdó', 'pierdo');
    const wrong = checkAnswer('gano', 'pierdo');
    expect(overallResult([right, right])).toBe('correct');
    expect(overallResult([right, accent])).toBe('almost');
    expect(overallResult([accent, wrong])).toBe('wrong');
  });
});

describe('answerSlots: which cards are typed, and what the answer is', () => {
  const vocab = makeCard('v', {}, 1, { type: 'vocab', front: 'el tablero', back: 'the board' });

  it('asks for the Spanish on English → Spanish cards', () => {
    expect(answerSlots(vocab, 'production')).toEqual([{ expected: 'el tablero', hint: null }]);
  });

  it('does not ask for typing on Spanish → English cards', () => {
    expect(answerSlots(vocab, 'recognition')).toBeNull();
    expect(answerSlots({ ...vocab, type: 'listening' }, 'recognition')).toBeNull();
    expect(answerSlots({ ...vocab, type: 'grammar' }, 'recognition')).toBeNull();
  });

  it('asks for the form on conjugation cards', () => {
    const card = makeCard('c', {}, 1, { type: 'conjugation', front: 'poner → pretérito, ellos', back: 'pusieron' });
    expect(answerSlots(card, 'recognition')).toEqual([{ expected: 'pusieron', hint: null }]);
  });

  it('asks for each blank of a cloze card, with its hint', () => {
    const card = makeCard('z', {}, 1, {
      type: 'cloze',
      front: 'Si {{c1::muevo::mover}} el caballo, {{c2::pierdo}} la dama.',
    });
    expect(answerSlots(card, 'recognition')).toEqual([
      { expected: 'muevo', hint: 'mover' },
      { expected: 'pierdo', hint: null },
    ]);
  });
});
