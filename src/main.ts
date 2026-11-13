/** Where the app starts. */
import './styles.css';
import { registerServiceWorker } from './pwa';
import { initScheduler } from './study/scheduler';
import { startApp } from './ui/app';
import { setSoundsEnabled, unlockAudioOnFirstTouch } from './ui/sound';
import { getSettings } from './data/db';

async function main(): Promise<void> {
  const container = document.getElementById('app')!;
  try {
    // Opening the database here also upgrades data saved by an older version of the app.
    const [settings] = await Promise.all([getSettings(), initScheduler()]);
    setSoundsEnabled(settings.soundsOn);
    startApp(container);
  } catch (error) {
    console.error(error);
    container.textContent = 'Sorry, the app could not start. Try closing and reopening it.';
  }

  registerServiceWorker();
  unlockAudioOnFirstTouch();

  // iPhones only show a button's "pressed" look if the page listens for touches at all.
  document.addEventListener('touchstart', () => undefined, { passive: true });

  // Ask the browser not to clear this app's saved data when the device runs low on space.
  void navigator.storage?.persist?.().catch(() => undefined);
}

void main();
