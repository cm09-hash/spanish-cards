/** Animation helpers that respect the phone's "Reduce Motion" setting. */

/** False when the user has asked their device for less motion (Settings → Accessibility → Motion on an iPhone). */
export function motionAllowed(): boolean {
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Plays an animation on an element and waits for it to finish.
 * With Reduce Motion on, it does nothing and returns straight away.
 */
export async function animate(
  element: Element,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
): Promise<void> {
  if (!motionAllowed() || typeof element.animate !== 'function') return;
  try {
    await element.animate(keyframes, options).finished;
  } catch {
    // The animation was cut short (for example the element was removed). Nothing to do.
  }
}
