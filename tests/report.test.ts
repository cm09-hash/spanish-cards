import { describe, expect, it } from 'vitest';
import { parseCardFile } from '../src/data/cardFile';
import type { EverythingSaved } from '../src/data/db';
import { addDays, studyDate } from '../src/study/dates';
import { buildWeeklyReport, reportFileName } from '../src/study/report';
import type { CardState, Capture, ReviewRecord, Settings, Sprint } from '../src/types';
import { makeCard, makeProduction } from './helpers';

// "Now" is noon on 20 November 2026.
const now = new Date(2026, 10, 20, 12, 0);
const today = studyDate(now);
const daysAgo = (n: number) => new Date(2026, 10, 20 - n, 10, 0);

const settings: Settings = {
  newCardsPerDay: 12,
  goalKind: 'reviews',
  goalReviews: 25,
  soundsOn: true,
  autoPlayAudio: true,
  speechSpeed: 'normal',
  typeAnswers: true,
  voiceTipSeen: false,
  lastBackupAt: null,
  lastReportAt: null,
};

let nextId = 1;
function review(
  cardId: string,
  rating: 1 | 2 | 3 | 4,
  before: CardState,
  when: Date,
  direction: 'recognition' | 'production' = 'recognition',
): ReviewRecord {
  const blank = makeCard(cardId).scheduling;
  return {
    id: nextId++,
    cardId,
    direction,
    rating,
    timestamp: when.toISOString(),
    durationMs: 6000,
    typed: null,
    typedResult: null,
    before: { ...blank, state: before },
    after: { ...blank, state: rating === 1 ? 3 : 2 },
  };
}

function exampleData(): EverythingSaved {
  const learned = { state: 2, scheduleStatus: 'review', scheduledDays: 8, dueAt: daysAgo(-2).toISOString() } as const;
  const cards = [
    makeCard('vocab-mesa', learned, 1, {
      front: 'la mesa',
      back: 'the table',
      tags: ['food'],
      production: makeProduction('vocab-mesa', learned),
    }),
    makeCard('vocab-reto', learned, 2, {
      front: 'el reto',
      back: 'the challange',
      note: 'a note',
      tags: ['madrid'],
      flag: { reason: 'translation seems wrong', flaggedAt: daysAgo(2).toISOString(), by: 'you' },
    }),
    makeCard('conj-poner', { ...learned, lapses: 7 }, 3, {
      type: 'conjugation',
      front: 'poner → pretérito, ellos',
      back: 'pusieron',
      verb: 'poner',
      tense: 'pretérito',
      person: 'ellos',
      tags: ['verbs'],
      leech: true,
      flag: { reason: 'Leech: forgotten 6 times. Needs rewriting.', flaggedAt: daysAgo(1).toISOString(), by: 'leech' },
    }),
    makeCard('vocab-new', {}, 4, { tags: ['madrid'] }),
    makeCard('vocab-paused', learned, 5, { paused: true }),
  ];

  const reviews = [
    // Old reviews, outside the 7-day period but inside the last 30 days.
    ...Array.from({ length: 12 }, () => review('vocab-mesa', 3, 2, daysAgo(15))),
    // This week.
    review('vocab-mesa', 3, 2, daysAgo(3)),
    review('vocab-mesa', 1, 2, daysAgo(2), 'production'),
    review('vocab-mesa', 3, 2, daysAgo(1), 'production'),
    review('vocab-reto', 3, 1, daysAgo(2)), // this is the moment vocab-reto was learned
    review('conj-poner', 1, 2, daysAgo(1)),
    review('conj-poner', 3, 2, daysAgo(0)),
  ];

  const capture = (id: string, text: string, status: Capture['status'], day: number): Capture => ({
    id,
    text,
    type: 'vocab',
    context: 'at lunch',
    createdAt: daysAgo(day).toISOString(),
    status,
    sentAt: status === 'sent' ? daysAgo(day - 1).toISOString() : null,
  });
  const sprint = (name: string, endDate: string, tags: string[], variety: Sprint['variety']): Sprint => ({
    id: name,
    name,
    endDate,
    tags,
    variety,
    createdAt: daysAgo(20).toISOString(),
    finishedNoticeSeen: false,
  });

  return {
    cards,
    reviews,
    sprints: [
      sprint('Trip to Madrid', addDays(today, 5), ['madrid'], 'spain'),
      sprint('Chess talk', addDays(today, -3), ['chess'], 'latam'),
      sprint('Ancient history', addDays(today, -60), ['old'], 'latam'),
    ],
    captures: [
      capture('c-new', 'how do I say “to-go box”?', 'waiting', 1),
      capture('c-old', 'heard “qué onda”', 'waiting', 4),
      capture('c-sent', 'already handled', 'sent', 9),
    ],
    studyDays: [15, 3, 2, 1, 0].map((n) => ({ date: addDays(today, -n), reviews: 3 })),
    settings,
  };
}

