import { useTranslation } from '../../i18n';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { EventResponseDto } from '@muchakucha/api-client';
import { sessionApiClient, sessionTransport } from '../auth/session-runtime';
import { useWorkspaceState } from '../../ui/workspace-state';
import { useResourceNavigation } from '../../ui/use-resource-navigation';
import { Chip, Text } from '../../ui/primitives';
import { DayAgendaList } from './desktop-day-pane';
import { theme } from '../../ui/theme';
import { formatDate, formatWeekday } from '../../ui/date-values';
import { eventLastDate } from './desktop-month';
import { toDateIso } from './calendar-utils';

export function DesktopEventAgenda({ event }: { event: EventResponseDto }) {
  const { t } = useTranslation('events');
  const [selectedDate] = useWorkspaceState<string | null>(`view:${event.householdId}:events:selectedDateIso`, null);
  const firstDate = toDateIso(new Date(event.startTime));
  const date = selectedDate && selectedDate >= firstDate && selectedDate <= eventLastDate(event) ? selectedDate : firstDate;
  const [items, setItems] = useState<EventResponseDto[]>([event]);
  const open = useResourceNavigation();
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const token = await sessionTransport.getAccessToken();
        if (!token) return;
        const result = await sessionApiClient.listEvents(token, event.householdId, date, date, undefined, undefined, true);
        if (active) setItems(result.events.filter(item => toDateIso(new Date(item.startTime)) <= date && eventLastDate(item) >= date));
      } catch { /* The selected detail remains readable when its surrounding day cannot refresh. */ }
    })();
    return () => { active = false; };
  }, [date, event.householdId]);
  const isToday = date === toDateIso(new Date());
  const now = new Date();
  return <View style={{ marginHorizontal: -theme.spacing[3], marginBottom: theme.spacing[5], paddingBottom: theme.spacing[4], borderBottomWidth: theme.borderWidths.default, borderBottomColor: theme.colors.separator, gap: theme.spacing[3] }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2], paddingHorizontal: theme.spacing[2] }}><Text variant="label">{`${formatDate(new Date(`${date}T12:00:00`))} ${formatWeekday(new Date(`${date}T12:00:00`))}`}</Text>{isToday ? <Chip tone="accent">{t('today')}</Chip> : null}<Text variant="meta">{t('count', { count: items.length })}</Text></View>
    <DayAgendaList nameKey="dayAgenda" dateIso={date} events={items} openEventId={event.id} nowMinutes={isToday ? now.getHours() * 60 + now.getMinutes() : null} onOpen={item => { if (item.id !== event.id) open(`/households/${encodeURIComponent(event.householdId)}/events/${encodeURIComponent(item.id)}`); }} />
  </View>;
}
