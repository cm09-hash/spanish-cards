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
 *
 * Paused cards are in none of the piles: they are skipped everywhere in this file.
 */
import { LEARN_AHEAD_MINUTES } from '../config';
import type { StoredCard } from '../types';
import { endOfStudyDay } from './time';

const isNew = (card: StoredCard) => card.scheduling.state === 0;
const isShortStep = (card: StoredCard) => !isNew(card) && card.scheduling.scheduledDays < 1;
const dueTime = (card: StoredCard) => new Date(card.scheduling.dueAt).getTime();
const notPaused = (card: StoredCard) => !card.paused;

export interface StudySummary {
  /** Every card, paused ones included. */
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
  /** "Quick 5" mode: only cards that have been studied before, no new ones. */
  reviewsOnly?: boolean;
}

/** How many new cards may still be introduced today under these options. */
function newAllowance(options: QueueOptions): number {
  if (options.reviewsOnly) return 0;
  return Math.max(0, options.newCardsPerDay - options.newCardsDoneToday);
}

export function summarize(cards: StoredCard[], options: QueueOptions): StudySummary {
  const { now } = options;
  const endOfToday = endOfStudyDay(now).getTime();

  let dueToday = 0;
  let newAvailable = 0;
  for (const card of cards.filter(notPaused)) {
    if (isNew(card)) newAvailable++;
    else if (dueTime(card) < endOfToday) dueToday++;
  }
  const newLeft = Math.min(newAllowance(options), newAvailable);

  const canStudyNow = pickNextCard(cards, options) !== null;
  let nextReadyAt: Date | null = null;
  if (!canStudyNow) {
    const waiting = cards
      .filter((card) => notPaused(card) && isShortStep(card) && dueTime(card) < endOfToday)
      .map(dueTime);
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
export function pickNextCard(allCards: StoredCard[], options: PickOptions): StoredCard | null {
  const { now, justShownId = null, random = Math.random } = options;
  const cards = allCards.filter(notPaused);
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
  if (newAllowance(options) > 0) {
    const newCards = cards.filter(isNew).sort((a, b) => a.position - b.position);
    if (newCards.length > 0) return newCards[0];
  }

  // 4. Nothing else to do: show short-step cards that are nearly ready, rather than making you wait.
  const learnAheadLimit = nowMs + LEARN_AHEAD_MINUTES * 60_000;
  const nearlyReady = shortSteps.filter((card) => dueTime(card) <= learnAheadLimit);
  return nearlyReady.find((card) => card.id !== justShownId) ?? nearlyReady[0] ?? null;
}

export interface Progress {
  /** Cards studied today that are finished for the day. */
  done: number;
  /** Those, plus everything still to do today. */
  total: number;
}

/**
 * How far through today's cards you are, for the progress bar.
 * A card counts as done once it has been reviewed today and isn't due again today,
 * so a card you keep getting wrong doesn't move the bar until it finally sticks.
 */
export function todaysProgress(
  cards: StoredCard[],
  options: QueueOptions,
  reviewedTodayIds: Iterable<string>,
): Progress {
  const endOfToday = endOfStudyDay(options.now).getTime();
  const stillDueToday = new Set(
    cards.filter((card) => notPaused(card) && !isNew(card) && dueTime(card) < endOfToday).map((card) => card.id),
  );
  const done = new Set([...reviewedTodayIds].filter((id) => !stillDueToday.has(id))).size;
  const summary = summarize(cards, options);
  return { done, total: done + summary.dueToday + summary.newLeft };
}
