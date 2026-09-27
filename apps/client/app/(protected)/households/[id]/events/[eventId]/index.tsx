import { EventWindow } from '../../../../../../src/features/events/event-window';
import { rememberRouteTrigger } from '../../../../../../src/platform/overlays/route-trigger';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { EventResponseDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../../../../../../src/features/auth/session-runtime';
import { LabelChip } from '../../../../../../src/features/labels/label-chip';
import { formatDateRange } from '../../../../../../src/features/events/calendar-utils';
import { recurrenceInputFromResponse } from '../../../../../../src/features/recurrence/recurrence-options';
import { formatRecurrenceSummary } from '../../../../../../src/features/recurrence/recurrence-summary';
import { DetailField, DetailPanel } from '../../../../../../src/ui/detail-fields';
import { Button, Heading, LoadError, LoadingState, Stack, Text } from '../../../../../../src/ui/primitives';
import type { Theme } from '../../../../../../src/ui/theme';

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
    setError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setError('登录已过期，请重新登录。');
        return;
      }
      const result = await sessionApiClient.getEvent(token, id, eventId);
      setEvent(result);
    } catch {
      setError('无法加载日程，请重试或确认它是否已被删除。');
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
    rememberRouteTrigger();
    void router.push(`/households/${encodeURIComponent(id)}/events/${encodeURIComponent(eventId)}/edit`);
  }, [router, id, eventId]);

  if (loading || event === null || error !== null) {
    return <EventWindow title="日程详情"><Stack gap={4}>
      {loading ? <LoadingState label="正在加载日程" /> : <>
        <LoadError message={error ?? '日程未找到或已被删除。'} onRetry={() => void fetchEvent()} />
      </>}
    </Stack></EventWindow>;
  }

  const recurrence = recurrenceInputFromResponse(event.recurrence);
  const recurrenceSummary =
    recurrence === null
      ? null
      : formatRecurrenceSummary(recurrence, currentTimeZone(recurrence.timezone));
  const cancelled = event.cancelledAt != null;

  const when = formatDateRange(event.startTime, event.endTime, event.allDay, { weekday: true });
  return (
    <EventWindow title="日程详情" footer={<Button label="编辑日程" onPress={handleEdit} />}>
      <Stack gap={5}>
        <Stack gap={2}>
          <Heading level={2}>{event.title}</Heading>
          {cancelled ? <Text variant="label" color="inkMuted">已取消</Text> : null}
        </Stack>
        <DetailPanel>
          <DetailField label="时间" value={when} />
          {event.location ? <DetailField label="地点" value={event.location} /> : null}
          {recurrenceSummary ? <DetailField label="重复安排" value={recurrenceSummary.summary} notes={[
            recurrenceSummary.clampNote,
            recurrenceSummary.timeZoneNote,
            cancelled ? '这次重复已取消。' : '当前查看这一次日程，编辑时可选择影响范围。',
          ]} /> : null}
        </DetailPanel>
        {event.description ? <Stack gap={2}><Text variant="label" color="inkMuted">描述</Text><Text>{event.description}</Text></Stack> : null}
        {(event.labels ?? []).length ? <Stack gap={2}>
          <Text variant="label" color="inkMuted">标签</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: activeTheme.spacing[2] }}>{event.labels.map(label => <LabelChip key={label.id} label={label} />)}</View>
        </Stack> : null}
      </Stack>
    </EventWindow>
  );
}
