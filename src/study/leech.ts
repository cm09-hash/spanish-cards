/**
 * Leeches: cards that keep being forgotten. They usually need rewriting rather
 * than more repetition, so the app flags them for Claude. They are NOT paused.
 */
import { LEECH_THRESHOLD } from '../config';
import type { CardFlag, SchedulingState } from '../types';

/** Has a card with this schedule been forgotten often enough to count as a leech? */
export function isLeechSchedule(scheduling: SchedulingState): boolean {
  return scheduling.lapses >= LEECH_THRESHOLD;
}

/** The flag the app puts on a card when it becomes a leech. */
export function leechFlag(now: Date): CardFlag {
  return {
    reason: `Leech: forgotten ${LEECH_THRESHOLD} times. Needs rewriting.`,
    flaggedAt: now.toISOString(),
    by: 'leech',
  };
}
