import { useWorkspaceStore } from '../../../../../src/ui/workspace-state';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { sessionApiClient, sessionTransport } from '../../../../../src/features/auth/session-runtime';
import { NoteForm } from '../../../../../src/features/notes/note-form';
import { AppShell } from '../../../../../src/ui/household-components';
import { Stack, Text } from '../../../../../src/ui/primitives';
import type { CreateNoteDto } from '@muchakucha/api-client';

export default function CreateNoteRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const workspace = useWorkspaceStore();
  const draftPrefix = `draft:${id}:notes:new:`;
  const router = useRouter();
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
        router.back();
      } catch {
        setError('创建笔记失败，请重试。');
      } finally {
        setIsSubmitting(false);
      }
    },
    [id, router, workspace, draftPrefix],
  );

  return (
    <AppShell accessibilityLabel="创建笔记" title="创建笔记" showBack showProfile>
      <Stack gap={4}>
        <Text variant="heading">创建笔记</Text>
        {error !== null && (
          <Text variant="bodySm" color="destructive">
            {error}
          </Text>
        )}
        <NoteForm
          draftKey={draftPrefix + 'form'}
          onSubmit={handleSubmit}
          onCancel={() => router.back()}
          submitLabel="创建"
          isSubmitting={isSubmitting}
        />
      </Stack>
    </AppShell>
  );
}
