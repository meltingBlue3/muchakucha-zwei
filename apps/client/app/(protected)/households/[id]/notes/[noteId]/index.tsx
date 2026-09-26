import { MarkdownBody } from '../../../../../../src/features/notes/markdown-body';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import type { NoteResponseDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../../../../../../src/features/auth/session-runtime';
import { NoteWindow } from '../../../../../../src/features/notes/note-window';
import { rememberRouteTrigger } from '../../../../../../src/platform/overlays/route-trigger';
import { Button, Heading, Spinner, Stack, Text } from '../../../../../../src/ui/primitives';

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${date} ${time}`;
}

export default function NoteDetailRoute() {
  const { id, noteId } = useLocalSearchParams<{ id: string; noteId: string }>();
  const router = useRouter();
  const [note, setNote] = useState<NoteResponseDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNote = useCallback(async () => {
    if (id === undefined || noteId === undefined) return;
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
    rememberRouteTrigger();
    void router.push(`/households/${encodeURIComponent(id)}/notes/${encodeURIComponent(noteId)}/edit`);
  }, [router, id, noteId]);

  if (loading || note === null || error !== null) {
    return <NoteWindow title="笔记详情"><Stack gap={3}>
      {loading ? <Spinner label="正在加载笔记" /> : <>
        <Text accessibilityRole="alert">{error ?? '笔记未找到或已被删除。'}</Text>
        <Button label="重试" tone="secondary" onPress={() => void fetchNote()} />
      </>}
    </Stack></NoteWindow>;
  }

  const body = note.body ?? '';

  return (
    <NoteWindow title="笔记详情" footer={<Button label="编辑笔记" onPress={handleEdit} />}>
      <Stack gap={4}>
        <Heading>{note.title}</Heading>
        <Text variant="caption" color="inkMuted">最后更新于 {formatDateTime(note.updatedAt)}</Text>
        <MarkdownBody source={body} />
      </Stack>
    </NoteWindow>
  );
}
