/**
 * The app frame: decides which screen to show (from the "#/…" part of the address)
 * and draws the tab bar at the bottom.
 */
import { h, setChildren } from './dom';
import { icon, type IconName } from './icons';
import { renderBackup } from './screens/backup';
import { renderCardDetail } from './screens/cardDetail';
import { renderCards } from './screens/cards';
import { renderHome } from './screens/home';
import { renderImport } from './screens/import';
import { renderReview } from './screens/review';
import { renderSettings } from './screens/settings';

/** A screen draws itself into `root`. It may return a function that tidies up when the screen is left. */
export type Cleanup = () => void;

interface Screen {
  /** `detail` is whatever follows the screen's name in the address, e.g. the card id in "#/cards/my-card". */
  render: (root: HTMLElement, detail: string | null) => Promise<Cleanup | void>;
  /** Used for styling: the page gets the class "page-<style>". */
  style: string;
  /** Full-height screens hide the tab bar so nothing distracts from the card. */
  fullHeight?: boolean;
}

const SCREENS: Record<string, Screen> = {
  home: { render: renderHome, style: 'home' },
  review: { render: (root) => renderReview(root, 'normal'), style: 'review', fullHeight: true },
  quick: { render: (root) => renderReview(root, 'quick'), style: 'review', fullHeight: true },
  cards: { render: (root, id) => (id ? renderCardDetail(root, id) : renderCards(root)), style: 'cards' },
  import: { render: renderImport, style: 'import' },
  backup: { render: (root) => renderBackup(root), style: 'backup' },
  settings: { render: renderSettings, style: 'settings' },
};

const TABS: { route: string; label: string; icon: IconName }[] = [
  { route: 'home', label: 'Home', icon: 'home' },
  { route: 'cards', label: 'Cards', icon: 'cards' },
  { route: 'import', label: 'Import', icon: 'import' },
  { route: 'backup', label: 'Backup', icon: 'backup' },
  { route: 'settings', label: 'Settings', icon: 'settings' },
];

/** Go to another screen, e.g. navigate('review') or navigate('cards', cardId). */
export function navigate(route: string, detail?: string): void {
  location.hash = detail === undefined ? `#/${route}` : `#/${route}/${encodeURIComponent(detail)}`;
}

function currentRoute(): { name: string; detail: string | null } {
  const [name, ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  if (!(name in SCREENS)) return { name: 'home', detail: null };
  let detail: string | null = null;
  try {
    if (rest.length > 0 && rest[0] !== '') detail = decodeURIComponent(rest.join('/'));
  } catch {
    // A mangled address: just show the screen without the detail.
  }
  return { name, detail };
}

export function startApp(container: HTMLElement): void {
  const screenRoot = h('main', { class: 'screen' });
  const tabBar = h(
    'nav',
    { class: 'tabbar', 'aria-label': 'Main' },
    TABS.map((tab) =>
      h('a', { href: `#/${tab.route}`, class: 'tab', 'data-route': tab.route }, icon(tab.icon), tab.label),
    ),
  );
  container.replaceChildren(screenRoot, tabBar);

  let cleanup: Cleanup | void;
  let visit = 0;

  async function show(): Promise<void> {
    const route = currentRoute();
    const screen = SCREENS[route.name];
    const thisVisit = ++visit;

    cleanup?.();
    cleanup = undefined;

    container.classList.toggle('is-full-height', screen.fullHeight === true);
    for (const tab of tabBar.querySelectorAll<HTMLElement>('.tab')) {
      if (tab.dataset.route === route.name) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    }

    // Draw into a fresh element, and only put it on the page if the user
    // hasn't already moved on to another screen while it was loading.
    const page = h('div', { class: `page page-${screen.style}` });
    let pageCleanup: Cleanup | void = undefined;
    try {
      pageCleanup = await screen.render(page, route.detail);
    } catch (error) {
      console.error(error);
      setChildren(
        page,
        h('h1', null, 'Something went wrong'),
        h('p', { class: 'message is-error' }, error instanceof Error ? error.message : String(error)),
      );
    }
    if (thisVisit !== visit) {
      pageCleanup?.();
      return;
    }
    cleanup = pageCleanup;
    screenRoot.replaceChildren(page);
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', () => void show());
  void show();
}
