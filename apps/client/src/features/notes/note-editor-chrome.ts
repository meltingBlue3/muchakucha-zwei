import { createContext, type ReactNode } from 'react';
import type { RouteWindowStep } from '../../ui/route-window';

export interface NoteEditorChrome {
  headerActions: ReactNode;
  footer: ReactNode;
  step: RouteWindowStep | null;
}
export const NoteEditorChromeContext = createContext<((chrome: NoteEditorChrome | null) => void) | null>(null);
