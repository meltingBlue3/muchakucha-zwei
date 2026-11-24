import { useTranslation } from '../../i18n';
import { subscribeContentChanges } from '../content/content-changes';
import { useResourceNavigation } from '../../ui/use-resource-navigation';
import { useDesktop } from '../../ui/use-desktop';
import { theme } from '../../ui/theme';
import { View } from 'react-native';
import { useOpenWindowItem } from '../../ui/route-window';
import { FloatingCreateButton } from '../../ui/floating-create-button';
import { useContentDelete } from '../content/use-content-delete';
import { rememberRouteTrigger } from '../../platform/overlays/route-trigger';
import { useWorkspaceState } from '../../ui/workspace-state';
import { PageIntro } from '../../ui/page-intro';
import { GroupLabel, ListGroup } from '../../ui/list-group';
import { SearchField } from '../../ui/search-field';
import { HouseholdScreen } from '../households/household-screen';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NoteResponseDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../auth/session-runtime';
import { useHouseholdContext } from '../households/household-context';
import { NoteCard } from '../notes/note-card';
import { searchNotesByTitle } from '../notes/note-search';
import { Button, EmptyState, LoadError, LoadingState, Stack, Text } from '../../ui/primitives';

export default function NotesListRoute() {
  const { t } = useTranslation(['notes', 'auth', 'navigation']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const desktop = useDesktop();
  const openResource = useResourceNavigation();
  const openNoteId = useOpenWindowItem('noteId');
  const deleteNote = useContentDelete('notes');
  const { currentHouseholdId } = useHouseholdContext();

  const [notes, setNotes] = useState<NoteResponseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<'auth:errors.sessionExpired' | 'refreshError' | 'listError' | null>(null);
  const [query, setQuery] = useWorkspaceState(`view:${id}:notes:query`, '');
  const loadedHousehold = useRef<string | null>(null);
  const requestGeneration = useRef(0);
  // On a wide screen the latest note opens beside the list once per visit; closing it leaves the list.
  const openedLatest = useRef<string | null>(null);

  const householdId = id ?? currentHouseholdId;
  const visibleNotes = searchNotesByTitle(notes, query);
  const groups = desktop ? [{ key: 'recent' as const, items: visibleNotes.filter(note => Date.now() - new Date(note.updatedAt).getTime() <= 7 * 86400000) }, { key: 'older' as const, items: visibleNotes.filter(note => Date.now() - new Date(note.updatedAt).getTime() > 7 * 86400000) }] : [{ key: 'all' as const, items: visibleNotes }];

  const fetchData = useCallback(async () => {
    if (householdId === undefined || householdId === null || householdId === '') return;
    const request = ++requestGeneration.current;
    if (loadedHousehold.current !== householdId) { setLoading(true); setNotes([]); }
    setError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (request !== requestGeneration.current) return;
      if (token === null) {
        setError('auth:errors.sessionExpired');
        return;
      }
      const result = await sessionApiClient.listNotes(token, householdId);
      if (request !== requestGeneration.current) return;
      setNotes(result.notes);
      loadedHousehold.current = householdId;
    } catch {
      if (request === requestGeneration.current) setError(loadedHousehold.current === householdId ? 'refreshError' : 'listError');
    } finally {
      if (request === requestGeneration.current) setLoading(false);
    }
  }, [householdId]);

  // Refetch whenever this screen regains focus (e.g. returning from
  // create/edit), not just on first mount — otherwise the list shows
  // stale data after a mutation elsewhere in the stack.
  useFocusEffect(
    useCallback(() => {
      void fetchData();
      return () => { requestGeneration.current++; };
    }, [fetchData]),
  );

  // A note saves itself, also just after its window closed: the list follows every save, at any width.
  useEffect(() => {
    if (!householdId) return undefined;
    return subscribeContentChanges(changed => { if (changed === householdId) void fetchData(); });
  }, [householdId, fetchData]);

  const latest = notes[0];
  const open = useRef(openResource);
  open.current = openResource;
  useEffect(() => {
    // Decided once, when the list first arrives: a note closed later stays closed.
    if (!desktop || loading || !householdId || loadedHousehold.current !== householdId || openedLatest.current === householdId) return;
    openedLatest.current = householdId;
    // Opened above the list like a click would, so the list stays where it is behind it.
    if (!openNoteId && latest) open.current(`/households/${encodeURIComponent(householdId)}/notes/${encodeURIComponent(latest.id)}`);
  }, [desktop, loading, openNoteId, latest, householdId]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const handleNotePress = useCallback(
    (note: NoteResponseDto) => {
      rememberRouteTrigger();
      openResource(
        `/households/${encodeURIComponent(householdId!)}/notes/${encodeURIComponent(note.id)}`,
      );
    },
    [router, householdId, openResource],
  );

  const handleCreateNote = useCallback(() => {
    rememberRouteTrigger();
    openResource(`/households/${encodeURIComponent(householdId!)}/notes/new`);
  }, [router, householdId, openResource]);

  return (
    <HouseholdScreen
      active="notes"
      accessibilityLabel={t('main')}
      refreshing={refreshing}
      onRefresh={handleRefresh}
      width="reading"
      floatingAction={<FloatingCreateButton label={t('create')} onPress={handleCreateNote} />}
      aside={desktop && !openNoteId && latest ? <View style={{ flex: 1, paddingVertical: theme.spacing[5], paddingHorizontal: theme.spacing[6] }}>
        <Text color="inkMuted">{t('pickNote')}</Text>
      </View> : null}
    >
      <Stack gap={5}>
        <PageIntro title={t('navigation:pages.notes')} {...(notes.length > 0 ? { subtitle: t('summary', { count: notes.length }) } : {})} action={desktop ? <SearchField label={t('search')} placeholder={t('searchByTitle')} value={query} onChangeText={setQuery} /> : null} />

        {!desktop && (notes.length > 0 || query !== '') && (
          <SearchField label={t('search')} placeholder={t('searchByTitle')} value={query} onChangeText={setQuery} />
        )}

        {loading && <LoadingState label={t('loading')} />}

        {error !== null && <LoadError message={t(error)} onRetry={() => void fetchData()} retryAccessibilityLabel={t('retryLoad')} />}

        {!loading && error === null && notes.length === 0 && (
          <EmptyState title={t('emptyTitle')} message={t('emptyMessage')} />
        )}

        {!loading && error === null && notes.length > 0 && visibleNotes.length === 0 && (
          <EmptyState message={t('emptySearch', { query: query.trim() })} action={<Button label={t('clearSearch')} tone="secondary" onPress={() => setQuery('')} />} />
        )}

        {groups.filter(group => group.items.length).map(group => <Stack key={group.key} gap={desktop ? 0 : 2}>{group.key !== 'all' ? <GroupLabel flush>{t(group.key)}</GroupLabel> : null}<ListGroup flush>
          {group.items.map((note) => (
            <NoteCard key={note.id} note={note} selected={note.id === openNoteId} onPress={handleNotePress} onDelete={deleteNote(note)} />
          ))}
        </ListGroup></Stack>)}
      </Stack>
    </HouseholdScreen>
  );
}
