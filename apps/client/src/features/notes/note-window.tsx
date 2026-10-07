import { NoteEditorChromeContext, type NoteEditorChrome } from './note-editor-chrome';
import { useCallback, useState } from 'react';
import { RouteWindow, useRouteWindowClose, type RouteWindowProps } from '../../ui/route-window';
import NoteListScreen from './note-list-screen';

export function useNoteWindowClose() { return useRouteWindowClose('notes'); }

export function NoteWindow(props: Omit<RouteWindowProps, 'resource' | 'fallback'>) {
  const [chrome, setChrome] = useState<NoteEditorChrome | null>(null);
  const updateChrome = useCallback((next: NoteEditorChrome | null) => setChrome(next), []);
  return <NoteEditorChromeContext.Provider value={updateChrome}>
    <RouteWindow {...props} headerActions={chrome?.headerActions ?? props.headerActions} footer={chrome?.footer ?? props.footer} step={chrome?.step ?? null} resource="notes" fallback={<NoteListScreen />} />
  </NoteEditorChromeContext.Provider>;
}
