import { RouteWindow, useRouteWindowClose, type RouteWindowProps } from '../../ui/route-window';
import NoteListScreen from './note-list-screen';

export function useNoteWindowClose() { return useRouteWindowClose('notes'); }
export function NoteWindow(props: Omit<RouteWindowProps, 'resource' | 'fallback'>) {
  return <RouteWindow {...props} resource="notes" fallback={<NoteListScreen />} />;
}
