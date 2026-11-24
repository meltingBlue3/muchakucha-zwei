import { RouteWindow, useRouteWindowClose, type RouteWindowProps } from '../../ui/route-window';
import NoteListScreen from './note-list-screen';

export function useNoteWindowClose() { return useRouteWindowClose('notes'); }

/** A note's window: beside the notes list on a wide screen, the notes list behind it for a direct link. */
export function NoteWindow(props: Omit<RouteWindowProps, 'resource' | 'fallback'>) {
  return <RouteWindow {...props} resource="notes" fallback={<NoteListScreen />} />;
}
