/** Where the app starts. */
import './styles.css';
import { registerServiceWorker } from './pwa';
import { initScheduler } from './study/scheduler';
import { startApp } from './ui/app';

async function main(): Promise<void> {
  const container = document.getElementById('app')!;
  try {
    await initScheduler();
    startApp(container);
  } catch (error) {
    console.error(error);
    container.textContent = 'Sorry, the app could not start. Try closing and reopening it.';
  }

  registerServiceWorker();

  // Ask the browser not to clear this app's saved data when the device runs low on space.
  void navigator.storage?.persist?.().catch(() => undefined);
}

void main();
