import { useContentChanges } from '../content/content-changes';
import { useResourceNavigation } from '../../ui/use-resource-navigation';
import { useDesktop } from '../../ui/use-desktop';
import { MarkdownBody } from './markdown-body';
import { theme } from '../../ui/theme';
import { ScrollView, View } from 'react-native';
import { DetailEditButton } from '../../ui/detail-fields';
import { formatDateTime } from '../../ui/date-values';
import { useOpenWindowItem } from '../../ui/route-window';
import { FloatingCreateButton } from '../../ui/floating-create-button';
import { useContentDelete, useContentEdit } from '../content/use-content-delete';
import { rememberRouteTrigger } from '../../platform/overlays/route-trigger';
import { useWorkspaceState } from '../../ui/workspace-state';
import { PageIntro } from '../../ui/page-intro';
import { GroupLabel, ListGroup } from '../../ui/list-group';
import { SearchField } from '../../ui/search-field';
import { HouseholdScreen } from '../households/household-screen';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import type { NoteResponseDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../auth/session-runtime';
import { useHouseholdContext } from '../households/household-context';
import { NoteCard } from '../notes/note-card';
import { searchNotesByTitle } from '../notes/note-search';
import { Button, EmptyState, Heading, LoadError, LoadingState, Stack, Text } from '../../ui/primitives';

export default function NotesListRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const desktop = useDesktop();
  const openResource = useResourceNavigation();
  const openNoteId = useOpenWindowItem('noteId');
  const deleteNote = useContentDelete('notes');
  const editNote = useContentEdit('notes');
  const { currentHouseholdId } = useHouseholdContext();

  const [notes, setNotes] = useState<NoteResponseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useWorkspaceState(`view:${id}:notes:query`, '');
  const loadedHousehold = useRef<string | null>(null);
  const requestGeneration = useRef(0);

  const householdId = id ?? currentHouseholdId;
  const visibleNotes = searchNotesByTitle(notes, query);
  const groups = desktop ? [{ title: '最近 7 天', items: visibleNotes.filter(note => Date.now() - new Date(note.updatedAt).getTime() <= 7 * 86400000) }, { title: '更早', items: visibleNotes.filter(note => Date.now() - new Date(note.updatedAt).getTime() > 7 * 86400000) }] : [{ title: '', items: visibleNotes }];

  const fetchData = useCallback(async () => {
    if (householdId === undefined || householdId === null || householdId === '') return;
    const request = ++requestGeneration.current;
    if (loadedHousehold.current !== householdId) { setLoading(true); setNotes([]); }
    setError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (request !== requestGeneration.current) return;
      if (token === null) {
        setError('登录已过期，请重新登录。');
        return;
      }
      const result = await sessionApiClient.listNotes(token, householdId);
      if (request !== requestGeneration.current) return;
      setNotes(result.notes);
      loadedHousehold.current = householdId;
    } catch {
      if (request === requestGeneration.current) setError(loadedHousehold.current === householdId ? '刷新失败，仍显示上次的笔记。请检查网络后重试。' : '无法加载笔记，请检查网络连接后重试。');
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

  useContentChanges(householdId, fetchData);

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
      accessibilityLabel="家庭笔记"
      refreshing={refreshing}
      onRefresh={handleRefresh}
      width="reading"
      floatingAction={<FloatingCreateButton label="创建笔记" onPress={handleCreateNote} />}
      aside={desktop && !openNoteId && notes[0] ? <View style={{ flex: 1, minHeight: 0 }}>
        <View style={{ height: theme.layout.paneHeaderHeight, flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2], paddingLeft: theme.spacing[6], paddingRight: theme.spacing[3], borderBottomWidth: theme.borderWidths.default, borderBottomColor: theme.colors.separator }}>
          <Text variant="meta" color="inkFaint" numberOfLines={1} style={{ flex: 1, fontFamily: theme.fontFamilies.numeric }}>{`更新于 ${formatDateTime(new Date(notes[0].updatedAt))}`}</Text>
          <DetailEditButton accessibilityLabel="编辑最近的笔记" worded onPress={() => openResource(`/households/${encodeURIComponent(householdId!)}/notes/${encodeURIComponent(notes[0]!.id)}/edit`)} />
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: theme.spacing[5], paddingHorizontal: theme.spacing[6], width: '100%', maxWidth: theme.layout.readingWidth + theme.spacing[6] * 2, alignSelf: 'center', gap: theme.spacing[4] }}><Heading level={2} style={theme.typography.readingTitle}>{notes[0].title}</Heading><MarkdownBody source={notes[0].body ?? ''} /></ScrollView>
      </View> : null}
    >
      <Stack gap={5}>
        <PageIntro title="笔记" {...(notes.length > 0 ? { subtitle: `${notes.length} 篇，最近更新的在前` } : {})} action={desktop ? <SearchField label="搜索笔记" placeholder="按标题搜索" value={query} onChangeText={setQuery} /> : null} />

        {!desktop && (notes.length > 0 || query !== '') && (
          <SearchField label="搜索笔记" placeholder="按标题搜索" value={query} onChangeText={setQuery} />
        )}

        {loading && <LoadingState label="正在加载笔记" />}

        {error !== null && <LoadError message={error} onRetry={() => void fetchData()} retryAccessibilityLabel="重试加载笔记" />}

        {!loading && error === null && notes.length === 0 && (
          <EmptyState title="还没有笔记" message="适合记采购清单、旅行计划、家电说明这类要一起查的事。" />
        )}

        {!loading && error === null && notes.length > 0 && visibleNotes.length === 0 && (
          <EmptyState message={`没有标题匹配「${query.trim()}」的笔记。`} action={<Button label="清除搜索" tone="secondary" onPress={() => setQuery('')} />} />
        )}

        {groups.filter(group => group.items.length).map(group => <Stack key={group.title} gap={desktop ? 0 : 2}>{group.title ? <GroupLabel flush>{group.title}</GroupLabel> : null}<ListGroup flush>
          {group.items.map((note) => (
            <NoteCard key={note.id} note={note} selected={note.id === openNoteId || (desktop && !openNoteId && note.id === notes[0]?.id)} onPress={handleNotePress} onEdit={editNote(note)} onDelete={deleteNote(note)} />
          ))}
        </ListGroup></Stack>)}
      </Stack>
    </HouseholdScreen>
  );
}
