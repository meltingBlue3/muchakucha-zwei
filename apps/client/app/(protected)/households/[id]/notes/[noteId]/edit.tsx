import { useEditConflict, captureEditBaseline } from '../../../../../../src/ui/edit-conflict';
import { useWorkspaceStore } from '../../../../../../src/ui/workspace-state';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { NoteResponseDto, GetHouseholdMemberDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../../../../../../src/features/auth/session-runtime';
import { NoteForm } from '../../../../../../src/features/notes/note-form';
import { NoteWindow } from '../../../../../../src/features/notes/note-window';
import { Button, Spinner, Stack, Text } from '../../../../../../src/ui/primitives';
import type { Theme } from '../../../../../../src/ui/theme';
import type { CreateNoteDto } from '@muchakucha/api-client';

export default function EditNoteRoute() {
  const { id, noteId } = useLocalSearchParams<{ id: string; noteId: string }>();
  const workspace = useWorkspaceStore();
  const draftPrefix = `draft:${id}:notes:${noteId}:`;
  const router = useRouter();
  const exitAllowed = useRef(false);
  const [members, setMembers] = useState<GetHouseholdMemberDto[]>([]);
  const activeTheme = useTheme<Theme>();
  const [note, setNote] = useState<NoteResponseDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
        setError('登录已过期。');
        return;
      }
      const [result, household] = await Promise.all([sessionApiClient.getNote(token, id, noteId), sessionApiClient.getHousehold(token, id)]);
      setMembers(household.members);
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
          setError('登录已过期。');
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
      exitAllowed.current = true;
      router.dismissTo(`/households/${encodeURIComponent(id!)}/notes`);
    } catch {
      setError('删除失败，请重试。');
    } finally {
      setDeleting(false);
    }
  }, [id, noteId, router]);

  const actor = members.find(member => member.isCurrentUser);
  const canDelete = actor !== undefined && (actor.role === 'OWNER' || actor.role === 'ADMIN' || actor.userId === note?.createdBy);
  const close = () => {
    if (confirmDelete) setConfirmDelete(false);
    else router.dismissTo(`/households/${encodeURIComponent(id)}/notes/${encodeURIComponent(noteId)}`);
  };

  return (
    <NoteWindow title={confirmDelete ? '删除笔记' : '编辑笔记'} busy={isSubmitting || deleting} onClose={close} onBackStep={confirmDelete ? close : undefined} exitAllowed={exitAllowed}>
      {confirmDelete ? <Stack gap={3}>
        <Text>确定要删除这篇笔记吗？此操作不可撤销。</Text>
        {error ? <Text color="destructive" accessibilityRole="alert">{error}</Text> : null}
        <Button label="取消删除" tone="secondary" disabled={deleting} onPress={close} />
        <Button label="确认删除笔记" loading={deleting} onPress={() => void handleDelete()} />
      </Stack> : loading ? <Spinner label="正在加载笔记" /> : note === null ? <Stack gap={3}>
        <Text accessibilityRole="alert">{error ?? '笔记未找到或已被删除。'}</Text>
        <Button label="重试" tone="secondary" onPress={() => void fetchNote()} />
      </Stack> : <Stack gap={4}>
        {error ? <Text color="destructive" accessibilityRole="alert">{error}</Text> : null}
        {conflict.panel}
        <NoteForm draftKey={draftPrefix + 'form'} initial={note} onSubmit={handleSubmit} onCancel={close} submitLabel="保存" isSubmitting={isSubmitting} />
        {canDelete ? <Pressable accessibilityRole="button" accessibilityLabel="删除笔记" disabled={isSubmitting} onPress={() => setConfirmDelete(true)} style={{ minHeight: activeTheme.controlSizes.touchTarget, justifyContent: 'center', alignSelf: 'flex-start' }}><Text variant="label" color="destructive">删除笔记</Text></Pressable> : null}
      </Stack>}
    </NoteWindow>
  );
}
