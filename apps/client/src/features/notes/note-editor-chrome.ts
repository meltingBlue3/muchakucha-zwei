import { createContext, type ReactNode } from 'react';
import type { RouteWindowStep } from '../../ui/route-window';

export interface NoteEditorChrome {
  headerActions: ReactNode;
  footer: ReactNode;
  step: RouteWindowStep | null;
}
export const NoteEditorChromeContext = createContext<((chrome: NoteEditorChrome | null) => void) | null>(null);

// The input or preview scrolls inside the space left by the window controls.
export const noteEditorViewport = { flex: 1, minHeight: 0 };
