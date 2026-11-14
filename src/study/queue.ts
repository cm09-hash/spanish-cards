/**
 * Decides which cards are due and which card to show next.
 * Pure logic: it only looks at the cards it is given, it never touches the database.
 *
 * It works with "study items": one card in one direction (see directions.ts).
 * Items fall into three piles:
 *  - NEW        never studied. Introduced in import order, up to the daily limit.
 *  - SHORT-STEP studied, coming back in less than a day (e.g. "10 minutes").
 *               These wait for their exact time.
 *  - REVIEW     studied, coming back in a day or more. These can be studied
 *               at any time on the day they are due.
 *
 * Paused items are in none of the piles: they are skipped everywhere in this file.
 */
import { LEARN_AHEAD_MINUTES } from '../config';
import type { StoredCard } from '../types';
import { itemsOf, readyToIntroduce, type StudyItem } from './directions';
import { hasAnyTag, nextNewCardFrom } from './sprints';
import { endOfStudyDay } from './time';

const isNew = (item: StudyItem) => item.scheduling.state === 0;
const isShortStep = (item: StudyItem) => !isNew(item) && item.scheduling.scheduledDays < 1;
const dueTime = (item: StudyItem) => new Date(item.scheduling.dueAt).getTime();

const directionOrder = (item: StudyItem) => (item.direction === 'recognition' ? 0 : 1);

/** Every item that can be studied at all: both directions of every card, minus anything paused. */
function activeItems(cards: StoredCard[]): StudyItem[] {
  return cards.flatMap(itemsOf).filter((item) => !item.paused);
}

export interface StudySummary {
  /** Every card, paused ones included. (Cards, not directions.) */
  totalCards: number;
  /** Studied items that are due before the end of today (including ones not quite ready yet). */
  dueToday: number;
  /** New items that can still be introduced today. */
  newLeft: number;
  /** Is there at least one item that can be studied right now? */
  canStudyNow: boolean;
  /** If the only items left today are short-step ones that aren't ready yet: when the first one will be. */
  nextReadyAt: Date | null;
}

export interface QueueOptions {
  now: Date;
  /** How many new items have already been introduced today. */
  newCardsDoneToday: number;
  newCardsPerDay: number;
  /** "Quick 5" mode: only items that have been studied before, no new ones. */
  reviewsOnly?: boolean;
  /** The tags of the sprints running now. Cards with one of these tags are "sprint cards". */
  sprintTags?: Set<string>;
  /** How many of today's new items came from sprint cards. */
  sprintNewDoneToday?: number;
}

/** How many new items may still be introduced today under these options. */
function newAllowance(options: QueueOptions): number {
  if (options.reviewsOnly) return 0;
  return Math.max(0, options.newCardsPerDay - options.newCardsDoneToday);
}

/** The new items that could be introduced now, in the order they would be. */
function waitingNewItems(items: StudyItem[], now: Date): StudyItem[] {
  return items
    .filter((item) => isNew(item) && readyToIntroduce(item, now))
    .sort((a, b) => a.card.position - b.card.position || directionOrder(a) - directionOrder(b));
}

/** The next new item to introduce, or null. This is where sprint cards get their priority. */
function nextNewItem(items: StudyItem[], options: QueueOptions): StudyItem | null {
  if (newAllowance(options) <= 0) return null;
  const waiting = waitingNewItems(items, options.now);
  const sprintTags = options.sprintTags ?? new Set<string>();
  const fromSprint = waiting.find((item) => hasAnyTag(item.card, sprintTags)) ?? null;
  const fromNormal = waiting.find((item) => !hasAnyTag(item.card, sprintTags)) ?? null;

  const sprintDone = options.sprintNewDoneToday ?? 0;
  const source = nextNewCardFrom({
    limit: options.newCardsPerDay,
    sprintDone,
    normalDone: options.newCardsDoneToday - sprintDone,
    sprintAvailable: fromSprint !== null,
    normalAvailable: fromNormal !== null,
  });
  return source === 'sprint' ? fromSprint : source === 'normal' ? fromNormal : null;
}

