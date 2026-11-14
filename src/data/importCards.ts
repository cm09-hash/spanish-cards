/** Adds the cards from an import file to the database. */
import { hasTwoDirections } from '../study/directions';
import { findSprintByName } from '../study/sprints';
import type { CardContent, Sprint, StoredCard } from '../types';
import { parseCardFile, planImport, type SprintInFile } from './cardFile';
import { newStoredCard } from './cardUpgrade';
import { addImportedCards, getAllCards, getSprints } from './db';

export interface ImportResult {
  added: number;
  duplicates: number;
  /** One line per card in the file that couldn't be used. */
  problems: string[];
  /** The sprint named at the top of the file, if any, and whether it is new to the app. */
  sprint: { name: string; endDate: string; isNew: boolean } | null;
}

/** Throws a FileProblem (with a message fit to show the user) if the file can't be read at all. */
export async function importCardFile(text: string): Promise<ImportResult> {
  const { cards, recognitionOnly, sprint: sprintInFile, problems } = parseCardFile(text);

  const [existing, sprints] = await Promise.all([getAllCards(), getSprints()]);
  const { toAdd, duplicates } = planImport(cards, existing);

  const now = new Date();
  const firstPosition = existing.reduce((highest, card) => Math.max(highest, card.position), 0) + 1;
  const newCards: StoredCard[] = toAdd.map((card, index) =>
    newStoredCard(sprintInFile ? withTag(card, sprintInFile.tag) : card, {
      now,
      position: firstPosition + index,
      production: hasTwoDirections(card.type) && !recognitionOnly.has(card.id),
    }),
  );

  const sprint = sprintInFile ? sprintToSave(sprintInFile, sprints, now) : null;
  await addImportedCards(newCards, sprint?.sprint ?? null);

  return {
    added: newCards.length,
    duplicates,
    problems,
    sprint: sprint && { name: sprint.sprint.name, endDate: sprint.sprint.endDate, isNew: sprint.isNew },
  };
}

/** Every card in a sprint file carries the sprint's tag. */
function withTag(card: CardContent, tag: string): CardContent {
  return card.tags.includes(tag) ? card : { ...card, tags: [...card.tags, tag] };
}

/**
 * Importing a second file for a sprint that already exists (same name) adds to that sprint
 * instead of creating a twin: the tag is added, and the end date and variety are brought up to date.
 */
function sprintToSave(inFile: SprintInFile, sprints: Sprint[], now: Date): { sprint: Sprint; isNew: boolean } {
  const known = findSprintByName(sprints, inFile.name);
  if (known) {
    const sprint: Sprint = {
      ...known,
      endDate: inFile.endDate,
      variety: inFile.variety,
      tags: [...new Set([...known.tags, inFile.tag])],
      finishedNoticeSeen: false,
    };
    return { sprint, isNew: false };
  }
  return {
    isNew: true,
    sprint: {
      id: newId(),
      name: inFile.name,
      endDate: inFile.endDate,
      tags: [inFile.tag],
      variety: inFile.variety,
      createdAt: now.toISOString(),
      finishedNoticeSeen: false,
    },
  };
}

/** A unique id for something created in the app. */
export function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
