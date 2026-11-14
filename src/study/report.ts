/**
 * The weekly report: one small, readable file to hand to Claude.
 * Pure logic: it is built from a snapshot of everything saved.
 *
 * Unlike a backup, it is a summary, not the full data. Its names are written
 * with_underscores because it is meant to be read by Claude and by people, and it
 * carries its own instructions, so it makes sense on its own in a fresh chat.
 */
import { APP_ID, AREA_WINDOW_DAYS, MIN_REVIEWS_FOR_AREA, REPORT_DAYS, REPORT_FORMAT_VERSION } from '../config';
import { contentOf } from '../data/cardFile';
import type { EverythingSaved } from '../data/db';
import type { CardContent, Sprint, StoredCard } from '../types';
import { addDays, daysBetween, studyDate } from './dates';
import { hasAnyTag, isActive } from './sprints';
import {
  areaStats,
  averageSeconds,
  byId,
  cardCounts,
  forecast,
  learnedBetween,
  learnedOverTime,
  retention,
  retentionByDirection,
  reviewsSince,
  strongestAndWeakest,
  windowStart,
  type Area,
  type Retention,
} from './stats';
import { computeStreak } from './streak';

/** A finished sprint is still reported for this many days after its last day. */
const RECENT_SPRINT_DAYS = 14;

const INSTRUCTIONS = `This file is a weekly report from my personal Spanish flashcard app. I am the learner. Please help me with four things:

1. REVIEW MY PROGRESS. Look at "summary" and "strengths_and_weaknesses" and tell me in a few plain sentences how the week went, what is going well and what to focus on next. "Retention" means: of the cards I had already learned, the share I remembered. English-to-Spanish retention matters most to me, because it is what builds speaking confidence.

2. REWRITE THE CARDS THAT AREN'T WORKING. "leeches" are cards I keep forgetting; "flagged_cards" are cards I marked for you, with my reason. Rewrite each one so it is clearer, simpler or more memorable. KEEP THE SAME "id" AND THE SAME "type", and keep its "tags": the app then updates the card in place and keeps my progress. If a card would really work better as a different type, give it a new id instead and tell me to delete the old one.

3. TURN MY CAPTURE LOG INTO CARDS. "capture_log" holds Spanish moments I jotted down during the week: questions, things I heard, words I was missing. Answer each one briefly, then make one or more cards for it.

4. GIVE ME THE NEXT BATCH. Put the rewritten cards and the new cards together in ONE downloadable JSON file in the format described under "import_format". Aim for about a week of new cards at my "new_cards_per_day", weighted towards my weakest areas and any active sprint. If a sprint is active, give its cards one of the sprint's tags.

Before the file, list briefly what you changed and why.`;

const IMPORT_FORMAT = {
  description:
    'A JSON file with a "cards" list. Only id, type, front and back are required. Cards whose id already exists in the app are skipped, EXCEPT rewrites of flagged cards and leeches, which update the existing card.',
  example: {
    cards: [
      {
        id: 'vocab-tablero',
        type: 'vocab',
        front: 'el tablero',
        back: 'the board (for chess and other games)',
        tags: ['nouns'],
        note: 'Las piezas ya están en el tablero. — The pieces are already on the board.',
      },
      {
        id: 'conj-mover-presente-yo',
        type: 'conjugation',
        front: 'mover → presente, yo',
        back: 'muevo',
        verb: 'mover',
        meaning: 'to move',
        tense: 'presente',
        person: 'yo',
        table: { yo: 'muevo', tú: 'mueves', él: 'mueve', nosotros: 'movemos', vosotros: 'movéis', ellos: 'mueven' },
        tags: ['presente'],
      },
      {
        id: 'cloze-si-muevo',
        type: 'cloze',
        front: 'Si {{c1::muevo::mover}} el caballo, pierdo la dama.',
        back: 'If I move the knight, I lose the queen.',
        tags: ['presente'],
      },
    ],
  },
  rules: [
    'id: unique, lowercase, words joined by hyphens, starting with the type. Never reuse the id of a card that is not being rewritten.',
    'type: one of vocab, conjugation, grammar, phrase, listening, cloze.',
    'front and back: plain text, no formatting, short. tags: a short list of lowercase labels. note (optional): one example sentence with its translation, or a brief tip.',
    'vocab and phrase: front is the Spanish, back is the English. I have to TYPE the Spanish from the English, so back must point to one clear answer (add a clarifying word in brackets if needed). Nouns go with their article. Two equally good Spanish answers go in front separated by " / ". For rare words I only need to recognise, add "directions": ["recognition"].',
    'conjugation: front is "verb → tense, person", back is the conjugated form alone. Always include verb, meaning, tense, person and table (keys: yo, tú, él, nosotros, vosotros, ellos).',
    'cloze: front is a full Spanish sentence with the hidden word written as {{c1::answer::hint}} (for a verb, the hint is the infinitive); back is the English translation.',
    'listening: front is a natural spoken Spanish sentence, back is the English.',
    'grammar: front asks about one rule, back answers briefly. Add "audio" with one or two Spanish example sentences to be read aloud.',
    'To start a sprint, add at the top: "sprint": { "name": "…", "endDate": "YYYY-MM-DD", "tag": "…", "variety": "latam" or "spain" }. Every card in the file then gets that tag.',
    'Spanish variety: Latin American unless a sprint says "spain".',
    'Valid JSON only: double quotes, no trailing commas, no comments.',
  ],
};

