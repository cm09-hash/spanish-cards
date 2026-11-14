/** Handing a file to the user: used for backups and for the weekly report. */
import { h } from './dom';

/**
 * Lets the user keep `file`.
 *  - On phones and tablets it opens the share sheet, which is where "Save to Files" lives.
 *  - Elsewhere (or if sharing isn't possible) it downloads the file.
 * `onSaved` is called once the file has been handed over; not if the share sheet was cancelled.
 *
 * Call this directly from a tap, with the file already prepared:
 * iPhones only allow the share sheet to open straight from a tap.
 */
export function saveFile(file: File, onSaved: (how: 'shared' | 'downloaded') => void): void {
  const download = () => {
    const url = URL.createObjectURL(file);
    const link = h('a', { href: url, download: file.name });
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    onSaved('downloaded');
  };

  const shareData = { files: [file] };
  const onPhone = window.matchMedia('(pointer: coarse)').matches;
  if (onPhone && navigator.canShare?.(shareData)) {
    navigator.share(shareData).then(
      () => onSaved('shared'),
      (error: unknown) => {
        const cancelled = error instanceof DOMException && error.name === 'AbortError';
        if (!cancelled) download();
      },
    );
  } else {
    download();
  }
}
