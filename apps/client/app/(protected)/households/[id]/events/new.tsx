import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { sessionApiClient, sessionTransport } from '../../../../../src/features/auth/session-runtime';
import { EventForm } from '../../../../../src/features/events/event-form';
import { AppShell } from '../../../../../src/ui/household-components';
import { Screen, Stack, Text } from '../../../../../src/ui/primitives';
import type { CreateEventDto } from '@muchakucha/api-client';

export default function CreateEventRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);

  const handleSubmit = useCallback(
    async (data: CreateEventDto) => {
      setIsSubmitting(true);
      setError(null);
      try {
        const token = await sessionTransport.getAccessToken();
        if (token === null) {
          setError('登录已过期，请重新登录。');
          return;
        }
        const event = await sessionApiClient.createEvent(token, id!, data);
        // Tag the new event with selected labels
        if (selectedLabelIds.length > 0) {
          await sessionApiClient.tagEvent(token, id!, event.id, { labelIds: selectedLabelIds });
        }
        router.back();
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : '创建事件失败，请重试。';
        setError(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [id, router, selectedLabelIds],
  );

  const handleCancel = useCallback(() => {
    router.back();
  }, [router]);

  return (
    <AppShell accessibilityLabel="创建事件" title="创建事件" showBack showProfile>
      <Screen>
        <Stack gap={4}>
          <Text variant="heading">创建事件</Text>
          {error !== null && (
            <Text variant="bodySm" color="destructive">
              {error}
            </Text>
          )}
          <EventForm
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            submitLabel="创建"
            isSubmitting={isSubmitting}
            householdId={id}
            selectedLabelIds={selectedLabelIds}
            onLabelChange={setSelectedLabelIds}
          />
        </Stack>
      </Screen>
    </AppShell>
  );
}
