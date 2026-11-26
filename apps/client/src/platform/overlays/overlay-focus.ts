import { useCallback, useEffect, type RefObject } from 'react';
import { AccessibilityInfo, findNodeHandle, type View } from 'react-native';
import type { OverlayFocusOptions } from './overlay-focus.types';

export function focusOverlayControl(control: View | null) {
  const node = findNodeHandle(control);
  if (node !== null) AccessibilityInfo.setAccessibilityFocus(node);
}

// Native views hide covered content through their accessibility props.
export function useCoveredOverlay(_layer: RefObject<View | null> | null, _covered: boolean) {}

export function useOverlayFocus({ mode, initial, trigger }: OverlayFocusOptions) {
  const focusInitial = useCallback(() => focusOverlayControl(initial.current), [initial]);
  useEffect(() => {
    if (mode === 'closed') return;
    const frame = requestAnimationFrame(focusInitial);
    return () => {
      cancelAnimationFrame(frame);
      focusOverlayControl(trigger.current);
    };
  }, [mode, trigger, focusInitial]);
  return focusInitial;
}
