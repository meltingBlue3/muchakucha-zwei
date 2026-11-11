import { useCallback, useEffect, useRef } from 'react';
import type { OverlayFocusOptions } from './overlay-focus.types';

// Open overlays in stacking order; only the top one handles keys, so a window
// opened above another does not close or steal focus from both.
const openOverlays: object[] = [];

const selector = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"]):not([aria-disabled="true"])';

export function useOverlayFocus({ mode, panel, initial, trigger, onClose }: OverlayFocusOptions) {
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  const focusInitial = useCallback(() => {
    (initial.current as unknown as HTMLElement | null)?.focus();
  }, [initial]);

  useEffect(() => {
    if (mode === 'closed') return;
    const keyboard = document.activeElement?.matches(':focus-visible') ?? false;
    // A pane opened by pointer leaves focus on the list row, unless nothing holds focus any more
    // (the control that opened it was replaced): then the pane takes it, so keys keep reaching it.
    const lost = !document.activeElement || document.activeElement === document.body;
    const frame = mode !== 'pane' || keyboard || lost ? requestAnimationFrame(focusInitial) : 0;
    const token = {};
    openOverlays.push(token);
    const onKeyDown = (event: KeyboardEvent) => {
      if (openOverlays[openOverlays.length - 1] !== token) return;
      if (mode === 'pane' && !(panel.current as unknown as HTMLElement | null)?.contains(document.activeElement)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close.current();
        return;
      }
      const element = panel.current as unknown as HTMLElement | null;
      const items = Array.from(element?.querySelectorAll<HTMLElement>(selector) ?? [])
        .filter((item) => item.getClientRects().length > 0);
      const first = items[0];
      const last = items[items.length - 1];
      if (mode === 'menu' && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const index = items.indexOf(document.activeElement as HTMLElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      } else if (event.key === 'Tab' && mode !== 'pane') {
        if (!first) { event.preventDefault(); focusInitial(); }
        else if (event.shiftKey && (document.activeElement === first || !element?.contains(document.activeElement))) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !element?.contains(document.activeElement))) {
          event.preventDefault(); first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      cancelAnimationFrame(frame);
      openOverlays.splice(openOverlays.indexOf(token), 1);
      document.removeEventListener('keydown', onKeyDown, true);
      (trigger.current as unknown as HTMLElement | null)?.focus();
    };
  }, [mode, panel, trigger, focusInitial]);
  return focusInitial;
}
