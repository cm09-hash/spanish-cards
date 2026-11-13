/** Settings: how many new cards per day, plus version information. */
import { DESIRED_RETENTION, FSRS_VERSION } from '../../config';
import { getSettings, updateSettings } from '../../data/db';
import { checkForUpdate, onUpdateReady } from '../../pwa';
import type { Cleanup } from '../app';
import { h, setChildren } from '../dom';
import { updateBanner } from '../updateBanner';

const MAX_NEW_CARDS = 999;

export async function renderSettings(root: HTMLElement): Promise<Cleanup> {
  const settings = await getSettings();

  // ----- New cards per day -----

  const input = h('input', {
    id: 'new-per-day',
    class: 'stepper-value',
    type: 'number',
    inputmode: 'numeric',
    min: 0,
    max: MAX_NEW_CARDS,
    value: settings.newCardsPerDay,
  });
  const savedNote = h('span', { class: 'saved-note', 'aria-live': 'polite' });

  async function setNewCardsPerDay(value: number): Promise<void> {
    const cleaned = Math.min(MAX_NEW_CARDS, Math.max(0, Math.floor(Number.isFinite(value) ? value : 0)));
    input.value = String(cleaned);
    await updateSettings({ newCardsPerDay: cleaned });
    savedNote.textContent = 'Saved';
  }
  input.addEventListener('change', () => void setNewCardsPerDay(input.valueAsNumber));
  const step = (amount: number) => () => void setNewCardsPerDay((input.valueAsNumber || 0) + amount);

  // ----- Updates -----

  const updateArea = h('div', { class: 'result', 'aria-live': 'polite' });
  const showUpdateReady = () => setChildren(updateArea, updateBanner());
  const stopListening = onUpdateReady(showUpdateReady);
  showUpdateReady();

  async function lookForUpdate(): Promise<void> {
    setChildren(updateArea, h('p', { class: 'message' }, 'Checking…'));
    const outcome = await checkForUpdate();
    if (outcome === 'ready') showUpdateReady();
    else if (outcome === 'downloading')
      setChildren(updateArea, h('p', { class: 'message' }, 'Found a new version. Downloading it now…'));
    else if (outcome === 'up-to-date')
      setChildren(updateArea, h('p', { class: 'message is-success' }, 'You have the latest version.'));
    else setChildren(updateArea, h('p', { class: 'message' }, 'Couldn’t check right now. Are you offline?'));
  }

  setChildren(
    root,
    h('header', { class: 'page-header' }, h('h1', null, 'Settings')),
    h(
      'section',
      { class: 'panel' },
      h('label', { class: 'setting-title', for: 'new-per-day' }, 'New cards per day'),
      h(
        'p',
        null,
        'How many brand-new cards you’re shown each day. Reviews of cards you have already seen are never limited.',
      ),
      h(
        'div',
        { class: 'stepper' },
        h('button', { class: 'button stepper-button', 'aria-label': 'One fewer', onclick: step(-1) }, '−'),
        input,
        h('button', { class: 'button stepper-button', 'aria-label': 'One more', onclick: step(1) }, '+'),
        savedNote,
      ),
    ),
    h(
      'section',
      { class: 'panel' },
      h('h2', null, 'About'),
      h(
        'p',
        null,
        `Scheduling: ${FSRS_VERSION} (ts-fsrs), aiming for ${Math.round(DESIRED_RETENTION * 100)}% of cards remembered.`,
      ),
      h(
        'p',
        null,
        `This version was built on ${new Date(__BUILD_TIME__).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}.`,
      ),
      h('button', { class: 'button', onclick: () => void lookForUpdate() }, 'Check for updates'),
      updateArea,
    ),
  );

  return stopListening;
}
