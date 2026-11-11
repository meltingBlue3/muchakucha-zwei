import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { EventResponseDto } from '@muchakucha/api-client';
import { sessionApiClient, sessionTransport } from '../auth/session-runtime';
import { useWorkspaceState } from '../../ui/workspace-state';
import { useResourceNavigation } from '../../ui/use-resource-navigation';
import { GroupLabel, ListGroup } from '../../ui/list-group';
import { Text } from '../../ui/primitives';
import { theme } from '../../ui/theme';
import { formatDate, toTimeValue } from '../../ui/date-values';
import { eventLastDate } from './desktop-month';
import { toDateIso } from './calendar-utils';

export function DesktopEventAgenda({ event }: { event: EventResponseDto }) {
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
  return <View style={{ marginBottom: theme.spacing[6], paddingBottom: theme.spacing[4], borderBottomWidth: theme.borderWidths.default, borderBottomColor: theme.colors.separator }}><GroupLabel>{formatDate(new Date(`${date}T12:00:00`), { weekday: true })}</GroupLabel><ListGroup>{items.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`当日日程：${item.title}`} {...(item.id === event.id ? { 'aria-current': true } : {})} onPress={() => { if (item.id !== event.id) open(`/households/${encodeURIComponent(event.householdId)}/events/${encodeURIComponent(item.id)}`); }} style={({ pressed }) => ({ minHeight: theme.layout.desktopRowHeight, flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2], paddingHorizontal: theme.spacing[2], backgroundColor: item.id === event.id ? theme.colors.canvas : pressed ? theme.colors.surfaceSubtle : theme.colors.surface })}><Text variant="time" style={{ width: theme.layout.timeColumn }}>{item.allDay ? '全天' : toTimeValue(new Date(item.startTime))}</Text><Text variant="bodySm" color="ink" numberOfLines={1} style={{ flex: 1 }}>{item.title}</Text></Pressable>)}</ListGroup></View>;
}
