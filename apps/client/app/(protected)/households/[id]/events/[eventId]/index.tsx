import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { EventResponseDto } from '@muchakucha/api-client';
import Ban from 'lucide-react-native/icons/ban';
import Pencil from 'lucide-react-native/icons/pencil';
import MapPin from 'lucide-react-native/icons/map-pin';

import { sessionApiClient, sessionTransport } from '../../../../../../src/features/auth/session-runtime';
import { LabelChip } from '../../../../../../src/features/labels/label-chip';
import { formatTime } from '../../../../../../src/features/events/calendar-utils';
import { AppShell } from '../../../../../../src/ui/household-components';
import { recurrenceInputFromResponse } from '../../../../../../src/features/recurrence/recurrence-picker';
import { formatRecurrenceSummary } from '../../../../../../src/features/recurrence/recurrence-summary';
import { Heading, Stack, Text } from '../../../../../../src/ui/primitives';
import type { Theme } from '../../../../../../src/ui/theme';

function formatFullDateTime(iso: string, allDay: boolean): string {
  const d = new Date(iso);
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return allDay ? dateStr : `${dateStr} ${formatTime(iso)}`;
}

function currentTimeZone(fallback: string): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || fallback;
  } catch {
    return fallback;
  }
}

export default function EventDetailRoute() {
  const { id, eventId } = useLocalSearchParams<{ id: string; eventId: string }>();
  const router = useRouter();
  const activeTheme = useTheme<Theme>();
  const [event, setEvent] = useState<EventResponseDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvent = useCallback(async () => {
    if (id === undefined || eventId === undefined) return;
    setLoading(true);
    setError(null);
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

  // Refetch whenever this screen regains focus (e.g. returning from the
  // edit screen), not just on first mount — otherwise a save doesn't show
  // up here until the whole route remounts.
  useFocusEffect(
    useCallback(() => {
      void fetchEvent();
    }, [fetchEvent]),
  );

  const handleEdit = useCallback(() => {
    void router.push(`/households/${encodeURIComponent(id)}/events/${encodeURIComponent(eventId)}/edit`);
  }, [router, id, eventId]);

  if (loading) {
    return (
      <AppShell accessibilityLabel="加载事件中" title="事件详情" showBack showProfile>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: activeTheme.spacing[12] }}>
          <ActivityIndicator color={activeTheme.colors.coral} />
        </View>
      </AppShell>
    );
  }

  if (event === null || error !== null) {
    return (
      <AppShell accessibilityLabel="事件加载失败" title="事件详情" showBack showProfile>
        <Stack gap={4}>
          <Text>{error ?? '事件未找到。'}</Text>
          <Pressable onPress={() => router.back()} hitSlop={activeTheme.spacing[4]}>
            <Text variant="label" color="coral">返回日历</Text>
          </Pressable>
        </Stack>
      </AppShell>
    );
  }

  const recurrence = recurrenceInputFromResponse(event.recurrence);
  const recurrenceSummary =
    recurrence === null
      ? null
      : formatRecurrenceSummary(recurrence, currentTimeZone(recurrence.timezone));
  const cancelled = event.cancelledAt != null;

  return (
    <AppShell accessibilityLabel="事件详情" title="事件详情" showBack showProfile>
      <Stack gap={6} style={{ backgroundColor: activeTheme.colors.surface, borderRadius: activeTheme.borderRadii.xl, padding: activeTheme.spacing[5] }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: activeTheme.spacing[3] }}>
          <Stack gap={2} style={{ flex: 1 }}>
            <Heading>{event.title}</Heading>
            {cancelled && (
              <View
                style={{
                  alignItems: 'center',
                  alignSelf: 'flex-start',
                  backgroundColor: activeTheme.colors.surfaceMuted,
                  borderRadius: activeTheme.borderRadii.sm,
                  flexDirection: 'row',
                  gap: activeTheme.spacing[1],
                  paddingHorizontal: activeTheme.spacing[2],
                  paddingVertical: activeTheme.spacing[1],
                }}
              >
                <Ban color={activeTheme.colors.inkMuted} size={14} strokeWidth={2} />
                <Text variant="caption" color="inkMuted">已取消</Text>
              </View>
            )}
          </Stack>
          <Pressable
            onPress={handleEdit}
            accessibilityLabel="编辑事件"
            accessibilityRole="button"
            hitSlop={activeTheme.spacing[2]}
            style={({ pressed }) => ({
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: activeTheme.controlSizes.touchTarget,
              minWidth: activeTheme.controlSizes.touchTarget,
              borderRadius: activeTheme.borderRadii.md,
              backgroundColor: pressed ? activeTheme.colors.surfaceMuted : 'transparent',
            })}
          >
            <Pencil
              size={activeTheme.controlSizes.icon}
              color={activeTheme.colors.coral}
              strokeWidth={activeTheme.controlSizes.iconStroke}
            />
          </Pressable>
        </View>

        {event.allDay && (
          <View
            style={{
              alignSelf: 'flex-start',
              backgroundColor: activeTheme.colors.tealSoft,
              paddingHorizontal: activeTheme.spacing[3],
              paddingVertical: activeTheme.spacing[1],
              borderRadius: activeTheme.borderRadii.full,
            }}
          >
            <Text variant="caption" color="teal">全天事件</Text>
          </View>
        )}

        <Stack gap={1}>
          <Text variant="label" color="inkMuted">开始</Text>
          <Text variant="body">{formatFullDateTime(event.startTime, event.allDay)}</Text>
        </Stack>

        <Stack gap={1}>
          <Text variant="label" color="inkMuted">结束</Text>
          <Text variant="body">{formatFullDateTime(event.endTime, event.allDay)}</Text>
        </Stack>

        {event.recurrenceRuleId != null && recurrenceSummary !== null && (
          <Stack gap={1}>
            <Text variant="label" color="inkMuted">重复</Text>
            <Text variant="body">{recurrenceSummary.summary}</Text>
            {recurrenceSummary.clampNote !== null && (
              <Text variant="caption" color="inkMuted">{recurrenceSummary.clampNote}</Text>
            )}
            {recurrenceSummary.timeZoneNote !== null && (
              <Text variant="caption" color="inkMuted">{recurrenceSummary.timeZoneNote}</Text>
            )}
            {cancelled && (
              <Text variant="caption" color="inkMuted">这次重复已取消。</Text>
            )}
          </Stack>
        )}

        {event.location !== null && event.location !== '' && (
          <Stack gap={1}>
            <Text variant="label" color="inkMuted">地点</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: activeTheme.spacing[1] }}>
              <MapPin size={16} color={activeTheme.colors.inkMuted} strokeWidth={1.5} />
              <Text variant="body">{event.location}</Text>
            </View>
          </Stack>
        )}

        {event.description !== null && event.description !== '' && (
          <Stack gap={1}>
            <Text variant="label" color="inkMuted">描述</Text>
            <Text variant="body">{event.description}</Text>
          </Stack>
        )}

        {event.labels.length > 0 && (
          <Stack gap={1}>
            <Text variant="label" color="inkMuted">标签</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: activeTheme.spacing[2] }}>
              {event.labels.map((label) => (
                <LabelChip key={label.id} label={label} />
              ))}
            </View>
          </Stack>
        )}
      </Stack>
    </AppShell>
  );
}
