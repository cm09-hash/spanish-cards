/**
 * Decides which cards are due and which card to show next.
 * Pure logic: it only looks at the cards it is given, it never touches the database.
 *
 * Cards fall into three piles:
 *  - NEW        never studied. Introduced in import order, up to the daily limit.
 *  - SHORT-STEP studied, coming back in less than a day (e.g. "10 minutes").
 *               These wait for their exact time.
 *  - REVIEW     studied, coming back in a day or more. These can be studied
 *               at any time on the day they are due.
 */
import { LEARN_AHEAD_MINUTES } from '../config';
import type { StoredCard } from '../types';
import { endOfStudyDay } from './time';

const isNew = (card: StoredCard) => card.scheduling.state === 0;
const isShortStep = (card: StoredCard) => !isNew(card) && card.scheduling.scheduledDays < 1;
const dueTime = (card: StoredCard) => new Date(card.scheduling.dueAt).getTime();

export interface StudySummary {
  totalCards: number;
  /** Studied cards that are due before the end of today (including ones not quite ready yet). */
  dueToday: number;
  /** New cards that can still be introduced today. */
  newLeft: number;
  /** Is there at least one card that can be studied right now? */
  canStudyNow: boolean;
  /** If the only cards left today are short-step cards that aren't ready yet: when the first one will be. */
  nextReadyAt: Date | null;
}

export interface QueueOptions {
  now: Date;
  /** How many new cards have already been introduced today. */
  newCardsDoneToday: number;
  newCardsPerDay: number;
}

export function summarize(cards: StoredCard[], options: QueueOptions): StudySummary {
  const { now } = options;
  const endOfToday = endOfStudyDay(now).getTime();
  const allowance = Math.max(0, options.newCardsPerDay - options.newCardsDoneToday);

  let dueToday = 0;
  let newAvailable = 0;
  for (const card of cards) {
    if (isNew(card)) newAvailable++;
    else if (dueTime(card) < endOfToday) dueToday++;
  }
  const newLeft = Math.min(allowance, newAvailable);

  const canStudyNow = pickNextCard(cards, options) !== null;
  let nextReadyAt: Date | null = null;
  if (!canStudyNow) {
    const waiting = cards.filter((card) => isShortStep(card) && dueTime(card) < endOfToday).map(dueTime);
    if (waiting.length > 0) nextReadyAt = new Date(Math.min(...waiting));
  }

  return { totalCards: cards.length, dueToday, newLeft, canStudyNow, nextReadyAt };
}

export interface PickOptions extends QueueOptions {
  /** The card that was just shown, so it isn't repeated immediately when there's an alternative. */
  justShownId?: string | null;
  /** Only replaced in tests, to make the shuffle predictable. */
  random?: () => number;
}

/** The next card to study right now, or null if there is nothing to study at the moment. */
export function pickNextCard(cards: StoredCard[], options: PickOptions): StoredCard | null {
  const { now, justShownId = null, random = Math.random } = options;
  const nowMs = now.getTime();
  const endOfToday = endOfStudyDay(now).getTime();
  const byDueTime = (a: StoredCard, b: StoredCard) => dueTime(a) - dueTime(b);

  // 1. Short-step cards whose time has come: most overdue first.
  const shortSteps = cards.filter(isShortStep).sort(byDueTime);
  const ready = shortSteps.find((card) => dueTime(card) <= nowMs);
  if (ready) return ready;

  // 2. Reviews due today, in random order so cards aren't always seen in the same sequence.
  const reviews = cards.filter((card) => !isNew(card) && !isShortStep(card) && dueTime(card) < endOfToday);
  if (reviews.length > 0) return reviews[Math.floor(random() * reviews.length)];

  // 3. New cards, in the order they were imported, while today's allowance lasts.
  if (options.newCardsDoneToday < options.newCardsPerDay) {
    const newCards = cards.filter(isNew).sort((a, b) => a.position - b.position);
    if (newCards.length > 0) return newCards[0];
  }

  // 4. Nothing else to do: show short-step cards that are nearly ready, rather than making you wait.
  const learnAheadLimit = nowMs + LEARN_AHEAD_MINUTES * 60_000;
  const nearlyReady = shortSteps.filter((card) => dueTime(card) <= learnAheadLimit);
  return nearlyReady.find((card) => card.id !== justShownId) ?? nearlyReady[0] ?? null;
}
