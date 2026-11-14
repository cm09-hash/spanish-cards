/** Backup: save everything to one file, or restore everything from one. */
import { backupFileName, buildBackup, parseBackup, type ParsedBackup } from '../../data/backupFile';
import { FileProblem } from '../../data/cardFile';
import { getSettings, readEverything, replaceEverything, updateSettings } from '../../data/db';
import { formatDate } from '../../study/time';
import { count, filePickerButton, h, setChildren } from '../dom';

export async function renderBackup(root: HTMLElement, notice?: string): Promise<void> {
  const now = new Date();
  const saved = await readEverything();

  // The file is prepared up front so that tapping the button can open the
  // share sheet immediately (iPhones only allow that directly from a tap).
  const fileName = backupFileName(now);
  const file = new File([JSON.stringify(buildBackup(saved, now), null, 2)], fileName, { type: 'application/json' });

  const saveResult = h('div', { class: 'result', 'aria-live': 'polite' });
  const restoreArea = h('div', { class: 'result', 'aria-live': 'polite' });
  const lastBackup = h('p', { class: 'footnote' }, lastBackupText(saved.settings.lastBackupAt));

  // ----- Saving a backup -----

  function saveBackup(): void {
    const shareData = { files: [file] };
    const onPhone = window.matchMedia('(pointer: coarse)').matches;
    if (onPhone && navigator.canShare?.(shareData)) {
      // Phones and tablets: open the share sheet, where "Save to Files" lives.
      navigator.share(shareData).then(
        () => void backupSaved('Backup shared. If you chose “Save to Files”, it is now in the Files app.'),
        (error: unknown) => {
          const cancelled = error instanceof DOMException && error.name === 'AbortError';
          if (!cancelled) downloadBackup();
        },
      );
    } else {
      downloadBackup();
    }
  }

  function downloadBackup(): void {
    const url = URL.createObjectURL(file);
    const link = h('a', { href: url, download: fileName });
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    void backupSaved(`Backup downloaded as ${fileName}.`);
  }

  async function backupSaved(text: string): Promise<void> {
    await updateSettings({ lastBackupAt: now.toISOString() });
    lastBackup.textContent = lastBackupText(now.toISOString());
    setChildren(saveResult, h('p', { class: 'message is-success' }, text));
  }

  // ----- Restoring from a backup -----

  async function backupChosen(text: string): Promise<void> {
    let backup: ParsedBackup;
    try {
      backup = parseBackup(text, await getSettings());
    } catch (error) {
      const message =
        error instanceof FileProblem ? error.message : 'That file could not be read. Nothing was changed.';
      if (!(error instanceof FileProblem)) console.error(error);
      setChildren(restoreArea, h('p', { class: 'message is-error' }, message));
      return;
    }

    // Nothing has been changed yet. Say exactly what will happen and ask first.
    const from = backup.exportedAt ? ` from ${formatDate(new Date(backup.exportedAt))}` : '';
    setChildren(
      restoreArea,
      h(
        'div',
        { class: 'message is-warning' },
        h('p', null, `This backup${from} holds ${describe(backup)}.`),
        h('p', null, `Restoring it will replace everything on this device (${describe(saved)}).`),
        h(
          'div',
          { class: 'button-row' },
          h('button', { class: 'button danger', onclick: () => void restore(backup) }, 'Replace everything'),
          h('button', { class: 'button', onclick: () => setChildren(restoreArea) }, 'Cancel'),
        ),
      ),
    );
    restoreArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function restore(backup: ParsedBackup): Promise<void> {
    try {
      await replaceEverything(backup);
      await renderBackup(root, `Restored ${describe(backup)}.`);
    } catch (error) {
      console.error(error);
      setChildren(
        restoreArea,
        h('p', { class: 'message is-error' }, 'The restore failed. Your existing data was left untouched.'),
      );
    }
  }

  setChildren(
    root,
    h('header', { class: 'page-header' }, h('h1', null, 'Backup')),
    notice && h('p', { class: 'message is-success' }, notice),
    h(
      'p',
      null,
      `Your cards and progress are stored only on this device (${describe(saved)}). Save a backup now and then so you can never lose them.`,
    ),
    h(
      'section',
      { class: 'panel' },
      h('h2', null, 'Save a backup'),
      h(
        'p',
        null,
        'Puts all your cards, your full review history, your sprints and your settings into one file. On an iPhone, choose “Save to Files” in the menu that appears.',
      ),
      h('button', { class: 'button primary big', onclick: saveBackup }, 'Save backup file'),
      saveResult,
      lastBackup,
    ),
    h(
      'section',
      { class: 'panel' },
      h('h2', null, 'Restore from a backup'),
      h(
        'p',
        null,
        'Brings back everything from a backup file. This replaces what is on this device, and you’ll be asked to confirm first.',
      ),
      filePickerButton('Choose a backup file', '', (text) => void backupChosen(text)),
      restoreArea,
    ),
  );
}

function describe(data: { cards: unknown[]; reviews: unknown[] }): string {
  return `${count(data.cards.length, 'card')} and ${count(data.reviews.length, 'review')}`;
}

function lastBackupText(lastBackupAt: string | null): string {
  return lastBackupAt ? `Last backup: ${formatDate(new Date(lastBackupAt))}` : 'No backup saved yet.';
}
