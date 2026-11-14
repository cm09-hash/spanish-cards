/**
 * The capture log's quick-entry sheet: jot down a Spanish moment in a few seconds.
 * Opened by the floating "+" button on every screen (and from the Log screen, to edit an entry).
 */
import { getCaptures, saveCapture } from '../data/db';
import { newId } from '../data/importCards';
import { CAPTURE_TYPES, type Capture, type CaptureType } from '../types';
import { h } from './dom';

export const CAPTURE_TYPE_NAMES: Record<CaptureType, string> = {
  vocab: 'Vocab',
  phrase: 'Phrase',
  grammar: 'Grammar',
  conjugation: 'Conjugation',
  listening: 'Listening',
  other: 'Other',
};

/** Other parts of the app listen for this to redraw when the log changes. */
export const CAPTURES_CHANGED = 'captures-changed';

/** The round "+" button that floats above the tab bar. */
export function captureButton(): HTMLElement {
  return h(
    'button',
    { class: 'fab', type: 'button', 'aria-label': 'Add to your capture log', onclick: () => openCapture() },
    '+',
  );
}

/**
 * Opens the sheet. With no argument it adds a new entry; given an entry, it edits that one.
 * The text box is focused straight away, so on a phone the keyboard is already up.
 */
export function openCapture(existing?: Capture): void {
  if (document.querySelector('dialog.sheet')) return; // already open

  let type: CaptureType = existing?.type ?? 'other';

  const text = h('textarea', {
    class: 'field',
    rows: 3,
    placeholder: 'e.g. how do I say “to-go box”?',
    'aria-label': 'What came up?',
    enterkeyhint: 'done',
  });
  text.value = existing?.text ?? '';

  const chips = CAPTURE_TYPES.map((choice) => {
    const chip = h(
      'button',
      { class: 'chip', type: 'button', 'aria-pressed': String(choice === type) },
      CAPTURE_TYPE_NAMES[choice],
    );
    chip.addEventListener('click', () => {
      type = choice;
      for (const other of chips) other.setAttribute('aria-pressed', String(other === chip));
    });
    return chip;
  });

  const context = h('input', {
    class: 'field',
    type: 'text',
    maxlength: 200,
    placeholder: 'Where or when? (optional)',
    'aria-label': 'Where or when? (optional)',
    value: existing?.context ?? '',
  });

  const save = h('button', { class: 'button primary', type: 'submit' }, existing ? 'Save changes' : 'Save');
  const enableSave = () => (save.disabled = text.value.trim() === '');
  text.addEventListener('input', enableSave);
  enableSave();

  const form = h(
    'form',
    { method: 'dialog', class: 'sheet-form' },
    h('h2', null, existing ? 'Edit log entry' : 'Add to your log'),
    text,
    h('div', { class: 'chips', role: 'group', 'aria-label': 'What kind of thing is it?' }, chips),
    context,
    h(
      'div',
      { class: 'button-row' },
      save,
      h('button', { class: 'button', type: 'button', onclick: () => sheet.close() }, 'Cancel'),
    ),
  );
  const sheet = h('dialog', { class: 'sheet' }, form);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (text.value.trim() === '') return;
    await saveCapture({
      id: existing?.id ?? newId(),
      text: text.value.trim(),
      type,
      context: context.value.trim(),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      status: existing?.status ?? 'waiting',
      sentAt: existing?.sentAt ?? null,
    });
    sheet.close();
    window.dispatchEvent(new CustomEvent(CAPTURES_CHANGED));
    showNote(existing ? 'Log entry saved.' : 'Saved to your log.');
  });

  // Tapping the dimmed area outside the sheet closes it, as long as nothing has been typed.
  sheet.addEventListener('click', (event) => {
    if (event.target === sheet && text.value.trim() === (existing?.text ?? '')) sheet.close();
  });
  sheet.addEventListener('close', () => sheet.remove());

  document.body.append(sheet);
  sheet.showModal();
  text.focus();
}

let noteTimer: number | undefined;

/** A short message that appears at the top of the screen for a moment and goes away by itself. */
export function showNote(message: string): void {
  document.querySelector('.note')?.remove();
  const note = h('div', { class: 'note', role: 'status' }, message);
  document.body.append(note);
  window.clearTimeout(noteTimer);
  noteTimer = window.setTimeout(() => note.remove(), 2600);
}

/** How many log entries are still waiting to be sent to Claude. */
export async function countWaitingCaptures(): Promise<number> {
  return (await getCaptures()).filter((capture) => capture.status === 'waiting').length;
}
