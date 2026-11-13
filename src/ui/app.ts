/**
 * The app frame: decides which screen to show (from the "#/…" part of the address)
 * and draws the tab bar at the bottom.
 */
import { h, setChildren } from './dom';
import { icon, type IconName } from './icons';
import { renderBackup } from './screens/backup';
import { renderHome } from './screens/home';
import { renderImport } from './screens/import';
import { renderReview } from './screens/review';
import { renderSettings } from './screens/settings';

/** A screen draws itself into `root`. It may return a function that tidies up when the screen is left. */
export type Cleanup = () => void;
type Screen = (root: HTMLElement) => Promise<Cleanup | void>;

const SCREENS: Record<string, Screen> = {
  home: renderHome,
  review: renderReview,
  import: renderImport,
  backup: renderBackup,
  settings: renderSettings,
};

const TABS: { route: string; label: string; icon: IconName }[] = [
  { route: 'home', label: 'Home', icon: 'home' },
  { route: 'import', label: 'Import', icon: 'import' },
  { route: 'backup', label: 'Backup', icon: 'backup' },
  { route: 'settings', label: 'Settings', icon: 'settings' },
];

/** Go to another screen, e.g. navigate('review'). */
export function navigate(route: string): void {
  location.hash = `#/${route}`;
}

function currentRoute(): string {
  const route = location.hash.replace(/^#\/?/, '');
  return route in SCREENS ? route : 'home';
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
    const thisVisit = ++visit;

    cleanup?.();
    cleanup = undefined;

    // The review screen is full-height with no tab bar, so nothing distracts from the card.
    container.classList.toggle('is-reviewing', route === 'review');
    for (const tab of tabBar.querySelectorAll<HTMLElement>('.tab')) {
      if (tab.dataset.route === route) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    }

    // Draw into a fresh element, and only put it on the page if the user
    // hasn't already moved on to another screen while it was loading.
    const page = h('div', { class: `page page-${route}` });
    let pageCleanup: Cleanup | void = undefined;
    try {
      pageCleanup = await SCREENS[route](page);
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
