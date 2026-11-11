import { useCallback, useSyncExternalStore } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

import { theme } from './theme';
import { useDesktop } from './use-desktop';

/** The person's own choice; without one the sidebar is a rail of icons below 1280px and full above. */
type Choice = 'rail' | 'full' | null;

const STORAGE_KEY = 'muchakucha:sidebar';
const listeners = new Set<() => void>();

function readChoice(): Choice {
  if (Platform.OS !== 'web') return null;
  try {
    const value = globalThis.localStorage?.getItem(STORAGE_KEY);
    return value === 'rail' || value === 'full' ? value : null;
  } catch {
    return null;
  }
}

let choice: Choice = readChoice();

function setChoice(next: Choice) {
  choice = next;
  try {
    if (next === null) globalThis.localStorage?.removeItem(STORAGE_KEY);
    else globalThis.localStorage?.setItem(STORAGE_KEY, next);
  } catch {
    // Without storage the choice lasts until the page reloads.
  }
  listeners.forEach(listener => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

/**
 * Whether the desktop sidebar is drawn as a rail of icons, and the switch for
 * it. Collapsing or expanding is remembered on this browser; choosing what the
 * window's width would pick anyway goes back to following the width.
 */
export function useSidebarRail(): { rail: boolean; toggle(): void } {
  const desktop = useDesktop();
  const { width } = useWindowDimensions();
  const current = useSyncExternalStore(subscribe, () => choice, () => null);
  const automatic = width < theme.layout.railBreakpoint;
  const rail = desktop && (current === null ? automatic : current === 'rail');
  const toggle = useCallback(() => {
    const next = !rail;
    setChoice(next === automatic ? null : next ? 'rail' : 'full');
  }, [rail, automatic]);
  return { rail, toggle };
}
