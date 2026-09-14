import { PageIntro } from '../../../../../src/ui/page-intro';
import { HouseholdNavigation } from '../../../../../src/ui/household-navigation';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { NoteResponseDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../../../../../src/features/auth/session-runtime';
import { useHouseholdContext } from '../../../../../src/features/households/household-context';
import { NoteCard } from '../../../../../src/features/notes/note-card';
import {
  AccessChangedPanel,
  AppShell,
  HouseholdHeader,
  HouseholdSwitcher,
} from '../../../../../src/ui/household-components';
import { Stack, Text } from '../../../../../src/ui/primitives';
import type { Theme } from '../../../../../src/ui/theme';

export default function NotesListRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const activeTheme = useTheme<Theme>();
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

  const householdId = id ?? currentHouseholdId;
  const currentHousehold = households.find((h) => h.id === (id ?? currentHouseholdId)) ?? null;

  const fetchData = useCallback(async () => {
    if (householdId === undefined || householdId === '') return;
    setLoading(true);
    setError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setError('登录已过期，请重新登录。');
        return;
      }
      const result = await sessionApiClient.listNotes(token, householdId);
      setNotes(result.notes);
    } catch {
      setError('无法加载笔记，请检查网络连接后重试。');
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
      void router.push(
        `/households/${encodeURIComponent(householdId!)}/notes/${encodeURIComponent(note.id)}`,
      );
    },
    [router, householdId],
  );

  const handleCreateNote = useCallback(() => {
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
      <AppShell accessibilityLabel="家庭笔记" refreshing={refreshing} onRefresh={handleRefresh} title="家庭笔记" showProfile footer={<HouseholdNavigation householdId={householdId} active="notes" />}>
        <Stack gap={4}>
          <PageIntro title="笔记" subtitle="随手记下，把一家人的记忆留在这里。" />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <HouseholdHeader
              householdName={currentHousehold?.name ?? ''}
              onOpenSwitcher={() => setSwitcherOpen(true)}
            />
            <Pressable
              onPress={handleCreateNote}
              accessibilityLabel="创建笔记"
              hitSlop={activeTheme.spacing[2]}
              style={({ pressed }) => ({
                backgroundColor: activeTheme.colors.coral,
              minHeight: activeTheme.controlSizes.touchTarget,
              justifyContent: 'center',
                paddingHorizontal: activeTheme.spacing[4],
                paddingVertical: activeTheme.spacing[2],
                borderRadius: activeTheme.borderRadii.full,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text variant="button" color="surface">
                + 新建
              </Text>
            </Pressable>
          </View>

          {loading && (
            <View style={{ alignItems: 'center', paddingVertical: activeTheme.spacing[6] }}>
              <ActivityIndicator color={activeTheme.colors.coral} />
            </View>
          )}

          {error !== null && (
            <View style={{
              backgroundColor: activeTheme.colors.destructiveSoft,
              padding: activeTheme.spacing[4],
              borderRadius: activeTheme.borderRadii.md,
            }}>
              <Text variant="bodySm" color="destructive">{error}</Text>
              <Pressable
                onPress={() => void fetchData()}
                hitSlop={activeTheme.spacing[3]}
                accessibilityLabel="重试加载笔记"
                style={{ marginTop: activeTheme.spacing[2], alignSelf: 'flex-start' }}
              >
                <Text variant="label" color="coral">重试</Text>
              </Pressable>
            </View>
          )}

          {!loading && error === null && notes.length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: activeTheme.spacing[8] }}>
              <Text variant="bodySm" color="inkMuted">
                还没有笔记。点击上方按钮创建第一篇笔记。
              </Text>
            </View>
          )}

          {notes.map((note) => (
            <NoteCard key={note.id} note={note} onPress={handleNotePress} />
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
