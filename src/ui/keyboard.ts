/** Helpers for typing answers on a phone. */
import { h } from './dom';

const ACCENTS = ['á', 'é', 'í', 'ó', 'ú', 'ñ', 'ü', '¿', '¡'];

/**
 * A row of buttons for the letters and marks an English keyboard hides away.
 * `target` says which text box the letter should go into.
 */
export function accentRow(target: () => HTMLInputElement | null): HTMLElement {
  return h(
    'div',
    { class: 'accent-row', role: 'group', 'aria-label': 'Spanish letters' },
    ACCENTS.map((letter) => {
      const button = h('button', { class: 'accent-key', type: 'button', tabindex: -1 }, letter);
      // Stopping the "press" here keeps the text box focused, so the phone's keyboard stays open.
      button.addEventListener('pointerdown', (event) => event.preventDefault());
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', () => {
        const input = target();
        if (!input) return;
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        input.setRangeText(letter, start, end, 'end');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
      });
      return button;
    }),
  );
}

/** A text box set up for typing Spanish: no auto-capitals, no autocorrect "fixing" Spanish into English. */
export function answerInput(placeholder: string): HTMLInputElement {
  return h('input', {
    class: 'field answer-input',
    type: 'text',
    placeholder,
    'aria-label': placeholder,
    lang: 'es',
    autocapitalize: 'none',
    autocorrect: 'off',
    autocomplete: 'off',
    spellcheck: 'false',
    enterkeyhint: 'done',
  });
}

/**
 * Keeps a full-height screen exactly as tall as the part of the display that is actually
 * visible. When the phone's keyboard slides up, the screen shrinks to sit above it, so the
 * question, the text box and the buttons all stay in view. Returns a function that undoes it.
 */
export function fitToVisibleArea(container: HTMLElement): () => void {
  const viewport = window.visualViewport;
  if (!viewport) return () => undefined;

  const fit = () => {
    container.style.height = `${viewport.height}px`;
    // iPhones also slide the whole page up to make room for the keyboard. We've already made room.
    if (viewport.offsetTop > 0 || window.scrollY > 0) window.scrollTo(0, 0);
  };
  viewport.addEventListener('resize', fit);
  viewport.addEventListener('scroll', fit);
  fit();

  return () => {
    viewport.removeEventListener('resize', fit);
    viewport.removeEventListener('scroll', fit);
    container.style.height = '';
  };
}
