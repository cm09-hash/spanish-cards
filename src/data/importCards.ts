/** Adds the cards from an import file to the database. */
import type { StoredCard } from '../types';
import { newSchedulingState } from '../study/scheduler';
import { parseCardFile, planImport } from './cardFile';
import { addCards, getAllCards } from './db';

export interface ImportResult {
  added: number;
  duplicates: number;
  /** One line per card in the file that couldn't be used. */
  problems: string[];
}

/** Throws a FileProblem (with a message fit to show the user) if the file can't be read at all. */
export async function importCardFile(text: string): Promise<ImportResult> {
  const { cards, problems } = parseCardFile(text);

  const existing = await getAllCards();
  const { toAdd, duplicates } = planImport(cards, existing);

  const now = new Date();
  const firstPosition = existing.reduce((highest, card) => Math.max(highest, card.position), 0) + 1;
  const newCards: StoredCard[] = toAdd.map((card, index) => ({
    ...card,
    addedAt: now.toISOString(),
    position: firstPosition + index,
    scheduling: newSchedulingState(card.id, now),
    paused: false,
    leech: false,
    flag: null,
    editedAt: null,
  }));
  await addCards(newCards);

  return { added: newCards.length, duplicates, problems };
}
