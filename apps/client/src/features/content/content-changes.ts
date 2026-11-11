import { useEffect, useRef } from 'react';
import { usePathname } from 'expo-router';
import { useDesktop } from '../../ui/use-desktop';

const listeners = new Set<(householdId: string, source?: () => unknown) => void>();

/** A successful editor write also refreshes the retained desktop list. */
export function notifyContentChanged(householdId: string, source?: () => unknown) {
  listeners.forEach(listener => listener(householdId, source));
}

export function useContentChanges(householdId: string | null | undefined, refresh: () => unknown) {
  const desktop = useDesktop();
  const path = usePathname();
  const paneOpen = /\/(tasks|events|notes|recurrence-rules)\/[^/]+(?:\/edit)?$/.test(path);
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => {
    if (!desktop || !paneOpen || !householdId) return;
    const listener = (changed: string, source?: () => unknown) => { if (changed === householdId && source !== latest.current) void latest.current(); };
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, [desktop, paneOpen, householdId]);
}
