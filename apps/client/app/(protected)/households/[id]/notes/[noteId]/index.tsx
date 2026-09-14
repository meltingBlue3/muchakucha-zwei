import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { NoteResponseDto } from '@muchakucha/api-client';
import Pencil from 'lucide-react-native/icons/pencil';

import { sessionApiClient, sessionTransport } from '../../../../../../src/features/auth/session-runtime';
import { AppShell } from '../../../../../../src/ui/household-components';
import { Heading, Stack, Text } from '../../../../../../src/ui/primitives';
import type { Theme } from '../../../../../../src/ui/theme';

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${date} ${time}`;
}

export default function NoteDetailRoute() {
  const { id, noteId } = useLocalSearchParams<{ id: string; noteId: string }>();
  const router = useRouter();
  const activeTheme = useTheme<Theme>();
  const [note, setNote] = useState<NoteResponseDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNote = useCallback(async () => {
    if (id === undefined || noteId === undefined) return;
    setLoading(true);
    setError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setError('登录已过期。');
        return;
      }
      const result = await sessionApiClient.getNote(token, id, noteId);
      setNote(result);
    } catch {
      setError('无法加载笔记。');
    } finally {
      setLoading(false);
    }
  }, [id, noteId]);

  // Refetch whenever this screen regains focus (e.g. returning from the
  // edit screen), not just on first mount — otherwise a save doesn't show
  // up here until the whole route remounts.
  useFocusEffect(
    useCallback(() => {
      void fetchNote();
    }, [fetchNote]),
  );

  const handleEdit = useCallback(() => {
    void router.push(`/households/${encodeURIComponent(id)}/notes/${encodeURIComponent(noteId)}/edit`);
  }, [router, id, noteId]);

  if (loading) {
    return (
      <AppShell accessibilityLabel="加载笔记中" title="笔记详情" showBack showProfile>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: activeTheme.spacing[12] }}>
          <ActivityIndicator color={activeTheme.colors.coral} />
        </View>
      </AppShell>
    );
  }

  if (note === null || error !== null) {
    return (
      <AppShell accessibilityLabel="笔记加载失败" title="笔记详情" showBack showProfile>
        <Stack gap={4}>
          <Text>{error ?? '笔记未找到。'}</Text>
          <Pressable onPress={() => router.back()} hitSlop={activeTheme.spacing[4]}>
            <Text variant="label" color="coral">返回笔记列表</Text>
          </Pressable>
        </Stack>
      </AppShell>
    );
  }

  const body = (note.body ?? '').trim();

  return (
    <AppShell accessibilityLabel="笔记详情" title="笔记详情" showBack showProfile>
      <Stack gap={6} style={{ backgroundColor: activeTheme.colors.surface, borderRadius: activeTheme.borderRadii.xl, padding: activeTheme.spacing[5] }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: activeTheme.spacing[3] }}>
          <Heading style={{ flex: 1 }}>{note.title}</Heading>
          <Pressable
            onPress={handleEdit}
            accessibilityLabel="编辑笔记"
            accessibilityRole="button"
            hitSlop={activeTheme.spacing[2]}
            style={({ pressed }) => ({
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: activeTheme.controlSizes.touchTarget,
              minWidth: activeTheme.controlSizes.touchTarget,
              borderRadius: activeTheme.borderRadii.md,
              backgroundColor: pressed ? activeTheme.colors.surfaceMuted : 'transparent',
            })}
          >
            <Pencil
              size={activeTheme.controlSizes.icon}
              color={activeTheme.colors.coral}
              strokeWidth={activeTheme.controlSizes.iconStroke}
            />
          </Pressable>
        </View>

        <Text variant="caption" color="inkMuted">
          最后更新于 {formatDateTime(note.updatedAt)}
        </Text>

        {body !== '' ? (
          <Text variant="body">{body}</Text>
        ) : (
          <Text variant="bodySm" color="inkMuted">这篇笔记还没有内容。</Text>
        )}
      </Stack>
    </AppShell>
  );
}
