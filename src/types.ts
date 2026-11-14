/** The shapes of the data the app works with. */

export const CARD_TYPES = ['vocab', 'conjugation', 'grammar', 'phrase', 'listening', 'cloze'] as const;
export type CardType = (typeof CARD_TYPES)[number];

/** The rows of a conjugation table. "él" stands for él/ella/usted, "ellos" for ellos/ellas/ustedes. */
export const PERSONS = ['yo', 'tú', 'él', 'nosotros', 'vosotros', 'ellos'] as const;
export type Person = (typeof PERSONS)[number];

/** The forms of one verb in one tense. Any row may be missing (the imperative has no "yo", for example). */
export type ConjugationTable = Partial<Record<Person, string>>;

/** What a card says. This is exactly what one card in an import file looks like. */
export interface CardContent {
  id: string;
  front: string;
  back: string;
  type: CardType;
  tags: string[];
  note?: string;
  /** The exact Spanish text the speaker button should read, if the usual choice isn't right. */
  audio?: string;

  // Only on conjugation cards, and all optional. When verb, tense and person are
  // all there, the card is shown in the clearer labelled layout.
  verb?: string;
  tense?: string;
  person?: string;
  /** A short English meaning of the verb, e.g. "to put". */
  meaning?: string;
  table?: ConjugationTable;
}

/**
 * The two ways a card can be studied.
 *  - recognition: the card as written. For vocab and phrase cards that is Spanish → English.
 *  - production:  the card turned round, English → Spanish. Only vocab and phrase cards have it.
 */
export type Direction = 'recognition' | 'production';

/** Which Spanish a sprint is in. It decides the voice, and whether "vosotros" is shown. */
export type Variety = 'latam' | 'spain';

/** 1 = Again, 2 = Hard, 3 = Good, 4 = Easy (the same numbers FSRS uses). */
export type Rating = 1 | 2 | 3 | 4;

/** 0 = New, 1 = Learning, 2 = Review, 3 = Relearning (the same numbers FSRS uses). */
export type CardState = 0 | 1 | 2 | 3;

/**
 * Everything FSRS knows about one card's memory and schedule.
 * It is the ts-fsrs card with dates written as text (ISO 8601),
 * so it can be saved and exported as plain JSON.
 */
export interface SchedulingState {
  /** The card's id. For the production direction it is the card's id followed by "#production". */
  cardId: string;
  state: CardState;
  scheduleStatus: 'new' | 'learning' | 'review';
  /** When the card should next be shown. */
  dueAt: string;
  lastReviewAt: string | null;
  stability: number;
  stabilityFast: number;
  difficulty: number;
  /** Length of the current interval in days (can be a fraction, e.g. 0.5 = 12 hours). */
  scheduledDays: number;
  learningStep: number;
  /** How many times the card has been reviewed. */
  reps: number;
  /** How many times it was forgotten after having been learned. */
  lapses: number;
}

/** A note that a card needs Claude's attention (for example, to be rewritten). */
export interface CardFlag {
  /** Why it was flagged. May be empty. */
  reason: string;
  flaggedAt: string;
  /** 'you' = you flagged it by hand. 'leech' = the app flagged it because it keeps being forgotten. */
  by: 'you' | 'leech';
}

/** The extra marks a card can carry besides its content and schedule. */
export interface CardMarks {
  /** Paused cards never appear in study sessions (in either direction). */
  paused: boolean;
  /** True once the card has been forgotten LEECH_THRESHOLD times (in either direction). */
  leech: boolean;
  /** null = not flagged. */
  flag: CardFlag | null;
}

/** The progress of the production direction (English → Spanish) of a card. */
export interface ProductionProgress {
  scheduling: SchedulingState;
  /** Pauses just this direction. */
  paused: boolean;
  /** When this direction was studied for the first time (null = not yet). */
  introducedAt: string | null;
}

/**
 * A card as saved on the device: its content, its schedule and its marks.
 *
 * The fields `scheduling`, `introducedAt` and `recognitionPaused` belong to the
 * recognition direction (the card as written); `production` holds the same three
 * things for the other direction. The helpers in src/study/directions.ts hide that
 * difference, so the rest of the code can treat both directions alike.
 */
export interface StoredCard extends CardContent, CardMarks {
  /** When the card was imported. */
  addedAt: string;
  /** Import order. New cards are introduced lowest number first. */
  position: number;
  scheduling: SchedulingState;
  /** When the card was studied for the first time (null = not yet). */
  introducedAt: string | null;
  /** Pauses just the recognition direction. */
  recognitionPaused: boolean;
  /** null = this card is studied in one direction only. */
  production: ProductionProgress | null;
  /** When the card's text was last edited in the app (null = never). */
  editedAt: string | null;
}

/** How a typed answer compared with the right one. */
export type AnswerResult = 'correct' | 'almost' | 'wrong';

/** One entry in the review history. Every single answer is saved as one of these. */
export interface ReviewRecord {
  /** Filled in automatically by the database. */
  id?: number;
  cardId: string;
  /** Which way round the card was studied. */
  direction: Direction;
  rating: Rating;
  /** When the answer was revealed and judged. */
  timestamp: string;
  /** Milliseconds from seeing the card to pressing a rating button. */
  durationMs: number;
  /** What you typed, if this was a typed answer (null otherwise), and how it compared. */
  typed: string | null;
  typedResult: AnswerResult | null;
  /** The FSRS state of that direction just before this review… */
  before: SchedulingState;
  /** …and just after it. */
  after: SchedulingState;
}

/** A topic sprint: a short, time-boxed focus on the cards with certain tags. */
export interface Sprint {
  id: string;
  name: string;
  /** The last day of the sprint, written like "2026-11-21". */
  endDate: string;
  /** Cards with any of these tags belong to the sprint. */
  tags: string[];
  variety: Variety;
  createdAt: string;
  /** Set once you have dismissed the "Sprint finished" message on Home. */
  finishedNoticeSeen: boolean;
}

export interface Settings {
  newCardsPerDay: number;
  soundsOn: boolean;
  /** Read the Spanish aloud by itself whenever the Spanish side of a card appears. */
  autoPlayAudio: boolean;
  speechSpeed: 'slow' | 'normal';
  /** Ask for a typed answer on cards where you have to produce Spanish. */
  typeAnswers: boolean;
  /** Set once the "no Spanish voice on this device" tip has been dismissed. */
  voiceTipSeen: boolean;
  /** When a backup file was last saved (null = never). */
  lastBackupAt: string | null;
}
