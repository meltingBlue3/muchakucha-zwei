import { useTranslation } from '../../i18n';
import { CardActionsMenu } from '../../ui/card-actions-menu';
import { View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { EventResponseDto } from '@muchakucha/api-client';
import type { Theme } from '../../ui/theme';
import { Text } from '../../ui/primitives';
import { EventBar, ListRow, RowSlot } from '../../ui/list-group';
import { LabelTags } from '../labels/label-chip';
import { RecurrenceBadge } from '../recurrence/recurrence-badge';
import { birthdayNote } from '../birthdays/birthday-dates';
import { formatDateRange, formatTime, formatTimeRange, toDateIso } from './calendar-utils';
import { useDesktop } from '../../ui/use-desktop';

interface EventCardProps {
  onEdit?: (() => void) | undefined;
  onDelete?: (() => void) | undefined;
  event: EventResponseDto;
  onPress: (event: EventResponseDto) => void;
  /** The list already names the day (an agenda or Today), so the row shows only clock times. */
  withinDay?: boolean;
  /** Puts the start time in a leading column, lining the row up in a timeline. */
  timeColumn?: boolean;
  /** Its window is open beside the list. */
  selected?: boolean;
}

/** One event as a list row: start time, a bar in its label's color, then title and place. */
export function EventCard({ event, onPress, onEdit, onDelete, withinDay = false, timeColumn = false, selected = false }: EventCardProps) {
  const { t } = useTranslation('events');
  const activeTheme = useTheme<Theme>();
  const desktop = useDesktop();
  const labels = event.labels ?? [];
  const place = event.location !== null && event.location !== '' ? event.location : null;
  const when = withinDay ? formatTimeRange(event.startTime, event.endTime, event.allDay) : formatDateRange(event.startTime, event.endTime, event.allDay);
  const startTime = event.allDay ? t('allDay') : formatTime(event.startTime);
  // Under 全天 or beside a 全天 time column, saying it again adds nothing.
  const showWhen = !(withinDay && event.allDay && toDateIso(new Date(event.startTime)) === toDateIso(new Date(event.endTime)));
  const birthday = birthdayNote(event);
  const subject = t('card', { title: event.title });
  const name = birthday === null ? subject : t('cardBirthday', { name: subject, birthday });

  return (
    <ListRow
      accessibilityLabel={event.recurrenceRuleId == null ? name : t('cardRecurring', { name })}
      onPress={() => onPress(event)}
      selected={selected}
      leading={desktop ? <View style={{ alignSelf: 'stretch', width: activeTheme.spacing[1], backgroundColor: labels[0]?.color ?? activeTheme.colors.inkFaint, marginVertical: activeTheme.spacing[2] }} /> : <>
        {timeColumn ? <RowSlot width={activeTheme.layout.timeColumn}><Text variant="time" style={{ paddingLeft: activeTheme.spacing[3] }}>{startTime}</Text></RowSlot> : null}
        {/* As wide as a task's completion mark, so event and task titles line up in a mixed list. */}
        <View style={{ width: activeTheme.controlSizes.touchTarget, alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'center' }}>
          <EventBar color={labels[0]?.color ?? activeTheme.colors.inkFaint} />
        </View>
      </>}
      trailing={<CardActionsMenu subject={subject} actions={[
        ...(onEdit ? [{ kind: 'edit' as const, accessibilityLabel: t('editCard', { title: event.title }), onPress: onEdit }] : []),
        ...(onDelete ? [{ kind: 'delete' as const, accessibilityLabel: t('deleteCard', { title: event.title }), onPress: onDelete }] : []),
      ]} />}
    >
      <Text variant={desktop ? 'bodySm' : 'body'} color="ink" numberOfLines={desktop ? 1 : 2}>{event.title}</Text>
      {showWhen || place !== null || event.recurrenceRuleId != null || labels.length > 0 ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: activeTheme.spacing[2], rowGap: activeTheme.spacing[1], marginTop: activeTheme.spacing[1] / 2 }}>
        {showWhen || desktop ? <Text variant="time">{desktop && event.allDay ? t('allDay') : when}</Text> : null}
        {place !== null ? <Text variant="meta" numberOfLines={1} style={{ flexShrink: 1 }}>{place}</Text> : null}
        {birthday !== null ? <Text variant="meta" numberOfLines={1}>{birthday}</Text> : null}
        {event.recurrenceRuleId != null ? <RecurrenceBadge /> : null}
        <LabelTags labels={labels} />
      </View> : null}
    </ListRow>
  );
}
