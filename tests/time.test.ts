import { describe, expect, it } from 'vitest';
import { endOfStudyDay, formatInterval, startOfStudyDay } from '../src/study/time';

describe('study day (starts at 4:00 am)', () => {
  it('counts the small hours as part of the previous day', () => {
    expect(startOfStudyDay(new Date(2026, 0, 5, 3, 59))).toEqual(new Date(2026, 0, 4, 4, 0));
    expect(endOfStudyDay(new Date(2026, 0, 5, 3, 59))).toEqual(new Date(2026, 0, 5, 4, 0));
  });

  it('starts a new day at exactly 4:00', () => {
    expect(startOfStudyDay(new Date(2026, 0, 5, 4, 0))).toEqual(new Date(2026, 0, 5, 4, 0));
    expect(endOfStudyDay(new Date(2026, 0, 5, 23, 30))).toEqual(new Date(2026, 0, 6, 4, 0));
  });
});

describe('formatInterval', () => {
  const from = new Date('2026-01-01T10:00:00Z');
  const after = (minutes: number) => new Date(from.getTime() + minutes * 60_000);
  const DAY = 24 * 60;

  it.each([
    [0.5, '<1m'],
    [1, '1m'],
    [10, '10m'],
    [59.7, '1h'],
    [14.3 * 60, '14h'],
    [23.8 * 60, '1d'],
    [DAY, '1d'],
    [2.5 * DAY, '2.5d'],
    [12 * DAY, '12d'],
    [57 * DAY, '1.9mo'],
    [364 * DAY, '1y'],
    [526 * DAY, '1.4y'],
  ])('%d minutes → %s', (minutes, label) => {
    expect(formatInterval(from, after(minutes))).toBe(label);
  });
});
