import type { View } from 'react-native';

let trigger: HTMLElement | null = null;
export function rememberRouteTrigger(): void {
  trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
}
export function getRouteTrigger(): View | null {
  const original = trigger;
  if (!original) return null;
  // Stack navigation reveals the background after the modal effect cleans up.
  // Wait for that paint; refetching can also replace the original list row.
  const label = original.getAttribute('aria-label');
  return { focus() {
    requestAnimationFrame(() => {
      const target = original.isConnected ? original : label
        ? document.querySelector<HTMLElement>(`[aria-label="${CSS.escape(label)}"]`) : null;
      const fallback = target ?? document.querySelector<HTMLElement>(
        '[role="main"] [aria-label^="创建"], [role="main"] button:not([disabled])',
      );
      fallback?.focus({ preventScroll: true });
    });
  } } as unknown as View;
}
