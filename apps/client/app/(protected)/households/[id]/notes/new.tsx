import { useWorkspaceStore } from '../../../../../src/ui/workspace-state';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { sessionApiClient, sessionTransport } from '../../../../../src/features/auth/session-runtime';
import { NoteForm } from '../../../../../src/features/notes/note-form';
import { NoteWindow, useNoteWindowClose } from '../../../../../src/features/notes/note-window';
import { Stack, Text } from '../../../../../src/ui/primitives';
import type { CreateNoteDto } from '@muchakucha/api-client';

export default function CreateNoteRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const workspace = useWorkspaceStore();
  const draftPrefix = `draft:${id}:notes:new:`;
  const { close } = useNoteWindowClose();
  const exitAllowed = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        await sessionApiClient.createNote(token, id!, data);
        workspace.clear(draftPrefix);
        exitAllowed.current = true;
        close();
      } catch {
        setError('创建笔记失败，请重试。');
      } finally {
        setIsSubmitting(false);
      }
    },
    [id, close, workspace, draftPrefix],
  );

  return (
    <NoteWindow title="创建笔记" busy={isSubmitting} exitAllowed={exitAllowed}>
      <Stack gap={4}>
        {error !== null && (
          <Text variant="bodySm" color="destructive">
            {error}
          </Text>
        )}
        <NoteForm
          draftKey={draftPrefix + 'form'}
          onSubmit={handleSubmit}
          onCancel={close}
          submitLabel="创建"
          isSubmitting={isSubmitting}
        />
      </Stack>
    </NoteWindow>
  );
}
