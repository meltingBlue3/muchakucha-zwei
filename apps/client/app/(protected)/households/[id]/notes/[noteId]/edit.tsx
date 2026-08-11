import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { NoteResponseDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../../../../../../src/features/auth/session-runtime';
import { NoteForm } from '../../../../../../src/features/notes/note-form';
import { AppShell } from '../../../../../../src/ui/household-components';
import { Stack, Text } from '../../../../../../src/ui/primitives';
import type { Theme } from '../../../../../../src/ui/theme';
import type { CreateNoteDto } from '@muchakucha/api-client';

export default function EditNoteRoute() {
  const { id, noteId } = useLocalSearchParams<{ id: string; noteId: string }>();
  const router = useRouter();
  const activeTheme = useTheme<Theme>();
  const [note, setNote] = useState<NoteResponseDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fetchNote = useCallback(async () => {
    if (id === undefined || noteId === undefined) return;
    setLoading(true);
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

  useEffect(() => {
    void fetchNote();
  }, [fetchNote]);

  const handleSubmit = useCallback(
    async (data: CreateNoteDto) => {
      setIsSubmitting(true);
      setError(null);
      try {
        const token = await sessionTransport.getAccessToken();
        if (token === null) {
          setError('登录已过期。');
          return;
        }
        await sessionApiClient.updateNote(token, id!, noteId!, data as any);
        router.back();
      } catch {
        setError('保存失败，请重试。');
      } finally {
        setIsSubmitting(false);
      }
    },
    [id, noteId, router],
  );

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    setError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setError('登录已过期。');
        return;
      }
      await sessionApiClient.deleteNote(token, id!, noteId!);
      // Go straight back to the note list, not router.back() — a single
      // pop would land on the now-deleted note's detail screen.
      router.dismissTo(`/households/${encodeURIComponent(id!)}/notes`);
    } catch {
      setError('删除失败，请重试。');
    } finally {
      setDeleting(false);
    }
  }, [id, noteId, router]);

  if (loading) {
    return (
      <AppShell accessibilityLabel="加载笔记中" title="编辑笔记" showBack showProfile>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: activeTheme.spacing[12] }}>
          <ActivityIndicator color={activeTheme.colors.coral} />
        </View>
      </AppShell>
    );
  }

  if (note === null || error !== null) {
    return (
      <AppShell accessibilityLabel="笔记加载失败" title="编辑笔记" showBack showProfile>
        <Stack gap={4}>
          <Text variant="heading">笔记</Text>
          <Text>{error ?? '笔记未找到。'}</Text>
          <Pressable onPress={() => router.back()} hitSlop={activeTheme.spacing[4]}>
            <Text variant="label" color="coral">
              返回笔记列表
            </Text>
          </Pressable>
        </Stack>
      </AppShell>
    );
  }

  return (
    <AppShell accessibilityLabel="编辑笔记" title="编辑笔记" showBack showProfile>
      <Stack gap={4}>
        <Text variant="heading">编辑笔记</Text>
        {error !== null && (
          <Text variant="bodySm" color="destructive">
            {error}
          </Text>
        )}
        <NoteForm
          initial={note}
          onSubmit={handleSubmit}
          onCancel={() => router.back()}
          submitLabel="保存"
          isSubmitting={isSubmitting}
        />

        {/* Delete section */}
        <View style={{ marginTop: activeTheme.spacing[4], borderTopWidth: 1, borderTopColor: activeTheme.colors.border, paddingTop: activeTheme.spacing[4] }}>
          {!confirmDelete ? (
            <Pressable
              onPress={() => setConfirmDelete(true)}
              hitSlop={activeTheme.spacing[1]}
              style={({ pressed }) => ({
                alignItems: 'center',
                paddingVertical: activeTheme.spacing[3],
                borderRadius: activeTheme.borderRadii.sm,
                borderWidth: 1,
                borderColor: activeTheme.colors.destructive,
                opacity: pressed ? 0.7 : 1,
              })}
              accessibilityLabel="删除笔记"
            >
              <Text variant="button" color="destructive">
                删除笔记
              </Text>
            </Pressable>
          ) : (
            <Stack gap={3}>
              <Text variant="bodySm" color="destructive">
                确定要删除这个笔记吗？此操作不可撤销。
              </Text>
              <View style={{ flexDirection: 'row', gap: activeTheme.spacing[3] }}>
                <Pressable
                  onPress={() => setConfirmDelete(false)}
                  disabled={deleting}
                  hitSlop={activeTheme.spacing[1]}
                  style={({ pressed }) => ({
                    flex: 1,
                    alignItems: 'center',
                    paddingVertical: activeTheme.spacing[3],
                    borderRadius: activeTheme.borderRadii.sm,
                    borderWidth: 1,
                    borderColor: activeTheme.colors.border,
                    opacity: pressed ? 0.7 : 1,
                  })}
                  accessibilityLabel="取消删除"
                >
                  <Text variant="button" color="ink">取消</Text>
                </Pressable>
                <Pressable
                  onPress={handleDelete}
                  disabled={deleting}
                  hitSlop={activeTheme.spacing[1]}
                  style={({ pressed }) => ({
                    flex: 1,
                    alignItems: 'center',
                    paddingVertical: activeTheme.spacing[3],
                    borderRadius: activeTheme.borderRadii.sm,
                    backgroundColor: deleting ? activeTheme.colors.disabled : activeTheme.colors.destructive,
                    opacity: pressed ? 0.7 : 1,
                  })}
                  accessibilityLabel="确认删除笔记"
                >
                  <Text variant="button" color="surface">
                    {deleting ? '删除中…' : '确认删除'}
                  </Text>
                </Pressable>
              </View>
            </Stack>
          )}
        </View>
      </Stack>
    </AppShell>
  );
}