interface RetentionInReport {
  reviews_of_learned_cards: number;
  remembered: number;
  /** A whole number from 0 to 100, or null when there were no such reviews. */
  percent: number | null;
}

interface AreaInReport {
  area: string;
  kind: 'tag' | 'type';
  reviews_of_learned_cards: number;
  retention_percent: number;
  times_forgotten: number;
}

/** A card as Claude should see it: in the import format, so it can be handed straight back. */
type CardInReport = CardContent & { times_forgotten: number; flag_reason?: string; flagged_by?: 'you' | 'leech' };

export interface WeeklyReport {
  app: typeof APP_ID;
  kind: 'weekly-report';
  format_version: number;
  instructions_for_claude: string;
  exported_at: string;
  period: { from: string; to: string; days: number };
  summary: {
    reviews: number;
    days_studied: number;
    average_seconds_per_card: number | null;
    retention: {
      all_cards: RetentionInReport;
      spanish_to_english: RetentionInReport;
      english_to_spanish: RetentionInReport;
    };
    retention_last_30_days: {
      all_cards: RetentionInReport;
      spanish_to_english: RetentionInReport;
      english_to_spanish: RetentionInReport;
    };
    cards_learned_this_period: number;
    cards_learned_in_total: number;
    total_cards: number;
    cards_by_stage: { new: number; learning: number; young: number; mature: number };
    paused_cards: number;
    reviews_due_in_the_next_7_days: number;
    streak: { current_days: number; longest_days: number; studied_today: boolean; freeze_used_on: string[] };
  };
  strengths_and_weaknesses: {
    window_days: number;
    minimum_reviews_to_be_ranked: number;
    strongest: AreaInReport[];
    weakest: AreaInReport[];
    by_type: AreaInReport[];
    by_tag: AreaInReport[];
  };
  leeches: CardInReport[];
  flagged_cards: CardInReport[];
  sprints: { active: SprintInReport[]; recently_finished: SprintInReport[] };
  settings: { new_cards_per_day: number; default_variety: 'latam'; daily_goal: string; type_answers: boolean };
  capture_log: { id: string; text: string; type: string; context: string; created_at: string }[];
  import_format: typeof IMPORT_FORMAT;
}

interface SprintInReport {
  name: string;
  end_date: string;
  days_left: number;
  tags: string[];
  variety: Sprint['variety'];
  cards: number;
  cards_still_new: number;
}

