import { describe, expect, it } from 'vitest';
import { pickVoice, speechPlan, type VoiceInfo } from '../src/study/voices';
import { makeCard } from './helpers';

const voice = (name: string, lang: string, extra: Partial<VoiceInfo> = {}): VoiceInfo => ({ name, lang, ...extra });

const monica = voice('Mónica', 'es-ES', { default: true });
const paulina = voice('Paulina', 'es-MX', { default: true });
const usSpanish = voice('Soledad', 'es-US');
const argentina = voice('Diego', 'es-AR');
const english = voice('Samantha', 'en-US', { default: true });

describe('pickVoice', () => {
  it('prefers Mexican Spanish, then US Spanish, then any Spanish that is not from Spain', () => {
    expect(pickVoice([english, monica, argentina, usSpanish, paulina], 'latam')).toBe(paulina);
    expect(pickVoice([english, monica, argentina, usSpanish], 'latam')).toBe(usSpanish);
    expect(pickVoice([english, monica, argentina], 'latam')).toBe(argentina);
  });

  it('falls back to a Spain voice rather than none at all', () => {
    expect(pickVoice([english, monica], 'latam')).toBe(monica);
  });

  it('uses a Spain voice for Spain sprints', () => {
    expect(pickVoice([paulina, argentina, monica], 'spain')).toBe(monica);
    expect(pickVoice([paulina], 'spain')).toBe(paulina);
  });

  it('returns null when the device has no Spanish voice', () => {
    expect(pickVoice([english], 'latam')).toBeNull();
    expect(pickVoice([], 'spain')).toBeNull();
  });

  it('understands language codes written with an underscore or in capitals', () => {
    expect(pickVoice([voice('X', 'es_MX'), voice('Y', 'ES-ES')], 'latam')?.name).toBe('X');
  });

  it('prefers the better-sounding voice of the same region', () => {
    const enhanced = voice('Paulina (Enhanced)', 'es-MX');
    const premium = voice('Paulina (Premium)', 'es-MX');
    expect(pickVoice([paulina, enhanced], 'latam')).toBe(enhanced);
    expect(pickVoice([enhanced, premium, paulina], 'latam')).toBe(premium);
  });

  it('avoids the joke voices unless there is nothing else', () => {
    const grandma = voice('Grandma (Spanish (Mexico))', 'es-MX');
    expect(pickVoice([grandma, paulina], 'latam')).toBe(paulina);
    expect(pickVoice([grandma], 'latam')).toBe(grandma);
    // …but the region still matters more than how good the voice is.
    expect(pickVoice([grandma, monica], 'latam')).toBe(grandma);
  });
});

describe('speechPlan: what is read aloud, and from which side', () => {
  const vocab = makeCard('v', {}, 1, { type: 'vocab', front: 'el tablero', back: 'the board' });

  it('reads the Spanish front of a vocab card straight away', () => {
    expect(speechPlan(vocab, 'recognition')).toEqual({ text: 'el tablero', from: 'question' });
  });

  it('waits for the answer on English → Spanish cards, so it is not given away', () => {
    expect(speechPlan(vocab, 'production')).toEqual({ text: 'el tablero', from: 'answer' });
  });

  it('reads alternatives as a list', () => {
    const phrase = { ...vocab, type: 'phrase' as const, front: 'Te toca. / Te toca a ti.' };
    expect(speechPlan(phrase, 'recognition')?.text).toBe('Te toca, Te toca a ti.');
    expect(speechPlan({ ...vocab, front: 'el reto / el desafío' }, 'recognition')?.text).toBe('el reto, el desafío');
  });

  it('reads a listening card on the question side', () => {
    const card = { ...vocab, type: 'listening' as const, front: '¿Jugamos otra?' };
    expect(speechPlan(card, 'recognition')).toEqual({ text: '¿Jugamos otra?', from: 'question' });
  });

  it('reads a cloze card only on the answer side, as the full sentence', () => {
    const card = { ...vocab, type: 'cloze' as const, front: 'Ayer {{c1::fui::ir}} al mercado.' };
    expect(speechPlan(card, 'recognition')).toEqual({ text: 'Ayer fui al mercado.', from: 'answer' });
  });

  it('reads the answer of a conjugation card, not its question', () => {
    const card = { ...vocab, type: 'conjugation' as const, front: 'poner → pretérito, ellos', back: 'pusieron' };
    expect(speechPlan(card, 'recognition')).toEqual({ text: 'pusieron', from: 'answer' });
  });

  it('stays silent on grammar cards unless they say what to read', () => {
    const card = { ...vocab, type: 'grammar' as const, front: 'When do you use «por»?', back: 'For duration.' };
    expect(speechPlan(card, 'recognition')).toBeNull();
    expect(speechPlan({ ...card, audio: 'Estudié por dos horas.' }, 'recognition')).toEqual({
      text: 'Estudié por dos horas.',
      from: 'answer',
    });
  });

  it('lets any card say exactly what should be read', () => {
    expect(speechPlan({ ...vocab, audio: 'El tablero de ajedrez.' }, 'recognition')?.text).toBe(
      'El tablero de ajedrez.',
    );
  });
});
