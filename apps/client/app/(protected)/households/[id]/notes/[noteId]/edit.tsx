import { useEditConflict, captureEditBaseline } from '../../../../../../src/ui/edit-conflict';
import { useWorkspaceStore } from '../../../../../../src/ui/workspace-state';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NoteResponseDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../../../../../../src/features/auth/session-runtime';
import { NoteForm } from '../../../../../../src/features/notes/note-form';
import { NoteWindow } from '../../../../../../src/features/notes/note-window';
import { Banner, LoadError, LoadingState, Stack } from '../../../../../../src/ui/primitives';
import type { CreateNoteDto } from '@muchakucha/api-client';

export default function EditNoteRoute() {
  const { id, noteId } = useLocalSearchParams<{ id: string; noteId: string }>();
  const workspace = useWorkspaceStore();
  const draftPrefix = `draft:${id}:notes:${noteId}:`;
  const router = useRouter();
  const exitAllowed = useRef(false);
  const [note, setNote] = useState<NoteResponseDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const conflict = useEditConflict(draftPrefix, note, async () => {
    const token = await sessionTransport.getAccessToken();
    if (token === null) throw new Error('Session expired');
    return sessionApiClient.getNote(token, id!, noteId!);
  }, setNote);

  const fetchNote = useCallback(async () => {
    if (id === undefined || noteId === undefined) return;
    setLoading(true);
    setError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setError('登录已过期，请重新登录。');
        return;
      }
      const result = await sessionApiClient.getNote(token, id, noteId);
      captureEditBaseline(workspace, draftPrefix, result);
      setNote(result);
    } catch {
      setError('无法加载笔记。');
    } finally {
      setLoading(false);
    }
  }, [id, noteId, workspace, draftPrefix]);

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
          setError('登录已过期，请重新登录。');
          return;
        }
        await sessionApiClient.updateNote(token, id!, noteId!, { ...data, expectedUpdatedAt: conflict.precondition.expectedUpdatedAt });
        workspace.clear(draftPrefix);
        exitAllowed.current = true;
        router.dismissTo(`/households/${encodeURIComponent(id!)}/notes/${encodeURIComponent(noteId!)}`);
      } catch (caught: unknown) {
        if (!conflict.handle(caught)) setError('保存失败，请重试。');
      } finally {
        setIsSubmitting(false);
      }
    },
    [id, noteId, router, workspace, draftPrefix, conflict],
  );

  const close = () => {
    router.dismissTo(`/households/${encodeURIComponent(id)}/notes/${encodeURIComponent(noteId)}`);
  };

  return (
    <NoteWindow title="编辑笔记" busy={isSubmitting} onClose={close} exitAllowed={exitAllowed}>
      {loading ? <LoadingState label="正在加载笔记" /> : note === null ? <Stack gap={3}>
        <LoadError message={error ?? '笔记未找到或已被删除。'} onRetry={() => void fetchNote()} />
      </Stack> : <Stack gap={4}>
        {error ? <Banner>{error}</Banner> : null}
        {conflict.panel}
        <NoteForm draftKey={draftPrefix + 'form'} initial={note} onSubmit={handleSubmit} onCancel={close} submitLabel="保存" isSubmitting={isSubmitting} />
      </Stack>}
    </NoteWindow>
  );
}
