import { describe, expect, it } from 'vitest';
import { STREAK_FREEZE_EVERY_DAYS } from '../src/config';
import { addDays, dateRange, daysBetween, isDate, studyDate } from '../src/study/dates';
import { computeStreak, daysText, milestoneReached } from '../src/study/streak';

const today = '2026-11-20';
/** The dates `daysAgo` days before today, e.g. back(0, 1, 2) = today, yesterday and the day before. */
const back = (...daysAgo: number[]) => daysAgo.map((n) => addDays(today, -n));

describe('dates', () => {
  it('counts the hours after midnight as part of the day before (a study day starts at 4 am)', () => {
    expect(studyDate(new Date(2026, 10, 20, 3, 59))).toBe('2026-11-19');
    expect(studyDate(new Date(2026, 10, 20, 4, 0))).toBe('2026-11-20');
  });

  it('adds and subtracts days across months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-11-20', '2026-12-10')).toBe(20);
    expect(dateRange('2026-02-27', '2026-03-01')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01']);
    expect(isDate('2026-02-29')).toBe(false);
  });
});

describe('the streak', () => {
  it('is zero before anything has been studied', () => {
    expect(computeStreak([], today)).toMatchObject({ current: 0, longest: 0, studiedToday: false, freezesUsed: [] });
  });

  it('counts consecutive days ending today', () => {
    expect(computeStreak(back(0, 1, 2), today)).toMatchObject({ current: 3, longest: 3, studiedToday: true });
  });

  it('is not broken by today not being studied yet', () => {
    expect(computeStreak(back(1, 2, 3), today)).toMatchObject({ current: 3, studiedToday: false, freezesUsed: [] });
  });

  it('counts a day once, however many reviews were done', () => {
    expect(computeStreak([today, today, addDays(today, -1)], today).current).toBe(2);
  });

  it('starts again from one after a real break', () => {
    // Studied today, then nothing for three days, then a long run before that.
    const streak = computeStreak(back(0, 4, 5, 6, 7, 8), today);
    expect(streak).toMatchObject({ current: 1, longest: 5 });
  });

  it('remembers the longest run even after it has ended', () => {
    expect(computeStreak(back(10, 11, 12, 13), today)).toMatchObject({ current: 0, longest: 4 });
  });
});

describe('the streak freeze', () => {
  it('lets the streak survive a single missed day', () => {
    // Missed two days ago.
    const streak = computeStreak(back(0, 1, 3, 4), today);
    expect(streak.current).toBe(4);
    expect(streak.freezesUsed).toEqual(back(2));
  });

  it('does not add the frozen day to the count', () => {
    expect(computeStreak(back(0, 2), today).current).toBe(2); // two days studied, one day forgiven
  });

  it('covers yesterday, so the streak is still alive this morning', () => {
    const streak = computeStreak(back(2, 3, 4), today);
    expect(streak).toMatchObject({ current: 3, studiedToday: false });
    expect(streak.freezesUsed).toEqual(back(1));
  });

  it('never covers two missed days in a row', () => {
    expect(computeStreak(back(0, 3, 4, 5), today)).toMatchObject({ current: 1, freezesUsed: [] });
    expect(computeStreak(back(3, 4, 5), today)).toMatchObject({ current: 0, freezesUsed: [] });
  });

  it(`can be used only once every ${STREAK_FREEZE_EVERY_DAYS} days`, () => {
    // Missed 2 days ago and 5 days ago: the second miss comes too soon after the first freeze.
    const tooSoon = computeStreak(back(0, 1, 3, 4, 6, 7, 8), today);
    expect(tooSoon).toMatchObject({ current: 2, longest: 5 });
    expect(tooSoon.freezesUsed).toEqual([]); // the freeze belonged to the run that ended

    // Missed 2 days ago and 9 days ago: a full week apart, so both are forgiven.
    const weekApart = computeStreak(back(0, 1, 3, 4, 5, 6, 7, 8, 10, 11), today);
    expect(weekApart.current).toBe(10);
    expect(weekApart.freezesUsed).toEqual(back(9, 2));
  });

  it('is not spent before a streak has started', () => {
    // The first study day ever was yesterday. Nothing before it needs forgiving.
    expect(computeStreak(back(1), today)).toMatchObject({ current: 1, freezesUsed: [], freezeReady: true });
  });

  it('says whether a freeze is ready, and if not, when the next one is', () => {
    expect(computeStreak(back(0, 1), today)).toMatchObject({ freezeReady: true, nextFreezeOn: null });

    const used = computeStreak(back(0, 1, 3), today); // frozen 2 days ago
    expect(used).toMatchObject({ freezeReady: false, nextFreezeOn: addDays(today, -2 + STREAK_FREEZE_EVERY_DAYS) });

    const longAgo = computeStreak(back(0, 1, 2, 3, 4, 5, 6, 7, 9), today); // frozen 8 days ago
    expect(longAgo).toMatchObject({ current: 9, freezeReady: true, nextFreezeOn: null });
    expect(longAgo.freezesUsed).toEqual(back(8));
  });
});

describe('milestones', () => {
  const streakOf = (days: number) => computeStreak(dateRange(addDays(today, -(days - 1)), today), today);

  it.each([7, 30, 100, 365])('celebrates %d days', (days) => {
    expect(streakOf(days).current).toBe(days);
    expect(milestoneReached(streakOf(days))).toBe(days);
  });

  it('does not celebrate the days in between', () => {
    for (const days of [1, 6, 8, 29, 31, 99, 364]) expect(milestoneReached(streakOf(days))).toBeNull();
  });

  it('writes days in words', () => {
    expect([daysText(0), daysText(1), daysText(12)]).toEqual(['0 days', '1 day', '12 days']);
  });
});
