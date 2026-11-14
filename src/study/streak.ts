/**
 * The study streak: how many days in a row you have done at least one review.
 * Pure logic: it is worked out from the list of days you studied, nothing else.
 *
 * One missed day is forgiven by a "streak freeze", at most once every
 * STREAK_FREEZE_EVERY_DAYS days. Two missed days in a row always end the streak.
 */
import { STREAK_FREEZE_EVERY_DAYS, STREAK_MILESTONES } from '../config';
import { addDays, dateRange, daysBetween } from './dates';

export interface Streak {
  /** Days studied in the current run. A day saved by a freeze keeps the run going but isn't counted. */
  current: number;
  /** The longest run there has ever been. */
  longest: number;
  studiedToday: boolean;
  /** The missed days in the current run that a freeze covered. */
  freezesUsed: string[];
  /** Is a freeze ready to cover a missed day? */
  freezeReady: boolean;
  /** If not: the first day a freeze could be used again. */
  nextFreezeOn: string | null;
}

/**
 * Works out the streak as it stands on `today`.
 * Today never breaks a streak: the day isn't over yet.
 */
export function computeStreak(studiedDates: Iterable<string>, today: string): Streak {
  const studied = new Set(studiedDates);
  const first = [...studied].sort()[0];

  let current = 0;
  let longest = 0;
  let freezesUsed: string[] = [];
  let lastFreeze: string | null = null;

  if (first !== undefined && first <= today) {
    for (const day of dateRange(first, today)) {
      if (studied.has(day)) {
        current++;
        longest = Math.max(longest, current);
      } else if (day === today) {
        // Not studied yet today. Nothing is lost until the day is over.
      } else if (current > 0 && (lastFreeze === null || daysBetween(lastFreeze, day) >= STREAK_FREEZE_EVERY_DAYS)) {
        // A missed day, and a freeze is available: the streak survives.
        lastFreeze = day;
        freezesUsed.push(day);
      } else {
        // A missed day with no freeze left: the streak is over.
        current = 0;
        freezesUsed = [];
      }
    }
  }

  const nextFreezeOn = lastFreeze === null ? null : addDays(lastFreeze, STREAK_FREEZE_EVERY_DAYS);
  // Ready = if today were missed, the freeze would cover it.
  const freezeReady = nextFreezeOn === null || nextFreezeOn <= today;
  return {
    current,
    longest,
    studiedToday: studied.has(today),
    freezesUsed,
    freezeReady,
    nextFreezeOn: freezeReady ? null : nextFreezeOn,
  };
}

/** The milestone a streak has just reached (7, 30, 100 or 365 days), or null if it isn't on one. */
export function milestoneReached(streak: Streak): number | null {
  return STREAK_MILESTONES.includes(streak.current) ? streak.current : null;
}

/** "1 day", "12 days". */
export function daysText(days: number): string {
  return days === 1 ? '1 day' : `${days} days`;
}
