import { useCallback, useEffect } from 'react';
import { AccessibilityInfo, findNodeHandle } from 'react-native';
import type { OverlayFocusOptions } from './overlay-focus.types';

export function useOverlayFocus({ mode, initial, trigger }: OverlayFocusOptions) {
  const focusInitial = useCallback(() => {
    const node = findNodeHandle(initial.current);
    if (node !== null) AccessibilityInfo.setAccessibilityFocus(node);
  }, [initial]);
  useEffect(() => {
    if (mode === 'closed') return;
    const frame = requestAnimationFrame(focusInitial);
    return () => {
      cancelAnimationFrame(frame);
      const node = findNodeHandle(trigger.current);
      if (node !== null) AccessibilityInfo.setAccessibilityFocus(node);
    };
  }, [mode, trigger, focusInitial]);
  return focusInitial;
}
