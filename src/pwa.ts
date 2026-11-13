/**
 * Offline support. The service worker (public file "sw.js", generated at build time)
 * keeps a copy of the whole app on the device so it opens without internet.
 * This file switches it on and notices when a newer version of the app has arrived.
 */

let registration: ServiceWorkerRegistration | undefined;
let updateReady = false;
const listeners = new Set<() => void>();

export function registerServiceWorker(): void {
  // Only in the built app: during development it would just get in the way.
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  // If a service worker was already in charge when the page opened, then a change
  // of service worker later on means a new version of the app has been downloaded.
  const hadWorkerAtStart = navigator.serviceWorker.controller !== null;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadWorkerAtStart) return;
    updateReady = true;
    listeners.forEach((listener) => listener());
  });

  navigator.serviceWorker
    .register('./sw.js')
    .then((result) => (registration = result))
    .catch((error) => console.warn('Offline support could not be switched on:', error));

  // Home Screen apps can stay open in the background for days,
  // so look for a new version each time the app comes back into view.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForUpdate();
  });
}

/** True once a newer version has been downloaded; reloading the page switches to it. */
export function isUpdateReady(): boolean {
  return updateReady;
}

/** Calls `listener` when a newer version becomes ready. Returns a function that stops listening. */
export function onUpdateReady(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export type UpdateCheck = 'unavailable' | 'up-to-date' | 'downloading' | 'ready';

/**
 * Asks the server whether there is a newer version of the app.
 *  - 'unavailable'  couldn't check (offline, or offline support isn't running)
 *  - 'up-to-date'   this is the newest version
 *  - 'downloading'  a newer version was found and is being fetched (onUpdateReady fires when done)
 *  - 'ready'        a newer version is already downloaded; reload to use it
 */
export async function checkForUpdate(): Promise<UpdateCheck> {
  if (!registration) return 'unavailable';
  try {
    await registration.update();
  } catch {
    return 'unavailable';
  }
  if (updateReady) return 'ready';
  return registration.installing || registration.waiting ? 'downloading' : 'up-to-date';
}
