import { useCreateWithLabels } from '../../../../../src/features/households/use-create-with-labels';
import { useWorkspaceStore, useWorkspaceState } from '../../../../../src/ui/workspace-state';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { sessionApiClient, sessionTransport } from '../../../../../src/features/auth/session-runtime';
import { EventForm } from '../../../../../src/features/events/event-form';
import { AppShell } from '../../../../../src/ui/household-components';
import { Button, Stack, Text } from '../../../../../src/ui/primitives';
import type { CreateEventDto } from '@muchakucha/api-client';

export default function CreateEventRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const workspace = useWorkspaceStore();
  const draftPrefix = `draft:${id}:events:new:`;
  const router = useRouter();
  const [selectedLabelIds, setSelectedLabelIds] = useWorkspaceState<string[]>(draftPrefix + 'labels', []);

  const { submit, retry, created, pending: isSubmitting, error: error } = useCreateWithLabels<CreateEventDto>({
    key: draftPrefix + 'created',
    create: async (data) => {
      const token = sessionTransport.getAccessToken();
      if (token === null) throw new Error('Session expired');
      return sessionApiClient.createEvent(token, id!, data);
    },
    tag: async (resourceId, labelIds) => {
      const token = sessionTransport.getAccessToken();
      if (token === null) throw new Error('Session expired');
      return sessionApiClient.tagEvent(token, id!, resourceId, { labelIds });
    },
    onComplete: () => { workspace.clear(draftPrefix); router.back(); },
  });
  const handleSubmit = (data: CreateEventDto) => submit(data, selectedLabelIds);

  return (
    <AppShell accessibilityLabel="创建事件" title="创建事件" showBack showProfile>

        <Stack gap={4}>
          <Text variant="heading">创建事件</Text>
          {error !== null && (
            <Text variant="bodySm" color="destructive">
              {error}
            </Text>
          )}
          {created !== null ? <Stack gap={4}><Text>日程已创建</Text><Button label="重试保存标签" loading={isSubmitting} onPress={() => void retry()} /></Stack> : <EventForm
            draftKey={draftPrefix + 'form'}
            onSubmit={handleSubmit}
            onCancel={() => router.back()}
            submitLabel="创建"
            isSubmitting={isSubmitting}
            householdId={id}
            selectedLabelIds={selectedLabelIds}
            onLabelChange={setSelectedLabelIds}
          />}
        </Stack>

    </AppShell>
  );
}
