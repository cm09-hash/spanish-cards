/**
 * Choosing a Spanish voice and deciding what to read aloud. Pure logic:
 * the part that actually makes sound is src/ui/speech.ts.
 */
import type { CardContent, Direction, Variety } from '../types';
import { acceptableAnswers } from './answerCheck';
import { parseCloze } from './cloze';

/** The few facts about a device voice that matter for choosing one. */
export interface VoiceInfo {
  name: string;
  /** Language and region, e.g. "es-MX". */
  lang: string;
  default?: boolean;
  voiceURI?: string;
}

/** Joke and robot voices that iPhones list alongside the natural ones. Only used as a last resort. */
const NOVELTY_VOICES = ['eddy', 'flo', 'grandma', 'grandpa', 'reed', 'rocko', 'sandy', 'shelley', 'albert', 'zarvox'];

const languageOf = (voice: VoiceInfo) => voice.lang.replace('_', '-').toLowerCase();

export function isSpanish(voice: VoiceInfo): boolean {
  return languageOf(voice) === 'es' || languageOf(voice).startsWith('es-');
}

/** Lower is better. */
function regionRank(voice: VoiceInfo, variety: Variety): number {
  const language = languageOf(voice);
  if (variety === 'spain') return language === 'es-es' ? 0 : language === 'es' ? 1 : 2;
  // Latin American: Mexico first, then US Spanish, then anything that isn't Spain.
  if (language === 'es-mx') return 0;
  if (language === 'es-us') return 1;
  if (language === 'es-419') return 2;
  if (language === 'es-es') return 5;
  return language === 'es' ? 4 : 3;
}

/** Lower is better: the natural-sounding downloadable voices beat the basic ones. */
function qualityRank(voice: VoiceInfo): number {
  const description = `${voice.name} ${voice.voiceURI ?? ''}`.toLowerCase();
  if (NOVELTY_VOICES.some((name) => voice.name.toLowerCase().startsWith(name))) return 9;
  if (description.includes('premium')) return 0;
  if (description.includes('enhanced')) return 1;
  return voice.default ? 2 : 3;
}

/**
 * The best Spanish voice on the device for the wanted variety, or null if there is none.
 * The region matters most ("prefer es-MX, then es-US, then any Spanish that isn't Spain");
 * among voices of the same region, the better-sounding one wins.
 */
export function pickVoice<Voice extends VoiceInfo>(voices: Voice[], variety: Variety): Voice | null {
  const spanish = voices.filter(isSpanish);
  if (spanish.length === 0) return null;
  const rank = (voice: Voice) => regionRank(voice, variety) * 10 + qualityRank(voice);
  return spanish.reduce((best, voice) => (rank(voice) < rank(best) ? voice : best));
}

export interface SpeechPlan {
  /** The Spanish to read aloud. */
  text: string;
  /**
   * The first side the Spanish is visible on, which is where the speaker button first appears.
   * 'answer' means reading it earlier would give the answer away.
   */
  from: 'question' | 'answer';
}

/**
 * What the speaker button reads for a card, and from which side on.
 * Returns null for cards with no clear Spanish side (grammar cards, unless they say what to read).
 */
export function speechPlan(card: CardContent, direction: Direction): SpeechPlan | null {
  const text = (spanish: string) => card.audio ?? spanish;

  if (direction === 'production') return { text: text(readable(card.front)), from: 'answer' };
  switch (card.type) {
    case 'vocab':
    case 'phrase':
    case 'listening':
      return { text: text(readable(card.front)), from: 'question' };
    case 'conjugation':
      // The front is a question about a verb ("poner → pretérito, ellos"); the Spanish is the answer.
      return { text: text(acceptableAnswers(card.back)[0] ?? card.back), from: 'answer' };
    case 'cloze':
      // The whole sentence, blanks filled in. Never before the answer is revealed.
      return { text: text(clozeSentence(card.front)), from: 'answer' };
    case 'grammar':
      return card.audio ? { text: card.audio, from: 'answer' } : null;
  }
}

/** A cloze sentence with its blanks filled in: "Ayer fui al mercado." */
export function clozeSentence(front: string): string {
  return parseCloze(front)
    .map((part) => (part.kind === 'text' ? part.text : part.answer))
    .join('');
}

/** Alternatives are read as a list: "Te toca. / Te toca a ti." becomes "Te toca, Te toca a ti." */
function readable(text: string): string {
  const alternatives = text.split(/\s+\/\s+/);
  return alternatives
    .map((part, index) => (index < alternatives.length - 1 ? part.replace(/[.,;]+$/, '') : part))
    .join(', ');
}
