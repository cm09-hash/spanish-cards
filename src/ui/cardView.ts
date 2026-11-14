/** Draws one flashcard: the question side, and (once revealed) the answer side. */
import { hasConjugationLayout, tableRows } from '../study/conjugation';
import { parseCloze } from '../study/cloze';
import { speechPlan } from '../study/voices';
import type { Direction, StoredCard, Variety } from '../types';
import { h } from './dom';
import { icon } from './icons';
import { speak, voiceStatus } from './speech';

export interface CardViewOptions {
  /** Which way round the card is being studied. */
  direction: Direction;
  /** false = the question side only; true = question and answer. */
  revealed: boolean;
  /** Latin American or Spain Spanish: decides the voice, and whether "vosotros" is shown. */
  variety: Variety;
}

export function cardView(card: StoredCard, options: CardViewOptions): HTMLElement {
  const { direction, revealed, variety } = options;
  const view = h('article', { class: 'card' }, h('div', { class: 'card-type' }, typeLabel(card, direction)));

  // The speaker button appears as soon as the Spanish is on show: not before, or it would give the answer away.
  const plan = speechPlan(card, direction);
  const canSpeak = plan !== null && voiceStatus() !== 'none';
  if (plan && canSpeak && (plan.from === 'question' || revealed) && !(card.type === 'listening' && !revealed)) {
    view.append(speakerButton(plan.text, variety, 'card-speaker'));
  }

  // ----- The question -----

  if (direction === 'production') {
    view.append(bigText(card.back, 'card-front', 'en'));
  } else if (card.type === 'listening' && !revealed && plan && canSpeak) {
    view.append(listeningQuestion(card, plan.text, variety));
  } else if (hasConjugationLayout(card)) {
    view.append(
      h(
        'dl',
        { class: 'conjugation-parts' },
        h('dt', null, 'Verb'),
        h(
          'dd',
          { lang: 'es' },
          h('strong', null, card.verb),
          card.meaning && h('span', { class: 'meaning', lang: 'en' }, card.meaning),
        ),
        h('dt', null, 'Tense'),
        h('dd', { lang: 'es' }, card.tense),
        h('dt', null, 'Person'),
        h('dd', { lang: 'es' }, card.person),
      ),
    );
  } else if (card.type === 'cloze') {
    const sentence = h('div', { class: `card-front ${sizeClass(card.front)}`, lang: 'es' });
    for (const part of parseCloze(card.front)) {
      if (part.kind === 'text') sentence.append(part.text);
      else if (revealed) sentence.append(h('mark', { class: 'cloze-answer' }, part.answer));
      else sentence.append(h('span', { class: 'cloze-blank' }, part.hint ? `[${part.hint}]` : '[…]'));
    }
    view.append(sentence);
  } else {
    view.append(bigText(card.front, 'card-front', 'es'));
  }

  if (!revealed) return view;

  // ----- The answer -----

  view.append(h('hr', { class: 'card-divider' }));
  if (direction === 'production') {
    view.append(bigText(card.front, 'card-back', 'es'));
  } else if (card.type === 'cloze') {
    if (card.back) view.append(h('div', { class: 'card-back is-translation' }, card.back));
  } else {
    view.append(bigText(card.back, 'card-back', card.type === 'conjugation' ? 'es' : 'en'));
  }

  const rows = tableRows(card, variety);
  if (rows.length > 0) {
    view.append(
      h(
        'table',
        { class: 'conjugation-table', lang: 'es' },
        h('caption', null, card.tense ?? 'All the forms'),
        rows.map((row) =>
          h(
            'tr',
            { class: row.asked ? 'is-asked' : null },
            h('th', { scope: 'row' }, row.label),
            h('td', null, row.form),
          ),
        ),
      ),
    );
  }

  if (card.note) view.append(h('div', { class: 'card-note' }, card.note));
  if (card.tags.length > 0) {
    view.append(
      h(
        'div',
        { class: 'card-tags' },
        card.tags.map((tag) => h('span', { class: 'tag' }, tag)),
      ),
    );
  }
  return view;
}

/** "VOCAB", or "VOCAB · ENGLISH → SPANISH" for cards that are studied both ways round. */
function typeLabel(card: StoredCard, direction: Direction): string {
  if (!card.production) return card.type;
  return `${card.type} · ${direction === 'production' ? 'English → Spanish' : 'Spanish → English'}`;
}

function bigText(text: string, className: string, language: string): HTMLElement {
  return h('div', { class: `${className} ${sizeClass(text)}`, lang: language }, text);
}

/** Short text is shown big; long sentences a little smaller so they fit comfortably. */
function sizeClass(text: string): string {
  if (text.length <= 28) return 'is-short';
  if (text.length <= 90) return 'is-medium';
  return 'is-long';
}

/** A round button that reads `text` aloud. Tapping it again reads it again. */
export function speakerButton(text: string, variety: Variety, className: string): HTMLElement {
  const button = h(
    'button',
    { class: `speaker ${className}`, type: 'button', 'aria-label': 'Listen' },
    icon('speaker'),
  );
  button.addEventListener('click', (event) => {
    event.stopPropagation(); // so the tap doesn't also count as "show the answer"
    speak(text, variety, {
      onStart: () => button.classList.add('is-speaking'),
      onEnd: () => button.classList.remove('is-speaking'),
    });
  });
  return button;
}

/** The question side of a listening card: a big play button, with the text hidden until asked for. */
function listeningQuestion(card: StoredCard, spoken: string, variety: Variety): HTMLElement {
  const text = h('div', { class: `card-front ${sizeClass(card.front)}`, lang: 'es', hidden: true }, card.front);
  const showText = h('button', { class: 'button small', type: 'button' }, 'Show text');
  showText.addEventListener('click', (event) => {
    event.stopPropagation();
    text.hidden = false;
    showText.hidden = true;
  });

  const play = speakerButton(spoken, variety, 'is-large');
  play.replaceChildren(icon('play'));
  play.setAttribute('aria-label', 'Play');

  return h(
    'div',
    { class: 'listening' },
    play,
    h('p', { class: 'footnote' }, 'Listen, then say what it means.'),
    text,
    showText,
  );
}
