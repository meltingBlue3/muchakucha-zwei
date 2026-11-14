import type { View } from 'react-native';

/** How long focus follows a control that the list's refetch removes; past it, a slow refetch leaves focus where it falls. */
const FOLLOW_MS = 5000;

let trigger: HTMLElement | null = null;
export function rememberRouteTrigger(): void {
  trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
}
export function getRouteTrigger(): View | null {
  const original = trigger;
  if (!original) return null;
  const label = original.getAttribute('aria-label');
  // The control that opened the window, else one with its label (a refetch can
  // replace a list row), else the page's create button.
  const target = () => (original.isConnected ? original : label
    ? document.querySelector<HTMLElement>(`[aria-label="${CSS.escape(label)}"]`) : null)
    ?? document.querySelector<HTMLElement>('[role="main"] [data-route-focus="fallback"]')
    ?? document.querySelector<HTMLElement>('[role="main"] button:not([disabled])');
  return { focus() {
    // Stack navigation reveals the background after the modal effect cleans up.
    // Wait for that paint.
    requestAnimationFrame(() => {
      const element = target();
      if (!element) return;
      element.focus({ preventScroll: true });
      // The list refetches after the window's change and can then drop the
      // control focus just returned to, as after a delete. Move on once it goes,
      // unless the user has moved focus first.
      const observer = new MutationObserver(() => {
        if (document.activeElement !== element && document.activeElement !== document.body) observer.disconnect();
        else if (!element.isConnected) { observer.disconnect(); target()?.focus({ preventScroll: true }); }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), FOLLOW_MS);
    });
  } } as unknown as View;
}

/**
 * Marks the page's create button as where focus returns when a window closes
 * and the control that opened it is gone, as after deleting a row. A label
 * would only match one language.
 */
export const routeFocusFallback = { dataSet: { routeFocus: 'fallback' } } as object;
