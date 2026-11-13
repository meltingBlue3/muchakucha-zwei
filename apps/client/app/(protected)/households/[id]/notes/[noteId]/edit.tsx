import { useTranslation } from '../../../../../../src/i18n';
import { notifyContentChanged } from '../../../../../../src/features/content/content-changes';
import { useHouseholdContext } from '../../../../../../src/features/households/household-context';
import { HouseholdContextNote } from '../../../../../../src/ui/household-components';
import { useEditWindowExit } from '../../../../../../src/ui/route-window';
import { useEditConflict, captureEditBaseline } from '../../../../../../src/ui/edit-conflict';
import { useWorkspaceStore } from '../../../../../../src/ui/workspace-state';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NoteResponseDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../../../../../../src/features/auth/session-runtime';
import { NoteForm } from '../../../../../../src/features/notes/note-form';
import { noteEditorViewport } from '../../../../../../src/features/notes/note-editor-chrome';
import { NoteWindow } from '../../../../../../src/features/notes/note-window';
import { Banner, LoadError, LoadingState, Stack } from '../../../../../../src/ui/primitives';
import type { CreateNoteDto } from '@muchakucha/api-client';

export default function EditNoteRoute() {
  const { t } = useTranslation(['notes', 'auth', 'common', 'tasks']);
  const { id, noteId } = useLocalSearchParams<{ id: string; noteId: string }>();
  const { households } = useHouseholdContext();
  const householdName = households.find(household => household.id === id)?.name ?? '';
  const workspace = useWorkspaceStore();
  const draftPrefix = `draft:${id}:notes:${noteId}:`;
  const router = useRouter();
  const exitEdit = useEditWindowExit('notes', noteId);
  const exitAllowed = useRef(false);
  const [note, setNote] = useState<NoteResponseDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<'auth:errors.sessionExpired' | 'loadError' | 'tasks:saveRetry' | null>(null);

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
        setError('auth:errors.sessionExpired');
        return;
      }
      const result = await sessionApiClient.getNote(token, id, noteId);
      captureEditBaseline(workspace, draftPrefix, result);
      setNote(result);
    } catch {
      setError('loadError');
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
          setError('auth:errors.sessionExpired');
          return;
        }
        await sessionApiClient.updateNote(token, id!, noteId!, { ...data, expectedUpdatedAt: conflict.precondition.expectedUpdatedAt });
        workspace.clear(draftPrefix);
        notifyContentChanged(id);
        exitAllowed.current = true;
        exitEdit();
      } catch (caught: unknown) {
        if (!conflict.handle(caught)) setError('tasks:saveRetry');
      } finally {
        setIsSubmitting(false);
      }
    },
    [id, noteId, router, workspace, draftPrefix, conflict, exitEdit],
  );

  const close = () => {
    exitEdit();
  };

  return (
    <NoteWindow draftPrefix={draftPrefix} title={t('edit')} busy={isSubmitting} onClose={close} exitAllowed={exitAllowed}>
      {loading ? <LoadingState label={t('loading')} /> : note === null ? <Stack gap={3}>
        <LoadError message={t(error ?? 'notFound')} onRetry={() => void fetchNote()} />
      </Stack> : <Stack gap={4} style={noteEditorViewport}>
        <HouseholdContextNote householdName={householdName} />
        {error ? <Banner>{t(error)}</Banner> : null}
        {conflict.panel}
        <NoteForm draftKey={draftPrefix + 'form'} initial={note} onSubmit={handleSubmit} onCancel={close} submitLabel={t('common:save')} isSubmitting={isSubmitting} />
      </Stack>}
    </NoteWindow>
  );
}
