import { describe, expect, it } from 'vitest';
import {
  activeSprintTags,
  daysLeft,
  daysLeftText,
  findSprintByName,
  isActive,
  isDate,
  nextNewCardFrom,
  studyDate,
  varietyOf,
} from '../src/study/sprints';
import type { Sprint } from '../src/types';

const sprint = (other: Partial<Sprint> = {}): Sprint => ({
  id: 's1',
  name: 'Chess conversation',
  endDate: '2026-11-21',
  tags: ['chess'],
  variety: 'latam',
  createdAt: '2026-11-10T10:00:00.000Z',
  finishedNoticeSeen: false,
  ...other,
});

describe('dates', () => {
  it('writes today as a date, with the day starting at 4 am', () => {
    expect(studyDate(new Date(2026, 10, 21, 15, 0))).toBe('2026-11-21');
    expect(studyDate(new Date(2026, 10, 22, 3, 59))).toBe('2026-11-21');
    expect(studyDate(new Date(2026, 10, 22, 4, 0))).toBe('2026-11-22');
  });

  it('recognises real dates only', () => {
    expect(isDate('2026-12-10')).toBe(true);
    expect(isDate('2026-02-30')).toBe(false);
    expect(isDate('10/12/2026')).toBe(false);
    expect(isDate('2026-12-10T00:00:00Z')).toBe(false);
  });
});

describe('a sprint over time', () => {
  it('counts down the days', () => {
    expect(daysLeft(sprint(), new Date(2026, 10, 16, 9, 0))).toBe(5);
    expect(daysLeftText(sprint(), new Date(2026, 10, 16, 9, 0))).toBe('5 days left');
    expect(daysLeftText(sprint(), new Date(2026, 10, 20, 9, 0))).toBe('1 day left');
    expect(daysLeftText(sprint(), new Date(2026, 10, 21, 9, 0))).toBe('ends today');
  });

  it('runs through its last day, late-night session included', () => {
    expect(isActive(sprint(), new Date(2026, 10, 21, 23, 30))).toBe(true);
    expect(isActive(sprint(), new Date(2026, 10, 22, 2, 0))).toBe(true); // still "the 21st" until 4 am
  });

  it('switches itself off the day after', () => {
    expect(isActive(sprint(), new Date(2026, 10, 22, 9, 0))).toBe(false);
    expect(daysLeftText(sprint(), new Date(2026, 10, 25, 9, 0))).toBe('finished');
  });

  it('only counts the tags of sprints that are running', () => {
    const sprints = [
      sprint(),
      sprint({ id: 's2', tags: ['madrid', 'food'], endDate: '2026-12-10' }),
      sprint({ id: 's3', tags: ['old'], endDate: '2026-10-01' }),
    ];
    expect(activeSprintTags(sprints, new Date(2026, 10, 16, 9, 0))).toEqual(new Set(['chess', 'madrid', 'food']));
    expect(activeSprintTags(sprints, new Date(2026, 10, 30, 9, 0))).toEqual(new Set(['madrid', 'food']));
  });
});

describe('which Spanish a card is in', () => {
  const madrid = sprint({ id: 'm', name: 'Trip to Madrid', tags: ['madrid'], variety: 'spain', endDate: '2026-12-10' });

  it('is Spain Spanish for cards in a Spain sprint', () => {
    expect(varietyOf({ tags: ['madrid', 'food'] }, [sprint(), madrid])).toBe('spain');
  });

  it('is Latin American for everything else', () => {
    expect(varietyOf({ tags: ['chess'] }, [sprint(), madrid])).toBe('latam');
    expect(varietyOf({ tags: [] }, [madrid])).toBe('latam');
    expect(varietyOf({ tags: ['madrid'] }, [])).toBe('latam');
  });

  it('stays Spain Spanish after the sprint has finished', () => {
    expect(varietyOf({ tags: ['madrid'] }, [{ ...madrid, endDate: '2020-01-01' }])).toBe('spain');
  });
});

describe('findSprintByName', () => {
  it('ignores capitals, accents and extra spaces', () => {
    const madrid = sprint({ name: 'Viaje a Málaga' });
    expect(findSprintByName([sprint(), madrid], '  viaje a   malaga ')).toBe(madrid);
    expect(findSprintByName([sprint()], 'Something else')).toBeUndefined();
  });
});

describe('nextNewCardFrom', () => {
  const both = { sprintAvailable: true, normalAvailable: true };

  it('stops at the daily limit', () => {
    expect(nextNewCardFrom({ limit: 15, sprintDone: 9, normalDone: 6, ...both })).toBeNull();
    expect(nextNewCardFrom({ limit: 0, sprintDone: 0, normalDone: 0, ...both })).toBeNull();
  });

  it('starts with the sprint', () => {
    expect(nextNewCardFrom({ limit: 15, sprintDone: 0, normalDone: 0, ...both })).toBe('sprint');
  });

  it('stops giving sprint cards once they have had their share of the day', () => {
    // With a limit of 15, six are kept for normal cards, so the sprint gets nine at most.
    expect(nextNewCardFrom({ limit: 15, sprintDone: 9, normalDone: 2, ...both })).toBe('normal');
  });

  it('uses whatever is available when one kind has run out', () => {
    expect(
      nextNewCardFrom({ limit: 15, sprintDone: 12, normalDone: 0, sprintAvailable: true, normalAvailable: false }),
    ).toBe('sprint');
    expect(
      nextNewCardFrom({ limit: 15, sprintDone: 0, normalDone: 3, sprintAvailable: false, normalAvailable: true }),
    ).toBe('normal');
    expect(
      nextNewCardFrom({ limit: 15, sprintDone: 0, normalDone: 0, sprintAvailable: false, normalAvailable: false }),
    ).toBeNull();
  });
});
