import { useTranslation } from '../../i18n';
import { subscribeContentChanges } from '../content/content-changes';
import { useResourceNavigation } from '../../ui/use-resource-navigation';
import { useDesktop, useDesktopDensity } from '../../ui/use-desktop';
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
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LabelResponseDto, NoteResponseDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../auth/session-runtime';
import { useHouseholdContext } from '../households/household-context';
import { LabelFilter } from '../labels/label-chip';
import { labelName } from '../labels/label-name';
import { NoteCard } from '../notes/note-card';
import { saveNotePin } from './note-marks';
import { noteListView } from './note-list-view';
import { Banner, Button, EmptyState, LoadError, LoadingState, Stack, Text } from '../../ui/primitives';

const ALL_LABELS = 'all';

export default function NotesListRoute() {
  const { t } = useTranslation(['notes', 'auth', 'navigation']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const desktop = useDesktop();
  const dense = useDesktopDensity();
  const openResource = useResourceNavigation();
  const openNoteId = useOpenWindowItem('noteId');
  const deleteNote = useContentDelete('notes');
  const { currentHouseholdId } = useHouseholdContext();

  const [notes, setNotes] = useState<NoteResponseDto[]>([]);
  // The household's labels, only to order the label row; read with the notes, since on a wide screen the list loses focus to the note it opens.
  const [householdLabels, setHouseholdLabels] = useState<LabelResponseDto[]>([]);
  const [members, setMembers] = useState<ReadonlyMap<string, string> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<'auth:errors.sessionExpired' | 'refreshError' | 'listError' | null>(null);
  const [pinError, setPinError] = useState<'pinFailed' | 'unpinFailed' | null>(null);
  const [query, setQuery] = useWorkspaceState(`view:${id}:notes:query`, '');
  const [labelFilter, setLabelFilter] = useWorkspaceState(`view:${id}:notes:labelFilter`, ALL_LABELS);
  const loadedHousehold = useRef<string | null>(null);
  const requestGeneration = useRef(0);
  // On a wide screen the latest note opens beside the list once per visit; closing it leaves the list.
  const openedLatest = useRef<string | null>(null);

  const householdId = id ?? currentHouseholdId;
  const view = useMemo(() => noteListView(notes, {
    query, labelId: labelFilter === ALL_LABELS ? null : labelFilter, wide: desktop, householdLabels, now: new Date(),
  }), [notes, query, labelFilter, desktop, householdLabels]);
  const loaded = !loading && error === null && loadedHousehold.current === householdId;

  // A label that no note carries any more leaves the row, and the filter goes back to 全部.
  useEffect(() => {
    if (loaded && labelFilter !== ALL_LABELS && view.labelId === null) setLabelFilter(ALL_LABELS);
  }, [loaded, labelFilter, view.labelId, setLabelFilter]);

  const fetchData = useCallback(async () => {
    if (householdId === undefined || householdId === null || householdId === '') return;
    const request = ++requestGeneration.current;
    if (loadedHousehold.current !== householdId) { setLoading(true); setNotes([]); setHouseholdLabels([]); }
    setError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (request !== requestGeneration.current) return;
      if (token === null) {
        setError('auth:errors.sessionExpired');
        return;
      }
      const [result, labels] = await Promise.all([
        sessionApiClient.listNotes(token, householdId),
        // Without them the row follows the order the notes show their labels in.
        sessionApiClient.listLabels(token, householdId).catch(() => null),
      ]);
      if (request !== requestGeneration.current) return;
      setNotes(result.notes);
      if (labels !== null) setHouseholdLabels(labels.labels);
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

  // Who wrote each note, by name, from the same source as the note's own byline; rows show no author until then.
  useEffect(() => {
    if (!householdId) return undefined;
    let live = true;
    setMembers(null);
    void (async () => {
      try {
        const token = await sessionTransport.getAccessToken();
        if (token === null) return;
        const household = await sessionApiClient.getHousehold(token, householdId);
        if (live) setMembers(new Map(household.members.map(member => [member.userId, member.displayName])));
      } catch { /* Rows still show when and what, not who. */ }
    })();
    return () => { live = false; };
  }, [householdId]);

  // The most recently changed note, whether pinned or not: a pin does not change which note was worked on last.
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
    [householdId, openResource],
  );

  const togglePin = useCallback(async (note: NoteResponseDto) => {
    const pinned = note.pinnedAt === null;
    setPinError(null);
    try {
      // Saving tells the list to refetch, so the note moves once the household has it.
      await saveNotePin(note.householdId, note.id, pinned);
    } catch {
      setPinError(pinned ? 'pinFailed' : 'unpinFailed');
    }
  }, []);

  const handleCreateNote = useCallback(() => {
    rememberRouteTrigger();
    openResource(`/households/${encodeURIComponent(householdId!)}/notes/new`);
  }, [householdId, openResource]);

  const authorOf = (note: NoteResponseDto) => members === null ? null : members.get(note.createdBy) ?? t('formerMember');
  const activeLabel = view.labels.find(label => label.id === view.labelId);
  const searchField = <SearchField label={t('search')} placeholder={t('searchPlaceholder')} value={query} onChangeText={setQuery} />;
  const clearAll = () => { setQuery(''); setLabelFilter(ALL_LABELS); };

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
        <PageIntro title={t('navigation:pages.notes')} {...(notes.length > 0 ? { subtitle: t('summary', { count: notes.length }) } : {})} action={desktop ? searchField : null} />

        {!desktop && (notes.length > 0 || query !== '') && searchField}

        {loading && <LoadingState label={t('loading')} />}

        {error !== null && <LoadError message={t(error)} onRetry={() => void fetchData()} retryAccessibilityLabel={t('retryLoad')} />}

        {pinError !== null && <Banner>{t(pinError)}</Banner>}

        {!loading && error === null && notes.length === 0 && (
          <EmptyState title={t('emptyTitle')} message={t('emptyMessage')} />
        )}

        {view.labels.length > 0 && (
          <LabelFilter name={t('labelFilter')} allLabel={t('allLabels')} labels={view.labels} value={view.labelId}
            onChange={value => setLabelFilter(value ?? ALL_LABELS)} dense={dense} scroll={!desktop} />
        )}

        {!loading && error === null && notes.length > 0 && view.shown === 0 && (
          <EmptyState
            message={activeLabel ? t('emptyLabelSearch', { label: labelName(activeLabel), query: query.trim() }) : t('emptySearch', { query: query.trim() })}
            action={<Button label={t(activeLabel ? 'clearSearchAndFilter' : 'clearSearch')} tone="secondary" onPress={clearAll} />}
          />
        )}

        {view.groups.map(group => <Stack key={group.key} gap={desktop ? 0 : 2}>{group.key !== 'all' ? <GroupLabel flush>{t(group.key === 'pinned' ? 'pinnedGroup' : group.key)}</GroupLabel> : null}<ListGroup flush>
          {group.items.map(({ note, snippet }) => (
            <NoteCard key={note.id} note={note} snippet={snippet} author={authorOf(note)} selected={note.id === openNoteId} onPress={handleNotePress}
              onTogglePin={() => void togglePin(note)} onDelete={deleteNote(note)} />
          ))}
        </ListGroup></Stack>)}
      </Stack>
    </HouseholdScreen>
  );
}
