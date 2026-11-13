/** A small notice shown when a newer version of the app has been downloaded. */
import { isUpdateReady } from '../pwa';
import { h } from './dom';

export function updateBanner(): HTMLElement | null {
  if (!isUpdateReady()) return null;
  return h(
    'div',
    { class: 'banner' },
    h('span', null, 'A new version of the app is ready.'),
    h('button', { class: 'button small', onclick: () => location.reload() }, 'Update now'),
  );
}
