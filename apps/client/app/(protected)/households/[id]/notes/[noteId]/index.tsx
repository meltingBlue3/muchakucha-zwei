import { MarkdownBody } from '../../../../../../src/features/notes/markdown-body';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import type { NoteResponseDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../../../../../../src/features/auth/session-runtime';
import { NoteWindow } from '../../../../../../src/features/notes/note-window';
import { formatDateTime } from '../../../../../../src/ui/date-values';
import { rememberRouteTrigger } from '../../../../../../src/platform/overlays/route-trigger';
import { Button, Heading, LoadError, LoadingState, Stack, Text } from '../../../../../../src/ui/primitives';

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
        setError('登录已过期，请重新登录。');
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
      {loading ? <LoadingState label="正在加载笔记" /> : <>
        <LoadError message={error ?? '笔记未找到或已被删除。'} onRetry={() => void fetchNote()} />
      </>}
    </Stack></NoteWindow>;
  }

  const body = note.body ?? '';

  return (
    <NoteWindow title="笔记详情" headerActions={<Button label="编辑" accessibilityLabel="编辑笔记" tone="secondary" size="compact" onPress={handleEdit} />}>
      <Stack gap={4}>
        <Heading level={2}>{note.title}</Heading>
        <Text variant="caption" color="inkMuted">最后更新于 {formatDateTime(new Date(note.updatedAt))}</Text>
        <MarkdownBody source={body} />
      </Stack>
    </NoteWindow>
  );
}
