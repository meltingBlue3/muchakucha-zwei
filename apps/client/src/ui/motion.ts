import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { theme } from './theme';

/** Desktop motion is CSS on the web; native layouts change without it. */
const web = Platform.OS === 'web';

export function prefersReducedMotion(): boolean {
  return web && typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * A CSS transition for a desktop layout change, such as a column folding away
 * or the page making room for a pane. Movement is dropped when reduced motion
 * is requested; a fade keeps a short one.
 */
export function layoutTransition(properties: string): object {
  if (!web) return {};
  const reduced = prefersReducedMotion();
  return {
    transitionProperty: properties,
    transitionDuration: `${reduced ? (properties === 'opacity' ? theme.motion.reducedTransitionMs : 0) : theme.motion.paneMs}ms`,
    transitionTimingFunction: theme.motion.easing,
  };
}

/** Runs after the browser has painted the current frame, so a following style change transitions. */
function afterPaint(callback: () => void): () => void {
  let second = 0;
  const first = requestAnimationFrame(() => { second = requestAnimationFrame(callback); });
  return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
}

/**
 * Keeps something mounted while it animates away. `shown` turns on a frame
 * after mounting and off at once; `mounted` follows it off once the
 * transition has had time to finish. What is visible on first render does
 * not animate in.
 */
export function usePresence(visible: boolean): { mounted: boolean; shown: boolean } {
  const [mounted, setMounted] = useState(visible);
  const [shown, setShown] = useState(visible);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      return afterPaint(() => setShown(true));
    }
    setShown(false);
    const timer = setTimeout(() => setMounted(false), theme.motion.paneMs);
    return () => clearTimeout(timer);
  }, [visible]);
  return { mounted: mounted || visible, shown: shown && visible };
}

// A pane that replaces another (switching items) appears in place; only one
// opening onto an empty side slides in.
let openPanes = 0;
let lastPaneClosedAt = 0;

/**
 * The entrance of a desktop side pane: it fades in while sliding a short way
 * from the right. With reduced motion it only fades.
 */
export function usePaneEntrance(enabled: boolean): object {
  const [animate] = useState(() => enabled && web && openPanes === 0 && Date.now() - lastPaneClosedAt > theme.motion.paneMs);
  const [entered, setEntered] = useState(!animate);
  useEffect(() => {
    if (!enabled) return undefined;
    openPanes += 1;
    return () => { openPanes -= 1; lastPaneClosedAt = Date.now(); };
  }, [enabled]);
  useEffect(() => (entered ? undefined : afterPaint(() => setEntered(true))), [entered]);
  if (!animate) return {};
  const reduced = prefersReducedMotion();
  return {
    opacity: entered ? 1 : 0,
    transform: [{ translateX: entered || reduced ? 0 : theme.motion.paneOffset }],
    ...layoutTransition(reduced ? 'opacity' : 'opacity, transform'),
  };
}
