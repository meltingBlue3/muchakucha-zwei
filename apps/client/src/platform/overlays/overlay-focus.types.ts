import type { RefObject } from 'react';
import type { View } from 'react-native';

export interface OverlayFocusOptions {
  mode: 'closed' | 'menu' | 'profile' | 'logout';
  panel: RefObject<View | null>;
  initial: RefObject<View | null>;
  trigger: RefObject<View | null>;
  onClose(): void;
}
