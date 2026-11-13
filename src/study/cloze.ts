/**
 * Cloze cards hide part of a sentence. The hidden part is written like
 *   {{c1::fui}}            → shown as [...] until the answer is revealed
 *   {{c1::fui::ir}}        → shown as [ir]   (the text after the second :: is a hint)
 */

export type ClozePart = { kind: 'text'; text: string } | { kind: 'blank'; answer: string; hint: string | null };

const CLOZE_PATTERN = /\{\{c\d+::(.+?)(?:::(.*?))?\}\}/g;

export function hasCloze(text: string): boolean {
  return parseCloze(text).some((part) => part.kind === 'blank');
}

/** Splits a sentence into ordinary text and blanks, in order. */
export function parseCloze(text: string): ClozePart[] {
  const parts: ClozePart[] = [];
  let position = 0;
  for (const match of text.matchAll(CLOZE_PATTERN)) {
    if (match.index > position) parts.push({ kind: 'text', text: text.slice(position, match.index) });
    const hint = match[2]?.trim();
    parts.push({ kind: 'blank', answer: match[1].trim(), hint: hint ? hint : null });
    position = match.index + match[0].length;
  }
  if (position < text.length) parts.push({ kind: 'text', text: text.slice(position) });
  return parts;
}
