import { Redirect, useLocalSearchParams } from 'expo-router';

/** Notes are written where they are read; an old 编辑 link opens the note itself. */
export default function EditNoteRedirect() {
  const { id, noteId } = useLocalSearchParams<{ id: string; noteId: string }>();
  return <Redirect href={`/households/${encodeURIComponent(id)}/notes/${encodeURIComponent(noteId)}`} />;
}
