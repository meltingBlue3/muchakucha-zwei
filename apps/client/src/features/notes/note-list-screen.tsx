import { useOpenWindowItem } from '../../ui/route-window';
import { FloatingCreateButton } from '../../ui/floating-create-button';
import { useContentDelete, useContentEdit } from '../content/use-content-delete';
import { rememberRouteTrigger } from '../../platform/overlays/route-trigger';
import { useWorkspaceState } from '../../ui/workspace-state';
import { PageIntro } from '../../ui/page-intro';
import { ListGroup } from '../../ui/list-group';
import { SearchField } from '../../ui/search-field';
import { HouseholdScreen } from '../households/household-screen';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import type { NoteResponseDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../auth/session-runtime';
import { useHouseholdContext } from '../households/household-context';
import { NoteCard } from '../notes/note-card';
import { searchNotesByTitle } from '../notes/note-search';
import { Button, EmptyState, LoadError, LoadingState, Stack } from '../../ui/primitives';

export default function NotesListRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const openNoteId = useOpenWindowItem('noteId');
  const deleteNote = useContentDelete('notes');
  const editNote = useContentEdit('notes');
  const { currentHouseholdId } = useHouseholdContext();

  const [notes, setNotes] = useState<NoteResponseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useWorkspaceState(`view:${id}:notes:query`, '');
  const loaded = useRef(false);

  const householdId = id ?? currentHouseholdId;
  const visibleNotes = searchNotesByTitle(notes, query);

  const fetchData = useCallback(async () => {
    if (householdId === undefined || householdId === null || householdId === '') return;
    if (!loaded.current) setLoading(true);
    setError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setError('登录已过期，请重新登录。');
        return;
      }
      const result = await sessionApiClient.listNotes(token, householdId);
      setNotes(result.notes);
      loaded.current = true;
    } catch {
      setError(loaded.current ? '刷新失败，仍显示上次的笔记。请检查网络后重试。' : '无法加载笔记，请检查网络连接后重试。');
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  // Refetch whenever this screen regains focus (e.g. returning from
  // create/edit), not just on first mount — otherwise the list shows
  // stale data after a mutation elsewhere in the stack.
  useFocusEffect(
    useCallback(() => {
      void fetchData();
    }, [fetchData]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const handleNotePress = useCallback(
    (note: NoteResponseDto) => {
      rememberRouteTrigger();
      void router.push(
        `/households/${encodeURIComponent(householdId!)}/notes/${encodeURIComponent(note.id)}`,
      );
    },
    [router, householdId],
  );

  const handleCreateNote = useCallback(() => {
    rememberRouteTrigger();
    void router.push(`/households/${encodeURIComponent(householdId!)}/notes/new`);
  }, [router, householdId]);

  return (
    <HouseholdScreen
      active="notes"
      accessibilityLabel="家庭笔记"
      refreshing={refreshing}
      onRefresh={handleRefresh}
      width="reading"
      floatingAction={<FloatingCreateButton label="创建笔记" onPress={handleCreateNote} />}
    >
      <Stack gap={5}>
        <PageIntro title="笔记" {...(notes.length > 0 ? { subtitle: `${notes.length} 篇，最近更新的在前` } : {})} />

        {(notes.length > 0 || query !== '') && (
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

        <ListGroup>
          {visibleNotes.map((note) => (
            <NoteCard key={note.id} note={note} selected={note.id === openNoteId} onPress={handleNotePress} onEdit={editNote(note)} onDelete={deleteNote(note)} />
          ))}
        </ListGroup>
      </Stack>
    </HouseholdScreen>
  );
}