export function summarize(cards: StoredCard[], options: QueueOptions): StudySummary {
  const { now } = options;
  const endOfToday = endOfStudyDay(now).getTime();
  const items = activeItems(cards);

  const dueToday = items.filter((item) => !isNew(item) && dueTime(item) < endOfToday).length;
  const newLeft = Math.min(newAllowance(options), waitingNewItems(items, now).length);

  const canStudyNow = pickNextCard(cards, options) !== null;
  let nextReadyAt: Date | null = null;
  if (!canStudyNow) {
    const waiting = items.filter((item) => isShortStep(item) && dueTime(item) < endOfToday).map(dueTime);
    if (waiting.length > 0) nextReadyAt = new Date(Math.min(...waiting));
  }

  return { totalCards: cards.length, dueToday, newLeft, canStudyNow, nextReadyAt };
}

export interface PickOptions extends QueueOptions {
  /** The card that was just shown, so it (or its other direction) isn't shown again straight away when there's an alternative. */
  justShownCardId?: string | null;
  /** Only replaced in tests, to make the shuffle predictable. */
  random?: () => number;
}

/** The next item to study right now, or null if there is nothing to study at the moment. */
export function pickNextCard(cards: StoredCard[], options: PickOptions): StudyItem | null {
  const { now, justShownCardId = null, random = Math.random } = options;
  const items = activeItems(cards);
  const nowMs = now.getTime();
  const endOfToday = endOfStudyDay(now).getTime();
  const byDueTime = (a: StudyItem, b: StudyItem) => dueTime(a) - dueTime(b);
  const notJustShown = (item: StudyItem) => item.card.id !== justShownCardId;

  // 1. Short-step items whose time has come: most overdue first.
  const shortSteps = items.filter(isShortStep).sort(byDueTime);
  const ready = shortSteps.find((item) => dueTime(item) <= nowMs);
  if (ready) return ready;

  // 2. Reviews due today, in random order so cards aren't always seen in the same sequence.
  //    (Not the other direction of the card you just saw, if anything else is waiting.)
  const reviews = items.filter((item) => !isNew(item) && !isShortStep(item) && dueTime(item) < endOfToday);
  const preferred = reviews.some(notJustShown) ? reviews.filter(notJustShown) : reviews;
  if (preferred.length > 0) return preferred[Math.floor(random() * preferred.length)];

  // 3. New items, while today's allowance lasts.
  const fresh = nextNewItem(items, options);
  if (fresh) return fresh;

  // 4. Nothing else to do: show short-step items that are nearly ready, rather than making you wait.
  const learnAheadLimit = nowMs + LEARN_AHEAD_MINUTES * 60_000;
  const nearlyReady = shortSteps.filter((item) => dueTime(item) <= learnAheadLimit);
  return nearlyReady.find(notJustShown) ?? nearlyReady[0] ?? null;
}

export interface Progress {
  /** Items studied today that are finished for the day. */
  done: number;
  /** Those, plus everything still to do today. */
  total: number;
}

/**
 * How far through today's cards you are, for the progress bar.
 * An item counts as done once it has been reviewed today and isn't due again today,
 * so a card you keep getting wrong doesn't move the bar until it finally sticks.
 */
export function todaysProgress(
  cards: StoredCard[],
  options: QueueOptions,
  reviewedTodayKeys: Iterable<string>,
): Progress {
  const endOfToday = endOfStudyDay(options.now).getTime();
  const stillDueToday = new Set(
    activeItems(cards)
      .filter((item) => !isNew(item) && dueTime(item) < endOfToday)
      .map((item) => item.key),
  );
  const done = new Set([...reviewedTodayKeys].filter((key) => !stillDueToday.has(key))).size;
  const summary = summarize(cards, options);
  return { done, total: done + summary.dueToday + summary.newLeft };
}
