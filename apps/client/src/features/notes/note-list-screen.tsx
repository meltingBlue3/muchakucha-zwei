import { FloatingCreateButton } from '../../ui/floating-create-button';
import { useContentDelete, useContentEdit } from '../content/use-content-delete';
import { rememberRouteTrigger } from '../../platform/overlays/route-trigger';
import { useWorkspaceState } from '../../ui/workspace-state';
import { PageIntro } from '../../ui/page-intro';
import { HouseholdNavigation } from '../../ui/household-navigation';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import type { NoteResponseDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../auth/session-runtime';
import { useHouseholdContext } from '../households/household-context';
import { NoteCard } from '../notes/note-card';
import { searchNotesByTitle } from '../notes/note-search';
import {
  AccessChangedPanel,
  AppShell,
  HouseholdHeader,
  HouseholdSwitcher,
} from '../../ui/household-components';
import { Button, EmptyState, LoadError, LoadingState, Stack, Text, TextField } from '../../ui/primitives';

export default function NotesListRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const deleteNote = useContentDelete('notes');
  const editNote = useContentEdit('notes');
  const {
    viewState,
    households,
    currentHouseholdId,
    accessChangedHouseholdName,
    refreshHouseholds,
    switchHousehold,
  } = useHouseholdContext();

  const [notes, setNotes] = useState<NoteResponseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [query, setQuery] = useWorkspaceState(`view:${id}:notes:query`, '');
  const loaded = useRef(false);

  const householdId = id ?? currentHouseholdId;
  const currentHousehold = households.find((h) => h.id === (id ?? currentHouseholdId)) ?? null;
  const visibleNotes = searchNotesByTitle(notes, query);

  const fetchData = useCallback(async () => {
    if (householdId === undefined || householdId === '') return;
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

  const handleSwitch = useCallback(async (householdId: string) => {
    if (householdId === (id ?? currentHouseholdId)) {
      setSwitcherOpen(false);
      return;
    }
    const success = await switchHousehold(householdId);
    if (success) {
      void router.replace(`/households/${encodeURIComponent(householdId)}/notes`);
    }
    setSwitcherOpen(false);
  }, [id, currentHouseholdId, switchHousehold, router]);

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

  if (viewState === 'accessChanged') {
    return (
      <AppShell accessibilityLabel="家庭访问权已变化">
        <AccessChangedPanel
          hasOtherHouseholds={households.length > 0}
          {...(accessChangedHouseholdName === undefined ? {} : { householdName: accessChangedHouseholdName })}
          onChooseOther={() => { void refreshHouseholds().then(() => router.replace('/households')); }}
          onCreateNew={() => { void router.replace('/household-handoff'); }}
        />
      </AppShell>
    );
  }

  if (householdId === undefined || householdId === '') {
    return (
      <AppShell accessibilityLabel="页面未找到">
        <Stack gap={4}>
          <Text>这个页面暂时无法访问。</Text>
        </Stack>
      </AppShell>
    );
  }

  return (
    <>
      <AppShell accessibilityLabel="家庭笔记" refreshing={refreshing} onRefresh={handleRefresh} title="家庭笔记" showProfile headerContent={<HouseholdHeader householdName={currentHousehold?.name ?? ''} onOpenSwitcher={() => setSwitcherOpen(true)} />} footer={<HouseholdNavigation householdId={householdId} active="notes" />} floatingAction={viewState === 'ready' ? <FloatingCreateButton label="创建笔记" onPress={handleCreateNote} /> : null}>
        <Stack gap={4}>

          <PageIntro title="笔记" />

          {(notes.length > 0 || query !== '') && (
            <TextField
              label="搜索笔记"
              placeholder="按标题搜索"
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
          )}

          {loading && <LoadingState label="正在加载笔记" />}

          {error !== null && <LoadError message={error} onRetry={() => void fetchData()} retryAccessibilityLabel="重试加载笔记" />}

          {!loading && error === null && notes.length === 0 && (
            <EmptyState message="还没有笔记。适合记采购清单、旅行计划、家电说明这类要一起查的事。" />
          )}

          {!loading && error === null && notes.length > 0 && visibleNotes.length === 0 && (
            <EmptyState message={`没有标题匹配「${query.trim()}」的笔记。`} action={<Button label="清除搜索" tone="secondary" onPress={() => setQuery('')} />} />
          )}

          {visibleNotes.map((note) => (
            <NoteCard key={note.id} note={note} onPress={handleNotePress} onEdit={editNote(note)} onDelete={deleteNote(note)} />
          ))}
        </Stack>
      </AppShell>

      <HouseholdSwitcher
        currentHouseholdId={id ?? currentHouseholdId}
        households={households}
        onCreateNew={() => {
          void router.push('/households/new');
          setSwitcherOpen(false);
        }}
        onClose={() => setSwitcherOpen(false)}
        onSelect={(hid) => { void handleSwitch(hid); }}
        visible={switcherOpen}
      />
    </>
  );
}
