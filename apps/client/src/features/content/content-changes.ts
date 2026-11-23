import { useEffect, useRef } from 'react';
import { usePathname } from 'expo-router';
import { useDesktop } from '../../ui/use-desktop';

const listeners = new Set<(householdId: string, source?: () => unknown) => void>();

/** A successful editor write also refreshes the retained desktop list. */
export function notifyContentChanged(householdId: string, source?: () => unknown) {
  listeners.forEach(listener => listener(householdId, source));
}

/** Calls `listener` after every saved change to a household's content, such as a completed task. */
export function subscribeContentChanges(listener: (householdId: string) => void): () => void {
  const wrapped = (householdId: string) => listener(householdId);
  listeners.add(wrapped);
  return () => { listeners.delete(wrapped); };
}

export function useContentChanges(householdId: string | readonly string[] | null | undefined, refresh: () => unknown) {
  const desktop = useDesktop();
  const path = usePathname();
  const paneOpen = /\/(tasks|events|notes|recurrence-rules)\/[^/]+(?:\/edit)?$/.test(path);
  const latest = useRef(refresh);
  latest.current = refresh;
  // The 总览 listens to every household it shows; the key keeps the effect stable across renders.
  const watched = householdId == null ? '' : typeof householdId === 'string' ? householdId : householdId.join(',');
  useEffect(() => {
    if (!desktop || !paneOpen || !watched) return;
    const ids = new Set(watched.split(','));
    const listener = (changed: string, source?: () => unknown) => { if (ids.has(changed) && source !== latest.current) void latest.current(); };
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, [desktop, paneOpen, watched]);
}
