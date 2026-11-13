/** The shapes of the data the app works with. */

export const CARD_TYPES = ['vocab', 'conjugation', 'grammar', 'phrase', 'listening', 'cloze'] as const;
export type CardType = (typeof CARD_TYPES)[number];

/** What a card says. This is exactly what one card in an import file looks like. */
export interface CardContent {
  id: string;
  front: string;
  back: string;
  type: CardType;
  tags: string[];
  note?: string;
}

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
  /** Paused cards never appear in study sessions. */
  paused: boolean;
  /** True once the card has been forgotten LEECH_THRESHOLD times. */
  leech: boolean;
  /** null = not flagged. */
  flag: CardFlag | null;
}

/** A card as saved on the device: its content, its schedule and its marks. */
export interface StoredCard extends CardContent, CardMarks {
  /** When the card was imported. */
  addedAt: string;
  /** Import order. New cards are introduced lowest number first. */
  position: number;
  scheduling: SchedulingState;
  /** When the card's text was last edited in the app (null = never). */
  editedAt: string | null;
}

/** One entry in the review history. Every single answer is saved as one of these. */
export interface ReviewRecord {
  /** Filled in automatically by the database. */
  id?: number;
  cardId: string;
  rating: Rating;
  /** When the answer was revealed and judged. */
  timestamp: string;
  /** Milliseconds from seeing the card to pressing a rating button. */
  durationMs: number;
  /** The card's FSRS state just before this review… */
  before: SchedulingState;
  /** …and just after it. */
  after: SchedulingState;
}

export interface Settings {
  newCardsPerDay: number;
  soundsOn: boolean;
  /** When a backup file was last saved (null = never). */
  lastBackupAt: string | null;
}
