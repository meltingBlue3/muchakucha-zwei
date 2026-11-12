import { createContext, type ReactNode } from 'react';
import { Platform } from 'react-native';
import type { RouteWindowStep } from '../../ui/route-window';

export interface NoteEditorChrome {
  headerActions: ReactNode;
  footer: ReactNode;
  step: RouteWindowStep | null;
}
export const NoteEditorChromeContext = createContext<((chrome: NoteEditorChrome | null) => void) | null>(null);

// Android's native input scrolls the caret into view when it owns the bounded viewport.
export const noteEditorViewport = Platform.OS === 'android' ? { flex: 1 } : undefined;
