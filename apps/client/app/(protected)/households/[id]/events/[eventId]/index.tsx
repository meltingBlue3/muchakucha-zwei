import { useTranslation } from '../../../../../../src/i18n';
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
import { DetailField, DetailPanel, DetailEditButton } from '../../../../../../src/ui/detail-fields';
import { useDesktop } from '../../../../../../src/ui/use-desktop';
import { ReminderDetailField } from '../../../../../../src/features/reminders/reminder-detail';
import { DEFAULT_REMINDER } from '../../../../../../src/features/reminders/reminder-rules';
import { Heading, LoadError, LoadingState, Stack, Text } from '../../../../../../src/ui/primitives';
import type { Theme } from '../../../../../../src/ui/theme';

function currentTimeZone(fallback: string): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || fallback;
  } catch {
    return fallback;
  }
}

export default function EventDetailRoute() {
  const { t } = useTranslation(['events', 'tasks', 'auth', 'navigation']);
  const { id, eventId } = useLocalSearchParams<{ id: string; eventId: string }>();
  const router = useRouter();
  const activeTheme = useTheme<Theme>();
  const desktop = useDesktop();
  const [event, setEvent] = useState<EventResponseDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'auth:errors.sessionExpired' | 'detailLoadError' | null>(null);

  const fetchEvent = useCallback(async () => {
    if (id === undefined || eventId === undefined) return;
    setError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setError('auth:errors.sessionExpired');
        return;
      }
      const result = await sessionApiClient.getEvent(token, id, eventId);
      setEvent(result);
    } catch {
      setError('detailLoadError');
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
    return <EventWindow title={t('detail')}><Stack gap={4}>
      {loading ? <LoadingState label={t('loading')} /> : <>
        <LoadError message={t(error ?? 'notFound')} onRetry={() => void fetchEvent()} />
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
    <EventWindow event={event} title={t('detail')} headerActions={<DetailEditButton accessibilityLabel={t('edit')} onPress={handleEdit} />}>
      <Stack gap={5}>
        <Stack gap={2}>
          <Heading level={2}>{event.title}</Heading>
          {cancelled ? <Text variant="label" color="inkMuted">{t('tasks:status.cancelled')}</Text> : null}
        </Stack>
        <DetailPanel>
          <DetailField label={t('time')} value={when} />
          {!cancelled ? (
            <ReminderDetailField kind="event" householdId={event.householdId} anchor={event.startTime} dateOnly={event.allDay} own choice={event.myReminder ?? DEFAULT_REMINDER} />
          ) : null}
          {event.location ? <DetailField label={t('location')} value={event.location} /> : null}
          {recurrenceSummary ? <DetailField label={t('navigation:pages.recurrence-rules')} value={recurrenceSummary.summary} notes={[
            recurrenceSummary.clampNote,
            recurrenceSummary.timeZoneNote,
            cancelled ? t('tasks:cancelledRecurrence') : t('occurrenceDetail'),
          ]} /> : null}
        </DetailPanel>
        {event.description ? <Stack gap={desktop ? 1 : 2} style={desktop ? { borderTopWidth: activeTheme.borderWidths.default, borderTopColor: activeTheme.colors.separator, paddingTop: activeTheme.spacing[4] } : undefined}><Text variant={desktop ? 'meta' : 'label'} color={desktop ? 'inkFaint' : 'inkMuted'}>{t('tasks:description')}</Text><Text {...(desktop ? { variant: 'bodySm' as const, color: 'ink' as const } : {})}>{event.description}</Text></Stack> : null}
        {(event.labels ?? []).length ? <Stack gap={2}>
          <Text variant="label" color="inkMuted">{t('labels')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: activeTheme.spacing[2] }}>{event.labels.map(label => <LabelChip key={label.id} label={label} />)}</View>
        </Stack> : null}
      </Stack>
    </EventWindow>
  );
}
