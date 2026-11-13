/**
 * Bringing cards saved by an older version of the app up to date.
 * Used both when the database is upgraded and when an old backup file is restored,
 * so the two can never disagree.
 */
import { isLeechSchedule, leechFlag } from '../study/leech';
import type { CardMarks, StoredCard } from '../types';

/** A card as any version of the app may have saved it: the newer fields might be missing. */
export type CardFromAnyVersion = Omit<StoredCard, keyof CardMarks | 'editedAt'> &
  Partial<CardMarks> & { editedAt?: string | null };

/**
 * Fills in whatever a card is missing. Nothing that is already there is changed.
 * Cards from before leeches existed are checked now: if one has already been
 * forgotten often enough, it is marked and flagged straight away.
 */
export function addMissingCardFields(card: CardFromAnyVersion, now: Date): StoredCard {
  const leech = card.leech ?? isLeechSchedule(card.scheduling);
  const newlyFoundLeech = card.leech === undefined && leech;
  return {
    ...card,
    paused: card.paused ?? false,
    leech,
    flag: card.flag ?? (newlyFoundLeech ? leechFlag(now) : null),
    editedAt: card.editedAt ?? null,
  };
}
