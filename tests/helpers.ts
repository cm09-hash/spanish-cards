import type { SchedulingState, StoredCard } from '../src/types';

/**
 * Builds a saved card for tests. Pass only the scheduling details that matter for the test;
 * `other` can override anything else (for example { paused: true }).
 */
export function makeCard(
  id: string,
  scheduling: Partial<SchedulingState> = {},
  position = 1,
  other: Partial<StoredCard> = {},
): StoredCard {
  return {
    id,
    front: `front of ${id}`,
    back: `back of ${id}`,
    type: 'vocab',
    tags: [],
    addedAt: '2026-01-01T00:00:00.000Z',
    position,
    paused: false,
    leech: false,
    flag: null,
    editedAt: null,
    scheduling: {
      cardId: id,
      state: 0,
      scheduleStatus: 'new',
      dueAt: '2026-01-01T00:00:00.000Z',
      lastReviewAt: null,
      stability: 0,
      stabilityFast: 0,
      difficulty: 0,
      scheduledDays: 0,
      learningStep: 0,
      reps: 0,
      lapses: 0,
      ...scheduling,
    },
    ...other,
  };
}
