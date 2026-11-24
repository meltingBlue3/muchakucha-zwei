import { useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { View } from 'react-native';
import { theme } from '../../ui/theme';

/**
 * The full-window layer an anchored menu floats in. Inside a window it joins
 * that window's dialog rather than stacking a second modal: React Native
 * Web would strip the window's dialog role while another modal covers it.
 * Elsewhere it is a dialog of its own, named by the menu. Escape and focus
 * are left to useOverlayFocus.
 */
export function MenuLayer({ label, trigger, children }: {
  label: string;
  trigger: RefObject<View | null>;
  onShow(): void;
  onClose(): void;
  children: ReactNode;
}) {
  const [host] = useState(() => (trigger.current as unknown as HTMLElement | null)?.closest<HTMLElement>('[aria-modal="true"]') ?? null);
  const layer = { position: 'fixed', inset: 0, zIndex: theme.layout.popoverLayer, display: 'flex' } as const;
  return createPortal(
    host
      ? <div style={layer}>{children}</div>
      : <div role="dialog" aria-modal="true" aria-label={label} style={layer}>{children}</div>,
    host ?? document.body,
  );
}
