import { useCallback, useEffect } from 'react';
import { AccessibilityInfo, findNodeHandle, type View } from 'react-native';
import type { OverlayFocusOptions } from './overlay-focus.types';

export function focusOverlayControl(control: View | null) {
  const node = findNodeHandle(control);
  if (node !== null) AccessibilityInfo.setAccessibilityFocus(node);
}

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
