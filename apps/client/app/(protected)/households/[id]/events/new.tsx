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
        await sessionApiClient.createEvent(token, id!, data);
        router.back();
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : '创建事件失败，请重试。';
        setError(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [id, router],
  );

  const handleCancel = useCallback(() => {
    router.back();
  }, [router]);

  return (
    <AppShell accessibilityLabel="创建事件">
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
          />
        </Stack>
      </Screen>
    </AppShell>
  );
}
