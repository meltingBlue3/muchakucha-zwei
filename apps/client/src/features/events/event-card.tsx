import { CardActionsMenu } from '../../ui/card-actions-menu';
import { View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { EventResponseDto } from '@muchakucha/api-client';
import type { Theme } from '../../ui/theme';
import { Text } from '../../ui/primitives';
import { EventBar, ListRow, RowSlot } from '../../ui/list-group';
import { LabelTags } from '../labels/label-chip';
import { RecurrenceBadge } from '../recurrence/recurrence-badge';
import { formatDateRange, formatTime, formatTimeRange } from './calendar-utils';

interface EventCardProps {
  onEdit?: (() => void) | undefined;
  onDelete?: (() => void) | undefined;
  event: EventResponseDto;
  onPress: (event: EventResponseDto) => void;
  /** The list already names the day (an agenda or Today), so the row shows only clock times. */
  withinDay?: boolean;
  /** Puts the start time in a leading column, lining the row up in a timeline. */
  timeColumn?: boolean;
}

/** One event as a list row: start time, a bar in its label's color, then title and place. */
export function EventCard({ event, onPress, onEdit, onDelete, withinDay = false, timeColumn = false }: EventCardProps) {
  const activeTheme = useTheme<Theme>();
  const labels = event.labels ?? [];
  const place = event.location !== null && event.location !== '' ? event.location : null;
  const when = withinDay ? formatTimeRange(event.startTime, event.endTime, event.allDay) : formatDateRange(event.startTime, event.endTime, event.allDay);
  const startTime = event.allDay ? '全天' : formatTime(event.startTime);
  // Under 全天 or beside a 全天 time column, saying it again adds nothing.
  const showWhen = when !== '全天';

  return (
    <ListRow
      accessibilityLabel={`日程：${event.title}${event.recurrenceRuleId == null ? '' : '，重复'}`}
      onPress={() => onPress(event)}
      leading={<>
        {timeColumn ? <RowSlot width={activeTheme.layout.timeColumn}><Text variant="time" style={{ paddingLeft: activeTheme.spacing[3] }}>{startTime}</Text></RowSlot> : null}
        {/* As wide as a task's completion mark, so event and task titles line up in a mixed list. */}
        <View style={{ width: activeTheme.controlSizes.touchTarget, alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'center' }}>
          <EventBar color={labels[0]?.color ?? activeTheme.colors.inkFaint} />
        </View>
      </>}
      trailing={<CardActionsMenu subject={`日程：${event.title}`} actions={[
        ...(onEdit ? [{ kind: 'edit' as const, accessibilityLabel: `编辑日程：${event.title}`, onPress: onEdit }] : []),
        ...(onDelete ? [{ kind: 'delete' as const, accessibilityLabel: `删除日程：${event.title}`, onPress: onDelete }] : []),
      ]} />}
    >
      <Text variant="body" numberOfLines={2}>{event.title}</Text>
      {showWhen || place !== null || event.recurrenceRuleId != null || labels.length > 0 ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: activeTheme.spacing[2], rowGap: activeTheme.spacing[1], marginTop: activeTheme.spacing[1] / 2 }}>
        {showWhen ? <Text variant="time">{when}</Text> : null}
        {place !== null ? <Text variant="meta" numberOfLines={1} style={{ flexShrink: 1 }}>{place}</Text> : null}
        {event.recurrenceRuleId != null ? <RecurrenceBadge /> : null}
        <LabelTags labels={labels} />
      </View> : null}
    </ListRow>
  );
}
