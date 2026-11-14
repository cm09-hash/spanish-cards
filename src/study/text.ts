/** Small text helpers shared by search, answer checking and conjugation tables. */

/** Removes accents and other marks: "está" → "esta", "año" → "ano", "pingüino" → "pinguino". */
export function withoutAccents(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .normalize('NFC');
}

/**
 * Makes text easy to match: lower case, accents removed, extra spaces removed.
 * So typing "desafio" finds "el desafío".
 */
export function simplify(text: string): string {
  return withoutAccents(text).toLowerCase().replace(/\s+/g, ' ').trim();
}