const report = buildWeeklyReport(exampleData(), now);

describe('the weekly report for Claude', () => {
  it('says what it is and what Claude should do with it, right at the top', () => {
    expect(Object.keys(report).slice(0, 4)).toEqual(['app', 'kind', 'format_version', 'instructions_for_claude']);
    expect(report).toMatchObject({ app: 'spanish-cards', kind: 'weekly-report', format_version: 1 });
    const instructions = report.instructions_for_claude;
    for (const expected of [
      'REVIEW MY PROGRESS',
      'REWRITE',
      'KEEP THE SAME "id"',
      'CAPTURE LOG',
      'NEXT BATCH',
      'import_format',
    ]) {
      expect(instructions).toContain(expected);
    }
  });

  it('covers the last 7 days', () => {
    expect(report.period).toEqual({ from: addDays(today, -6), to: today, days: 7 });
    expect(report.exported_at).toBe(now.toISOString());
  });

  it('summarises the period: reviews, days studied, time and cards learned', () => {
    expect(report.summary).toMatchObject({
      reviews: 6,
      days_studied: 4,
      average_seconds_per_card: 6,
      // vocab-reto, and conj-poner (whose first "learned" review in this made-up history is today's).
      cards_learned_this_period: 2,
      cards_learned_in_total: 3,
      total_cards: 5,
      paused_cards: 1,
    });
    expect(report.summary.cards_by_stage).toEqual({ new: 1, learning: 0, young: 4, mature: 0 });
  });

  it('gives retention overall and for each direction', () => {
    expect(report.summary.retention.all_cards).toEqual({ reviews_of_learned_cards: 5, remembered: 3, percent: 60 });
    // Only vocab and phrase cards are compared by direction.
    expect(report.summary.retention.spanish_to_english).toEqual({
      reviews_of_learned_cards: 1,
      remembered: 1,
      percent: 100,
    });
    expect(report.summary.retention.english_to_spanish).toEqual({
      reviews_of_learned_cards: 2,
      remembered: 1,
      percent: 50,
    });
    expect(report.summary.retention_last_30_days.all_cards).toEqual({
      reviews_of_learned_cards: 17,
      remembered: 15,
      percent: 88,
    });
  });

  it('includes the streak, with any freeze that was used', () => {
    expect(report.summary.streak).toEqual({
      current_days: 4,
      longest_days: 4,
      studied_today: true,
      freeze_used_on: [],
    });
  });

  it('lists strengths and weaknesses by tag and by type over the last 30 days', () => {
    const areas = report.strengths_and_weaknesses;
    expect(areas).toMatchObject({ window_days: 30, minimum_reviews_to_be_ranked: 10 });
    expect(areas.by_type).toContainEqual({
      area: 'vocab',
      kind: 'type',
      reviews_of_learned_cards: 15,
      retention_percent: 93,
      times_forgotten: 1,
    });
    expect(areas.by_tag).toContainEqual({
      area: 'verbs',
      kind: 'tag',
      reviews_of_learned_cards: 2,
      retention_percent: 50,
      times_forgotten: 1,
    });
    expect(areas.strongest.map((area) => area.area)).toEqual(['food']);
    expect(areas.weakest.map((area) => area.area)).toEqual(['vocab']);
  });

  it('lists every leech in the import format, with how often it was forgotten', () => {
    expect(report.leeches).toEqual([
      {
        id: 'conj-poner',
        type: 'conjugation',
        front: 'poner → pretérito, ellos',
        back: 'pusieron',
        tags: ['verbs'],
        verb: 'poner',
        tense: 'pretérito',
        person: 'ellos',
        times_forgotten: 7,
        flag_reason: 'Leech: forgotten 6 times. Needs rewriting.',
        flagged_by: 'leech',
      },
    ]);
  });

  it('lists every card flagged for Claude, with both sides, the note and my reason', () => {
    expect(report.flagged_cards).toEqual([
      {
        id: 'vocab-reto',
        type: 'vocab',
        front: 'el reto',
        back: 'the challange',
        tags: ['madrid'],
        note: 'a note',
        times_forgotten: 0,
        flag_reason: 'translation seems wrong',
        flagged_by: 'you',
      },
    ]);
  });

  it('never includes scheduling details of cards, only what they say', () => {
    for (const card of [...report.leeches, ...report.flagged_cards]) {
      expect(card).not.toHaveProperty('scheduling');
      expect(card).not.toHaveProperty('production');
    }
  });

  it('includes active sprints and ones that finished recently, but not old ones', () => {
    expect(report.sprints.active).toEqual([
      {
        name: 'Trip to Madrid',
        end_date: addDays(today, 5),
        days_left: 5,
        tags: ['madrid'],
        variety: 'spain',
        cards: 2,
        cards_still_new: 1,
      },
    ]);
    expect(report.sprints.recently_finished.map((sprint) => sprint.name)).toEqual(['Chess talk']);
  });

  it('includes my settings', () => {
    expect(report.settings).toEqual({
      new_cards_per_day: 12,
      default_variety: 'latam',
      daily_goal: '25 reviews a day',
      type_answers: true,
    });
  });

  it('includes every waiting log entry, oldest first, and none that were already sent', () => {
    expect(report.capture_log.map((entry) => entry.id)).toEqual(['c-old', 'c-new']);
    expect(report.capture_log[1]).toEqual({
      id: 'c-new',
      text: 'how do I say “to-go box”?',
      type: 'vocab',
      context: 'at lunch',
      created_at: daysAgo(1).toISOString(),
    });
  });

  it('describes the import format with an example the app itself accepts', () => {
    const { cards, problems } = parseCardFile(JSON.stringify(report.import_format.example));
    expect(problems).toEqual([]);
    expect(cards.length).toBeGreaterThan(0);
  });

  it('is small and readable: no review history, and it survives being written as JSON', () => {
    expect(report).not.toHaveProperty('reviews');
    expect(report).not.toHaveProperty('cards');
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });

  it('is named after the day it was made', () => {
    expect(reportFileName(new Date(2026, 10, 20))).toBe('spanish-cards-report-2026-11-20.json');
  });

  it('still makes sense with nothing in the app yet', () => {
    const empty = buildWeeklyReport(
      { cards: [], reviews: [], sprints: [], captures: [], studyDays: [], settings: { ...settings, goalKind: 'all' } },
      now,
    );
    expect(empty.summary).toMatchObject({
      reviews: 0,
      days_studied: 0,
      average_seconds_per_card: null,
      total_cards: 0,
    });
    expect(empty.summary.retention.all_cards.percent).toBeNull();
    expect(empty.summary.streak.current_days).toBe(0);
    expect(empty).toMatchObject({ leeches: [], flagged_cards: [], capture_log: [] });
    expect(empty.settings.daily_goal).toContain('everything that is due');
  });
});
