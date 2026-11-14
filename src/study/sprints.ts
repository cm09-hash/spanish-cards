/**
 * Topic sprints: a short, time-boxed focus on the cards with certain tags.
 * Pure logic: it only looks at what it is given.
 */
import { SPRINT_NORMAL_SHARE } from '../config';
import type { Sprint, StoredCard, Variety } from '../types';
import { simplify } from './text';
import { daysBetween, studyDate } from './dates';

// These two started life in this file; other files still import them from here.
export { isDate, studyDate } from './dates';

/** How many days the sprint still has after today. 0 = today is its last day. Negative = it is over. */
export function daysLeft(sprint: Sprint, now: Date): number {
  return daysBetween(studyDate(now), sprint.endDate);
}

/** A sprint runs up to and including its end date, and then switches itself off. */
export function isActive(sprint: Sprint, now: Date): boolean {
  return daysLeft(sprint, now) >= 0;
}

/** "5 days left", "1 day left", "ends today". */
export function daysLeftText(sprint: Sprint, now: Date): string {
  const left = daysLeft(sprint, now);
  if (left < 0) return 'finished';
  if (left === 0) return 'ends today';
  return left === 1 ? '1 day left' : `${left} days left`;
}

/** The tags of all the sprints that are running now. */
export function activeSprintTags(sprints: Sprint[], now: Date): Set<string> {
  return new Set(sprints.filter((sprint) => isActive(sprint, now)).flatMap((sprint) => sprint.tags));
}

export function hasAnyTag(card: Pick<StoredCard, 'tags'>, tags: Set<string> | string[]): boolean {
  const wanted = tags instanceof Set ? tags : new Set(tags);
  return card.tags.some((tag) => wanted.has(tag));
}

/**
 * Which Spanish a card is in. Cards that belong to a Spain sprint are Spain Spanish
 * (Spain voice, "vosotros" shown), and stay that way after the sprint has finished,
 * because their wording doesn't change. Everything else is Latin American.
 */
export function varietyOf(card: Pick<StoredCard, 'tags'>, sprints: Sprint[]): Variety {
  return sprints.some((sprint) => sprint.variety === 'spain' && hasAnyTag(card, sprint.tags)) ? 'spain' : 'latam';
}

/** Finds a sprint by name, ignoring capital letters, accents and extra spaces. */
export function findSprintByName(sprints: Sprint[], name: string): Sprint | undefined {
  return sprints.find((sprint) => simplify(sprint.name) === simplify(name));
}

export interface NewCardCounts {
  /** The daily limit on new cards. */
  limit: number;
  /** New cards already introduced today, from sprints and from everything else. */
  sprintDone: number;
  normalDone: number;
  /** Is there a new card of each kind waiting? */
  sprintAvailable: boolean;
  normalAvailable: boolean;
}

/**
 * Where the next new card of the day should come from.
 *
 * During a sprint, sprint cards have priority, with two guarantees for the normal cards
 * (as long as there are any):
 *  1. By the end of the day at least SPRINT_NORMAL_SHARE of the new cards are normal ones.
 *  2. They are mixed in along the way, not left to the end, so a short session gets its share too.
 * The daily limit itself never goes up. With the limit at 15 and the share at 40%,
 * a day looks like:  S S N S N S S N S N S S N S N   (9 sprint, 6 normal).
 */
export function nextNewCardFrom(counts: NewCardCounts): 'sprint' | 'normal' | null {
  const { limit, sprintDone, normalDone, sprintAvailable, normalAvailable } = counts;
  const done = sprintDone + normalDone;
  if (done >= limit) return null;
  if (!sprintAvailable) return normalAvailable ? 'normal' : null;
  if (!normalAvailable) return 'sprint';

  // (The tiny 0.000000001 guards against the computer making 0.4 × 15 come out as 6.000000000000001.)
  const tiny = 1e-9;
  // Guarantee 1. A limit of 1 would leave nothing for the sprint, so the sprint always keeps one.
  const reservedForNormal = Math.min(Math.ceil(SPRINT_NORMAL_SHARE * limit - tiny), limit - 1);
  if (sprintDone >= limit - reservedForNormal) return 'normal';
  // Guarantee 2: would taking a sprint card now leave the normal cards behind their share so far?
  if (normalDone < Math.floor(SPRINT_NORMAL_SHARE * (done + 1) + tiny)) return 'normal';
  return 'sprint';
}
