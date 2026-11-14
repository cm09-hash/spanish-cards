/**
 * Reading Spanish aloud with the device's own voices (the Web Speech API).
 * It costs nothing, needs no audio files and works offline.
 *
 * Which voice is used is decided in src/study/voices.ts; this file does the talking.
 */
import { SLOW_SPEECH_RATE } from '../config';
import { pickVoice } from '../study/voices';
import type { Settings, Variety } from '../types';

/** How to get a Spanish voice, for devices that turn out to have none. */
export const VOICE_TIP =
  'To add one on an iPhone: open the Settings app → Accessibility → Spoken Content (on some iPhones it is called Read & Speak) → Voices → Spanish, and download a voice. Then close this app and open it again.';

const synth: SpeechSynthesis | undefined = 'speechSynthesis' in window ? window.speechSynthesis : undefined;

let voices: SpeechSynthesisVoice[] = [];
/** Devices list their voices a moment after the page opens. False until we've given them that moment. */
let finishedLooking = false;
let speed: Settings['speechSpeed'] = 'normal';
let speakTimer: number | undefined;
/** Sentences being read. Kept here so the browser doesn't discard one that is still speaking. */
const speaking = new Set<SpeechSynthesisUtterance>();
const listeners = new Set<() => void>();

function loadVoices(): void {
  const list = synth?.getVoices() ?? [];
  if (list.length === 0) return;
  voices = list;
  finishedLooking = true;
  listeners.forEach((listener) => listener());
}

/** Call once at startup. */
export function initSpeech(settings: Settings): void {
  speed = settings.speechSpeed;
  if (!synth) {
    finishedLooking = true;
    return;
  }
  loadVoices();
  synth.addEventListener?.('voiceschanged', loadVoices);
  // Some iPhones never announce their voices, so also just look again a few times.
  for (const delay of [250, 1000, 2500]) window.setTimeout(loadVoices, delay);
  window.setTimeout(() => {
    if (finishedLooking) return;
    finishedLooking = true;
    listeners.forEach((listener) => listener());
  }, 3000);
}

export function setSpeechSpeed(newSpeed: Settings['speechSpeed']): void {
  speed = newSpeed;
}

/**
 *  - 'checking'  the device hasn't listed its voices yet
 *  - 'ready'     there is a Spanish voice
 *  - 'none'      there is no Spanish voice on this device (the speaker buttons are hidden)
 */
export function voiceStatus(): 'checking' | 'ready' | 'none' {
  if (pickVoice(voices, 'latam')) return 'ready';
  return finishedLooking ? 'none' : 'checking';
}

/** Calls `listener` when the list of voices becomes known or changes. Returns a function that stops listening. */
export function onVoicesChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The voice that will be used for a variety of Spanish, e.g. to name it on the Settings screen. */
export function voiceFor(variety: Variety): SpeechSynthesisVoice | null {
  return pickVoice(voices, variety);
}

export interface SpeakEvents {
  onStart?: () => void;
  onEnd?: () => void;
}

/** Reads Spanish text aloud, replacing anything that is still being read. */
export function speak(text: string, variety: Variety, events: SpeakEvents = {}): void {
  const voice = voiceFor(variety);
  if (!synth || !voice || !text.trim()) return;
  window.clearTimeout(speakTimer);

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.lang = voice.lang.replace('_', '-');
  utterance.rate = speed === 'slow' ? SLOW_SPEECH_RATE : 1;
  utterance.onstart = () => events.onStart?.();
  utterance.onend = utterance.onerror = () => {
    speaking.delete(utterance);
    events.onEnd?.();
  };

  try {
    // Stop whatever is still being read. (Only when there is something: on some phones, cancelling
    // when nothing is playing swallows the next sentence too.)
    if (synth.speaking || synth.pending) synth.cancel();
    synth.resume(); // iOS sometimes leaves the voice paused after the app was in the background
    synth.speak(utterance);
    speaking.add(utterance);
  } catch (error) {
    console.warn('Could not read the text aloud:', error);
    events.onEnd?.();
  }
}

/**
 * Like speak(), after a short pause (so it doesn't talk over a sound effect or an animation).
 * A pause of 0 speaks at once, which matters on iPhones: speech started directly by a tap always works.
 */
export function speakSoon(text: string, variety: Variety, delayMs: number): void {
  window.clearTimeout(speakTimer);
  if (delayMs <= 0) speak(text, variety);
  else speakTimer = window.setTimeout(() => speak(text, variety), delayMs);
}

export function stopSpeaking(): void {
  window.clearTimeout(speakTimer);
  speaking.clear();
  try {
    synth?.cancel();
  } catch {
    // Nothing was being read.
  }
}

/**
 * Call once at startup. iPhones only let a page talk after the user has touched the screen,
 * so the very first touch "speaks" an empty sentence. After that, audio can start by itself
 * (which is what lets a card be read aloud as it appears).
 */
export function unlockSpeechOnFirstTouch(): void {
  if (!synth) return;
  const unlock = () => {
    for (const event of ['touchend', 'pointerup', 'click', 'keydown'] as const) {
      document.removeEventListener(event, unlock, true);
    }
    try {
      if (!synth.speaking && !synth.pending) synth.speak(new SpeechSynthesisUtterance(''));
    } catch {
      // Speech isn't available; the speaker buttons will simply do nothing.
    }
  };
  for (const event of ['touchend', 'pointerup', 'click', 'keydown'] as const) {
    document.addEventListener(event, unlock, { capture: true, passive: true });
  }
}
