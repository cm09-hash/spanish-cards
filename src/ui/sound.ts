/**
 * Sound effects, made on the spot with the Web Audio API.
 * There are no audio files, so sounds work offline and add nothing to the download.
 *
 * iPhones only allow a web page to make sound after the user has touched the screen,
 * so the audio engine is switched on ("unlocked") by the first tap anywhere in the app.
 * Like other sound effects on an iPhone, these stay silent while the ring/silent switch is on silent.
 */

export type SoundName = 'again' | 'hard' | 'good' | 'easy' | 'celebrate';

/** One note: which pitch, when it starts (seconds), how long it rings, and how loud (0–1). */
interface Note {
  frequency: number;
  at: number;
  length: number;
  volume: number;
  /** If set, the pitch glides to this frequency over the note's length. */
  glideTo?: number;
}

// Note pitches in hertz. Nothing lower than E4: a phone's small speaker can hardly play deeper notes.
const E4 = 329.63;
const G4 = 392.0;
const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1046.5;
const E6 = 1318.51;
const G6 = 1567.98;

const SOUNDS: Record<SoundName, Note[]> = {
  // A soft, low "never mind" that slides gently down. Deliberately not a buzzer.
  again: [{ frequency: G4, glideTo: E4, at: 0, length: 0.34, volume: 0.5 }],
  // One calm, neutral note.
  hard: [{ frequency: C5, at: 0, length: 0.28, volume: 0.45 }],
  // Two bright notes stepping up.
  good: [
    { frequency: C5, at: 0, length: 0.22, volume: 0.6 },
    { frequency: G5, at: 0.09, length: 0.3, volume: 0.6 },
  ],
  // A quick sparkling run up the chord.
  easy: [
    { frequency: C5, at: 0, length: 0.2, volume: 0.5 },
    { frequency: E5, at: 0.07, length: 0.2, volume: 0.5 },
    { frequency: G5, at: 0.14, length: 0.22, volume: 0.5 },
    { frequency: C6, at: 0.21, length: 0.4, volume: 0.55 },
  ],
  // A longer chime that climbs and then rings out as a chord.
  celebrate: [
    { frequency: C5, at: 0, length: 0.5, volume: 0.45 },
    { frequency: E5, at: 0.11, length: 0.5, volume: 0.45 },
    { frequency: G5, at: 0.22, length: 0.5, volume: 0.45 },
    { frequency: C6, at: 0.33, length: 0.6, volume: 0.45 },
    { frequency: E6, at: 0.44, length: 0.7, volume: 0.4 },
    { frequency: C5, at: 0.6, length: 1.3, volume: 0.3 },
    { frequency: G5, at: 0.6, length: 1.3, volume: 0.3 },
    { frequency: C6, at: 0.6, length: 1.3, volume: 0.3 },
    { frequency: G6, at: 0.6, length: 1.3, volume: 0.2 },
  ],
};

/** Overall loudness. Kept low: these are meant to be quiet, pleasant taps. */
const MASTER_VOLUME = 0.3;

/**
 * Writes one sound into an audio context, starting at `startTime`.
 * (Separate from playSound so it can be tested without a loudspeaker.)
 */
export function scheduleSound(context: BaseAudioContext, name: SoundName, startTime: number): void {
  const master = context.createGain();
  master.gain.value = MASTER_VOLUME;
  master.connect(context.destination);

  for (const note of SOUNDS[name]) {
    const start = startTime + note.at;
    const end = start + note.length;

    // Each note is a pure tone plus a quiet copy an octave higher, which gives it a bell-like colour…
    for (const [multiple, share] of [
      [1, 1],
      [2, 0.22],
    ]) {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(note.frequency * multiple, start);
      if (note.glideTo) oscillator.frequency.exponentialRampToValueAtTime(note.glideTo * multiple, end);

      // …that starts almost instantly and then fades away smoothly, so there are no clicks.
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(note.volume * share, start + 0.012);
      envelope.gain.exponentialRampToValueAtTime(0.0001, end);

      oscillator.connect(envelope).connect(master);
      oscillator.start(start);
      oscillator.stop(end + 0.02);
    }
  }
}

let context: AudioContext | undefined;
let enabled = true;

/** Turns sounds on or off (the "Sounds" switch on the Settings screen). */
export function setSoundsEnabled(on: boolean): void {
  enabled = on;
}

/** Plays a sound, if sounds are on and the audio engine has been unlocked by a tap. */
export function playSound(name: SoundName): void {
  if (!enabled || !context) return;
  try {
    // iOS pauses the audio engine whenever the app goes into the background.
    if (context.state !== 'running') void context.resume();
    scheduleSound(context, name, context.currentTime + 0.01);
  } catch (error) {
    console.warn('Could not play a sound:', error);
  }
}

/**
 * Call once at startup. Switches the audio engine on at the first touch.
 * It keeps listening, because iOS pauses audio whenever the app goes into the
 * background, and only a touch is allowed to start it again.
 */
export function unlockAudioOnFirstTouch(): void {
  const unlock = () => {
    try {
      if (!context) {
        const AudioContextClass =
          window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) return;
        context = new AudioContextClass();

        // Tell iOS these are incidental sound effects: they mix with music or a podcast
        // that is already playing instead of stopping it.
        const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
        if (session) session.type = 'ambient';
      }
      if (context.state !== 'running') {
        void context.resume();
        // Playing one silent sample during the touch is what actually unlocks audio on older iPhones.
        const silence = context.createBufferSource();
        silence.buffer = context.createBuffer(1, 1, 22050);
        silence.connect(context.destination);
        silence.start();
      }
    } catch (error) {
      console.warn('Sound is not available:', error);
    }
  };
  // These are the events a browser accepts as "the user really did something".
  // (The start of a touch doesn't count on an iPhone; lifting the finger does.)
  for (const event of ['touchend', 'pointerup', 'click', 'keydown'] as const) {
    document.addEventListener(event, unlock, { capture: true, passive: true });
  }
}
