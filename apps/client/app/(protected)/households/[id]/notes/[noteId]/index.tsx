import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NoteResponseDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../../../../../../src/features/auth/session-runtime';
import { useHouseholdContext } from '../../../../../../src/features/households/household-context';
import { NoteDocument } from '../../../../../../src/features/notes/note-document';
import { useNoteWindowClose } from '../../../../../../src/features/notes/note-window';

/** A note, read and written on one page; `/notes/new` is a note not saved yet. */
export default function NoteRoute() {
  const { id, noteId, overview } = useLocalSearchParams<{ id: string; noteId: string; overview?: string }>();
  const router = useRouter();
  const { households } = useHouseholdContext();
  const { close } = useNoteWindowClose();
  const householdName = households.find(household => household.id === id)?.name ?? '';
  // Opened from the 总览, a new note asks which household to save to.
  const chooseHousehold = overview === '1' && households.length > 1;
  // The note this page's document created (a new note, or 另存为新笔记): taking its
  // address must not reload the note or remount the document that is being written.
  const created = useRef<{ id: string; key: string } | null>(null);
  const ownNote = noteId !== undefined && noteId === created.current?.id;
  const routeKey = `${id}:${noteId}`;
  const documentKey = ownNote ? created.current!.key : routeKey;
  const currentKey = useRef(documentKey);
  currentKey.current = documentKey;
  const [note, setNote] = useState<NoteResponseDto | null>(null);
  const [members, setMembers] = useState<ReadonlyMap<string, string> | null>(null);
  const [loading, setLoading] = useState(noteId !== 'new');
  const [loadedKey, setLoadedKey] = useState<string | null>(noteId === 'new' ? routeKey : null);
  const [error, setError] = useState<'auth:errors.sessionExpired' | 'loadError' | null>(null);
  const loadGeneration = useRef(0);

  const loadNote = useCallback(async () => {
    if (id === undefined || noteId === undefined || noteId === 'new' || noteId === created.current?.id) {
      setLoading(false);
      setLoadedKey(routeKey);
      return;
    }
    const generation = ++loadGeneration.current;
    setLoading(true);
    setError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (generation !== loadGeneration.current) return;
      if (token === null) { setError('auth:errors.sessionExpired'); return; }
      const fetched = await sessionApiClient.getNote(token, id, noteId);
      if (generation !== loadGeneration.current) return;
      setNote(fetched);
    } catch {
      if (generation === loadGeneration.current) setError('loadError');
    } finally {
      if (generation === loadGeneration.current) {
        setLoadedKey(routeKey);
        setLoading(false);
      }
    }
  }, [id, noteId, routeKey]);
  useEffect(() => { void loadNote(); }, [loadNote]);

  // Who wrote and who changed it, by name; the note opens without them.
  useEffect(() => {
    if (id === undefined) return undefined;
    let live = true;
    void (async () => {
      try {
        const token = await sessionTransport.getAccessToken();
        if (token === null) return;
        const household = await sessionApiClient.getHousehold(token, id);
        if (live) setMembers(new Map(household.members.map(member => [member.userId, member.displayName])));
      } catch { /* The note still opens; it shows when, not who. */ }
    })();
    return () => { live = false; };
  }, [id]);

  const onCreated = useCallback((saved: NoteResponseDto) => {
    created.current = { id: saved.id, key: currentKey.current };
    router.setParams({ noteId: saved.id });
  }, [router]);

  if (id === undefined || noteId === undefined) return null;
  const loadedNote = !ownNote && noteId !== 'new' && note?.id === noteId ? note : null;
  const isLoading = !ownNote && noteId !== 'new' && (loading || loadedKey !== routeKey);
  const loadError = !ownNote && noteId !== 'new' && !isLoading ? (error ?? (loadedNote === null ? 'notFound' : null)) : null;

  // Keep one NoteDocument / NoteWindow mounted across loading, errors and note switches so
  // native does not close and reopen its modal between states.
  return <NoteDocument
    documentKey={documentKey}
    householdId={id}
    noteId={noteId}
    note={ownNote ? null : loadedNote}
    loading={isLoading}
    error={loadError}
    onRetry={() => void loadNote()}
    members={members}
    chooseHousehold={chooseHousehold}
    householdName={householdName}
    onCreated={onCreated}
    onClose={close}
  />;
}
