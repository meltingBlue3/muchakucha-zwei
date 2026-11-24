import { useTranslation } from '../../../../../../src/i18n';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NoteResponseDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../../../../../../src/features/auth/session-runtime';
import { useHouseholdContext } from '../../../../../../src/features/households/household-context';
import { NoteDocument } from '../../../../../../src/features/notes/note-document';
import { NoteWindow, useNoteWindowClose } from '../../../../../../src/features/notes/note-window';
import { LoadError, LoadingState, Stack } from '../../../../../../src/ui/primitives';

/** A note, read and written on one page; `/notes/new` is a note not saved yet. */
export default function NoteRoute() {
  const { t } = useTranslation(['notes', 'auth']);
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
  const documentKey = ownNote ? created.current!.key : `${id}:${noteId}`;
  const currentKey = useRef(documentKey);
  currentKey.current = documentKey;
  const [note, setNote] = useState<NoteResponseDto | null>(null);
  const [members, setMembers] = useState<ReadonlyMap<string, string> | null>(null);
  const [loading, setLoading] = useState(noteId !== 'new');
  const [error, setError] = useState<'auth:errors.sessionExpired' | 'loadError' | null>(null);

  const loadNote = useCallback(async () => {
    if (id === undefined || noteId === undefined || noteId === 'new' || noteId === created.current?.id) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) { setError('auth:errors.sessionExpired'); return; }
      setNote(await sessionApiClient.getNote(token, id, noteId));
    } catch {
      setError('loadError');
    } finally {
      setLoading(false);
    }
  }, [id, noteId]);
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
  if (!ownNote && noteId !== 'new' && (loading || error !== null || note === null)) {
    return <NoteWindow title={t('document')}><Stack gap={3}>
      {loading ? <LoadingState label={t('loading')} /> : <LoadError message={t(error ?? 'notFound')} onRetry={() => void loadNote()} />}
    </Stack></NoteWindow>;
  }
  return <NoteDocument
    // The same document stays open while a note it created takes its address; another note is another document.
    key={documentKey}
    householdId={id}
    noteId={noteId}
    note={ownNote ? null : note}
    members={members}
    chooseHousehold={chooseHousehold}
    householdName={householdName}
    onCreated={onCreated}
    onClose={close}
  />;
}
