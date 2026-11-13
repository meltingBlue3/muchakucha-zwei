import { useTranslation } from '../../../../../src/i18n';
import { notifyContentChanged } from '../../../../../src/features/content/content-changes';
import { useWorkspaceStore } from '../../../../../src/ui/workspace-state';
import { useLocalSearchParams } from 'expo-router';
import { useHouseholdContext } from '../../../../../src/features/households/household-context';
import { HouseholdContextNote } from '../../../../../src/ui/household-components';
import { useCallback, useRef, useState } from 'react';

import { sessionApiClient, sessionTransport } from '../../../../../src/features/auth/session-runtime';
import { NoteForm } from '../../../../../src/features/notes/note-form';
import { noteEditorViewport } from '../../../../../src/features/notes/note-editor-chrome';
import { NoteWindow, useNoteWindowClose } from '../../../../../src/features/notes/note-window';
import { Banner, Stack } from '../../../../../src/ui/primitives';
import type { CreateNoteDto } from '@muchakucha/api-client';

export default function CreateNoteRoute() {
  const { t } = useTranslation(['notes', 'auth', 'shared']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { households } = useHouseholdContext();
  const householdName = households.find(household => household.id === id)?.name ?? '';
  const workspace = useWorkspaceStore();
  const draftPrefix = `draft:${id}:notes:new:`;
  const { close } = useNoteWindowClose();
  const exitAllowed = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<'auth:errors.sessionExpired' | 'createError' | null>(null);

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
        await sessionApiClient.createNote(token, id!, data);
        workspace.clear(draftPrefix);
        notifyContentChanged(id);
        exitAllowed.current = true;
        close();
      } catch {
        setError('createError');
      } finally {
        setIsSubmitting(false);
      }
    },
    [id, close, workspace, draftPrefix],
  );

  return (
    <NoteWindow draftPrefix={draftPrefix} title={t('create')} busy={isSubmitting} exitAllowed={exitAllowed}>
      <Stack gap={4} style={noteEditorViewport}>
        <HouseholdContextNote householdName={householdName} />
        {error !== null ? <Banner>{t(error)}</Banner> : null}
        <NoteForm
          draftKey={draftPrefix + 'form'}
          onSubmit={handleSubmit}
          onCancel={close}
          submitLabel={t('shared:create')}
          isSubmitting={isSubmitting}
        />
      </Stack>
    </NoteWindow>
  );
}