export function buildWeeklyReport(data: EverythingSaved, now: Date): WeeklyReport {
  const today = studyDate(now);
  const from = addDays(today, -(REPORT_DAYS - 1));
  const cards = byId(data.cards);

  const inPeriod = reviewsSince(data.reviews, windowStart(now, REPORT_DAYS));
  const last30Days = reviewsSince(data.reviews, windowStart(now, AREA_WINDOW_DAYS));
  const learned = learnedOverTime(data.reviews);
  const counts = cardCounts(data.cards);
  const streak = computeStreak(
    data.studyDays.map((day) => day.date),
    today,
  );

  const areas = areaStats(last30Days, cards);
  const { strongest, weakest } = strongestAndWeakest(areas);

  const forClaude = (card: StoredCard): CardInReport => ({
    ...contentOf(card),
    times_forgotten: Math.max(card.scheduling.lapses, card.production?.scheduling.lapses ?? 0),
    ...(card.flag ? { flag_reason: card.flag.reason, flagged_by: card.flag.by } : {}),
  });
  const inOrder = [...data.cards].sort((a, b) => a.position - b.position);

  const sprintInReport = (sprint: Sprint): SprintInReport => {
    const inSprint = data.cards.filter((card) => hasAnyTag(card, sprint.tags));
    return {
      name: sprint.name,
      end_date: sprint.endDate,
      days_left: Math.max(0, daysBetween(today, sprint.endDate)),
      tags: sprint.tags,
      variety: sprint.variety,
      cards: inSprint.length,
      cards_still_new: inSprint.filter((card) => card.scheduling.state === 0).length,
    };
  };
  const recentlyFinished = (sprint: Sprint) =>
    !isActive(sprint, now) && daysBetween(sprint.endDate, today) <= RECENT_SPRINT_DAYS;

  return {
    app: APP_ID,
    kind: 'weekly-report',
    format_version: REPORT_FORMAT_VERSION,
    instructions_for_claude: INSTRUCTIONS,
    exported_at: now.toISOString(),
    period: { from, to: today, days: REPORT_DAYS },
    summary: {
      reviews: inPeriod.length,
      days_studied: data.studyDays.filter((day) => day.date >= from && day.date <= today).length,
      average_seconds_per_card: rounded(averageSeconds(inPeriod)),
      retention: retentionGroup(inPeriod, cards),
      retention_last_30_days: retentionGroup(last30Days, cards),
      cards_learned_this_period: learnedBetween(learned, from, today),
      cards_learned_in_total: learned.at(-1)?.total ?? 0,
      total_cards: counts.total,
      cards_by_stage: counts.cards,
      paused_cards: counts.paused,
      reviews_due_in_the_next_7_days: forecast(data.cards, now, 7).reduce((sum, day) => sum + day.due, 0),
      streak: {
        current_days: streak.current,
        longest_days: streak.longest,
        studied_today: streak.studiedToday,
        freeze_used_on: streak.freezesUsed,
      },
    },
    strengths_and_weaknesses: {
      window_days: AREA_WINDOW_DAYS,
      minimum_reviews_to_be_ranked: MIN_REVIEWS_FOR_AREA,
      strongest: strongest.map(areaInReport),
      weakest: weakest.map(areaInReport),
      by_type: areas.filter((area) => area.kind === 'type').map(areaInReport),
      by_tag: areas.filter((area) => area.kind === 'tag').map(areaInReport),
    },
    leeches: inOrder.filter((card) => card.leech).map(forClaude),
    // (A leech that is also flagged is listed once, under "leeches".)
    flagged_cards: inOrder.filter((card) => card.flag && !card.leech).map(forClaude),
    sprints: {
      active: data.sprints.filter((sprint) => isActive(sprint, now)).map(sprintInReport),
      recently_finished: data.sprints.filter(recentlyFinished).map(sprintInReport),
    },
    settings: {
      new_cards_per_day: data.settings.newCardsPerDay,
      default_variety: 'latam',
      daily_goal:
        data.settings.goalKind === 'reviews'
          ? `${data.settings.goalReviews} reviews a day`
          : "finish everything that is due, plus the day's new cards",
      type_answers: data.settings.typeAnswers,
    },
    capture_log: data.captures
      .filter((capture) => capture.status === 'waiting')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((capture) => ({
        id: capture.id,
        text: capture.text,
        type: capture.type,
        context: capture.context,
        created_at: capture.createdAt,
      })),
    import_format: IMPORT_FORMAT,
  };
}

/** e.g. "spanish-cards-report-2026-11-13.json" (the date is your local date). */
export function reportFileName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${APP_ID}-report-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

function retentionGroup(reviews: Parameters<typeof retention>[0], cards: Map<string, StoredCard>) {
  const byDirection = retentionByDirection(reviews, cards);
  return {
    all_cards: retentionInReport(retention(reviews)),
    spanish_to_english: retentionInReport(byDirection.recognition),
    english_to_spanish: retentionInReport(byDirection.production),
  };
}

function retentionInReport(stat: Retention): RetentionInReport {
  return {
    reviews_of_learned_cards: stat.reviews,
    remembered: stat.remembered,
    percent: stat.rate === null ? null : Math.round(stat.rate * 100),
  };
}

function areaInReport(area: Area): AreaInReport {
  return {
    area: area.name,
    kind: area.kind,
    reviews_of_learned_cards: area.reviews,
    retention_percent: Math.round(area.rate * 100),
    times_forgotten: area.lapses,
  };
}

function rounded(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10) / 10;
}
