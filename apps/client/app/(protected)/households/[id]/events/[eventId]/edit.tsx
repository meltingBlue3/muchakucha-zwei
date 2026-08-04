import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { CreateEventDto, EventResponseDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../../../../../../src/features/auth/session-runtime';
import { EventForm } from '../../../../../../src/features/events/event-form';
import { AppShell } from '../../../../../../src/ui/household-components';
import { Screen, Stack, Text } from '../../../../../../src/ui/primitives';
import type { Theme } from '../../../../../../src/ui/theme';

export default function EditEventRoute() {
  const { id, eventId } = useLocalSearchParams<{ id: string; eventId: string }>();
  const router = useRouter();
  const activeTheme = useTheme<Theme>();
  const [event, setEvent] = useState<EventResponseDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchEvent = useCallback(async () => {
    if (id === undefined || eventId === undefined) return;
    setLoading(true);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setError('登录已过期。');
        return;
      }
      const result = await sessionApiClient.getEvent(token, id, eventId);
      setEvent(result);
    } catch {
      setError('无法加载事件。');
    } finally {
      setLoading(false);
    }
  }, [id, eventId]);

  useEffect(() => {
    void fetchEvent();
  }, [fetchEvent]);

  const handleSubmit = useCallback(
    async (data: CreateEventDto) => {
      setIsSubmitting(true);
      setError(null);
      try {
        const token = await sessionTransport.getAccessToken();
        if (token === null) {
          setError('登录已过期。');
          return;
        }
        await sessionApiClient.updateEvent(token, id!, eventId!, data as any);
        router.back();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : '保存失败，请重试。';
        setError(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [id, eventId, router],
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
      await sessionApiClient.deleteEvent(token, id!, eventId!);
      router.back();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '删除失败，请重试。';
      setError(message);
    } finally {
      setDeleting(false);
    }
  }, [id, eventId, router]);

  const handleCancel = useCallback(() => {
    router.back();
  }, [router]);

  if (loading) {
    return (
      <AppShell accessibilityLabel="加载事件中">
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: activeTheme.spacing[12] }}>
          <ActivityIndicator color={activeTheme.colors.coral} />
        </View>
      </AppShell>
    );
  }

  if (event === null || error !== null) {
    return (
      <AppShell accessibilityLabel="事件加载失败">
        <Screen>
          <Stack gap={4}>
            <Text variant="heading">事件</Text>
            <Text>{error ?? '事件未找到。'}</Text>
            <Pressable onPress={() => router.back()}>
              <Text variant="label" color="coral">
                返回日历
              </Text>
            </Pressable>
          </Stack>
        </Screen>
      </AppShell>
    );
  }

  return (
    <AppShell accessibilityLabel="编辑事件">
      <Screen>
        <Stack gap={4}>
          <Text variant="heading">编辑事件</Text>
          {error !== null && (
            <Text variant="bodySm" color="destructive">
              {error}
            </Text>
          )}
          <EventForm
            initial={event}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            submitLabel="保存"
            isSubmitting={isSubmitting}
          />

          {/* Delete button */}
          <View style={{ marginTop: activeTheme.spacing[4], borderTopWidth: 1, borderTopColor: activeTheme.colors.border, paddingTop: activeTheme.spacing[4] }}>
            <Pressable
              onPress={handleDelete}
              disabled={deleting}
              style={({ pressed }) => ({
                alignItems: 'center',
                paddingVertical: activeTheme.spacing[3],
                borderRadius: activeTheme.borderRadii.sm,
                borderWidth: 1,
                borderColor: activeTheme.colors.destructive,
                opacity: pressed ? 0.7 : 1,
              })}
              accessibilityLabel="删除事件"
            >
              <Text variant="button" color="destructive">
                {deleting ? '删除中…' : '删除事件'}
              </Text>
            </Pressable>
          </View>
        </Stack>
      </Screen>
    </AppShell>
  );
}
