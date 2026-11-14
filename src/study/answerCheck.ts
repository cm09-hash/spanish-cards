/**
 * Checking a typed answer against the right one. Pure logic.
 *
 * The check is forgiving about things that don't matter (capital letters, extra
 * spaces, punctuation) and strict about spelling. An answer that is right except
 * for its accents counts as "almost".
 */
import type { AnswerResult, CardContent, Direction, Rating } from '../types';
import { parseCloze } from './cloze';
import { withoutAccents } from './text';

/** A stretch of text, and whether it differs from the other answer (so it can be highlighted). */
export interface TextPart {
  text: string;
  differs: boolean;
}

export interface AnswerCheck {
  result: AnswerResult;
  /** What was typed, tidied of extra spaces. */
  typed: string;
  /** The acceptable answer closest to what was typed. */
  expected: string;
  /** The same two texts cut into pieces, for highlighting the differences. */
  typedParts: TextPart[];
  expectedParts: TextPart[];
}

/** One thing the learner has to type: the right answer, and an optional hint to show in the box. */
export interface AnswerSlot {
  expected: string;
  hint: string | null;
}

/**
 * What has to be typed for a card, or null if the card isn't a typing card.
 * Typing is for producing Spanish: English → Spanish cards, conjugations and cloze blanks.
 */
export function answerSlots(card: CardContent, direction: Direction): AnswerSlot[] | null {
  if (direction === 'production') return [{ expected: card.front, hint: null }];
  if (card.type === 'conjugation') return [{ expected: card.back, hint: null }];
  if (card.type === 'cloze') {
    return parseCloze(card.front).flatMap((part) =>
      part.kind === 'blank' ? [{ expected: part.answer, hint: part.hint }] : [],
    );
  }
  return null;
}

/**
 * Every answer that counts as right for a card's answer text.
 *  - Alternatives are separated by " / " or ";":   "el desafío / el reto"  → either one
 *  - Anything in brackets may be left out:          "acordarse (de)"        → with or without "de"
 */
export function acceptableAnswers(answerText: string): string[] {
  const alternatives = answerText
    .split(/\s+\/\s+|\s*;\s*/)
    .map((alternative) => alternative.trim())
    .filter(Boolean);
  const withoutBrackets = alternatives
    .map((alternative) => alternative.replace(/\s*\([^)]*\)/g, '').trim())
    .filter(Boolean);
  return [...new Set([...alternatives, ...withoutBrackets])];
}

/** Strips away everything the check ignores: capital letters, punctuation and extra spaces. */
export function normalizeAnswer(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function checkAnswer(typedText: string, answerText: string): AnswerCheck {
  const typed = typedText.replace(/\s+/g, ' ').trim();
  const answers = acceptableAnswers(answerText);
  const typedKey = normalizeAnswer(typed);

  let result: AnswerResult = 'wrong';
  let expected = answers.find((answer) => normalizeAnswer(answer) === typedKey);
  if (expected !== undefined) {
    result = 'correct';
  } else {
    expected = answers.find((answer) => withoutAccents(normalizeAnswer(answer)) === withoutAccents(typedKey));
    if (expected !== undefined) result = 'almost';
  }
  // A wrong answer is shown next to whichever right answer it resembles most.
  expected ??= closest(typed, answers) ?? answerText;

  const [typedParts, expectedParts] = compare(typed, expected);
  return { result, typed, expected, typedParts, expectedParts };
}

/** For cards with several blanks: the whole card is only as good as its worst blank. */
export function overallResult(checks: AnswerCheck[]): AnswerResult {
  if (checks.some((check) => check.result === 'wrong')) return 'wrong';
  return checks.some((check) => check.result === 'almost') ? 'almost' : 'correct';
}

/** The rating the app suggests. It is only a suggestion: you still choose the button. */
export function suggestedRating(result: AnswerResult): Rating {
  return result === 'correct' ? 3 : result === 'almost' ? 2 : 1;
}

function closest(typed: string, answers: string[]): string | undefined {
  let best: string | undefined;
  let bestScore = -1;
  for (const answer of answers) {
    // Shared letters, as a share of the longer text: 1 = identical, 0 = nothing in common.
    const score = commonLetters(typed, answer).length / Math.max(typed.length, answer.length, 1);
    if (score > bestScore) [best, bestScore] = [answer, score];
  }
  return best;
}

const sameLetter = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Finds the letters two texts have in common, in order (the "longest common subsequence").
 * Returns their positions as [position in a, position in b] pairs.
 */
function commonLetters(a: string, b: string): [number, number][] {
  // lengths[i][j] = how many letters a.slice(i) and b.slice(j) have in common.
  const lengths = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i][j] = sameLetter(a[i], b[j])
        ? lengths[i + 1][j + 1] + 1
        : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (sameLetter(a[i], b[j])) pairs.push([i++, j++]);
    else if (lengths[i + 1][j] >= lengths[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

/** Cuts two texts into pieces, marking the letters that are not shared between them. */
export function compare(a: string, b: string): [TextPart[], TextPart[]] {
  const pairs = commonLetters(a, b);
  const sharedInA = new Set(pairs.map(([i]) => i));
  const sharedInB = new Set(pairs.map(([, j]) => j));
  return [toParts(a, sharedInA), toParts(b, sharedInB)];
}

function toParts(text: string, shared: Set<number>): TextPart[] {
  const parts: TextPart[] = [];
  [...text].forEach((letter, index) => {
    // Only letters and digits are ever marked: punctuation and spaces don't count in the check.
    const differs = !shared.has(index) && /[\p{L}\p{N}]/u.test(letter);
    const last = parts[parts.length - 1];
    if (last && last.differs === differs) last.text += letter;
    else parts.push({ text: letter, differs });
  });
  return parts;
}
