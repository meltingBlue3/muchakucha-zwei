import { useTranslation } from '../../i18n';
import { useState, type ReactNode } from 'react';
import { CardActionsMenu } from '../../ui/card-actions-menu';
import { RowInteraction } from '../../ui/row-interaction';
import { Pressable, ScrollView, View } from 'react-native';
import Plus from 'lucide-react-native/icons/plus';
import type { EventResponseDto } from '@muchakucha/api-client';
import { insetFocusRing } from '../../platform/focus-ring/focus-ring';
import { Chip, Heading, Text } from '../../ui/primitives';
import { theme } from '../../ui/theme';
import { formatDate, formatWeekday, toTimeValue } from '../../ui/date-values';
import { RecurrenceBadge } from '../recurrence/recurrence-badge';
import { toDateIso } from './calendar-utils';
import { eventLastDate } from './desktop-month';
import { lunarDescriptionOn } from '../lunar/lunar-calendar';
import { holidayNameOn } from '../wareki/japanese-calendar';
import { birthdayNote } from '../birthdays/birthday-dates';

const dayDate = (iso: string) => new Date(`${iso}T12:00:00`);
const minuteOf = (iso: string) => { const date = new Date(iso); return date.getHours() * 60 + date.getMinutes(); };

/** An event that covers the whole of `dateIso`: marked all-day, or running on from an earlier day or into a later one. */
export function coversDay(event: EventResponseDto, dateIso: string) {
  return event.allDay || toDateIso(new Date(event.startTime)) < dateIso || eventLastDate(event) > dateIso;
}

/**
 * One event of a day on the desktop calendar: its start time in a column, a
 * bar in its label's color, the title and one quiet line of when and where.
 * The open event is drawn selected.
 */
export function DayAgendaRow({ event, dateIso, selected, onPress, nameKey = 'card', onEdit, onDelete }: {
  event: EventResponseDto; dateIso: string; selected: boolean; onPress(): void;
  /** Translation key for the row's accessible name. */
  nameKey?: 'card' | 'dayAgenda';
  onEdit?: (() => void) | undefined; onDelete?: (() => void) | undefined;
}) {
  const [hovered, setHovered] = useState(false);
  const { t } = useTranslation('events');
  const [focused, setFocused] = useState(false);
  const color = event.labels?.[0]?.color ?? theme.colors.inkMuted;
  const allDay = coversDay(event, dateIso);
  const first = toDateIso(new Date(event.startTime));
  const last = eventLastDate(event);
  const when = allDay
    ? first === last ? t('allDay') : `${formatDate(dayDate(first))} – ${formatDate(dayDate(last))}`
    : `${toTimeValue(new Date(event.startTime))}–${toTimeValue(new Date(event.endTime))}`;
  const detail = [when, birthdayNote(event), event.location, allDay ? event.labels?.[0]?.name : null].filter(Boolean).join(' · ');
  const actions = [
    ...(onEdit ? [{ kind: 'edit' as const, accessibilityLabel: t('editCard', { title: event.title }), onPress: onEdit }] : []),
    ...(onDelete ? [{ kind: 'delete' as const, accessibilityLabel: t('deleteCard', { title: event.title }), onPress: onDelete }] : []),
  ];
  // Row and menu are siblings, so Web never nests one button in another; the menu shows while the row is hovered or focused.
  return (
    <RowInteraction.Provider value={hovered || focused}><View onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)} style={{ flexDirection: 'row', alignItems: 'center', borderRadius: theme.borderRadii.sm, backgroundColor: selected ? theme.colors.surfaceSelected : hovered ? theme.colors.surfaceSubtle : theme.colors.transparent }}>
    <Pressable
      {...insetFocusRing}
      accessibilityRole="button"
      accessibilityLabel={t(nameKey, { title: event.title })}
      {...(selected ? { 'aria-current': true } : {})}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'stretch', gap: theme.spacing[2] + 2, paddingVertical: theme.spacing[1] + 2, paddingHorizontal: theme.spacing[2], borderRadius: theme.borderRadii.sm }}
    >
      {allDay ? null : <Text variant="time" color="inkMuted" style={{ width: theme.spacing[10] + theme.spacing[1], paddingTop: 1 }}>{toTimeValue(new Date(event.startTime))}</Text>}
      <View style={{ width: theme.borderWidths.focus + 1, borderRadius: theme.borderRadii.full, backgroundColor: color }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[1] + 2 }}>
          <Text variant="bodySm" color="ink" numberOfLines={1} style={{ flexShrink: 1, fontWeight: selected ? '600' : '400' }}>{event.title}</Text>
          {event.recurrenceRuleId ? <RecurrenceBadge /> : null}
        </View>
        <Text variant="caption" color="inkMuted" numberOfLines={1} style={{ fontWeight: '400', fontFamily: theme.fontFamilies.numeric }}>{detail}</Text>
      </View>
    </Pressable>
    {actions.length ? <View style={{ paddingRight: theme.spacing[1] }}><CardActionsMenu subject={t('card', { title: event.title })} actions={actions} /></View> : null}
    </View></RowInteraction.Provider>
  );
}

/** The red line of the current time between the day's timed events. */
function NowLine({ minute }: { minute: number }) {
  const { t } = useTranslation('events');
  const time = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={t('now', { time })} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2], paddingHorizontal: theme.spacing[2], height: theme.spacing[4] }}>
      <Text variant="caption" color="accent" style={{ width: theme.spacing[10] + theme.spacing[1], fontFamily: theme.fontFamilies.numericStrong }}>{time}</Text>
      <View style={{ width: theme.spacing[1] + 1, height: theme.spacing[1] + 1, borderRadius: theme.borderRadii.full, backgroundColor: theme.colors.accent }} />
      <View style={{ flex: 1, height: theme.borderWidths.focus - 0.5, backgroundColor: theme.colors.accent }} />
    </View>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return <View style={{ gap: theme.spacing[1] }}>
    <Text accessibilityRole="header" aria-level={3} variant="caption" color="inkFaint" style={{ paddingHorizontal: theme.spacing[2], marginBottom: theme.spacing[1] }}>{title}</Text>
    {children}
  </View>;
}

/**
 * The events of one day, grouped into 全天 and 时间线, with the current time
 * drawn among today's events. `children` replaces the groups while the day is
 * loading, failed or empty.
 */
export function DayAgendaList({ dateIso, events, openEventId, nowMinutes, onOpen, children, nameKey, onEdit, onDelete }: {
  dateIso: string; events: EventResponseDto[]; openEventId: string | null; nowMinutes: number | null;
  onOpen(event: EventResponseDto): void; children?: ReactNode;
  nameKey?: 'card' | 'dayAgenda';
  onEdit?: (event: EventResponseDto) => (() => void) | undefined; onDelete?: (event: EventResponseDto) => (() => void) | undefined;
}) {
  const allDay = events.filter(event => coversDay(event, dateIso));
  const { t } = useTranslation('events');
  const timed = events.filter(event => !coversDay(event, dateIso)).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const nowIndex = nowMinutes === null ? -1 : (() => { const index = timed.findIndex(event => minuteOf(event.startTime) > nowMinutes); return index < 0 ? timed.length : index; })();
  const row = (event: EventResponseDto) => <DayAgendaRow key={event.id} event={event} dateIso={dateIso} selected={event.id === openEventId} onPress={() => onOpen(event)} {...(nameKey ? { nameKey } : {})} onEdit={onEdit?.(event)} onDelete={onDelete?.(event)} />;
  return <View style={{ gap: theme.spacing[4] }}>
    {children}
    {allDay.length ? <Group title={t('allDay')}>{allDay.map(row)}</Group> : null}
    {timed.length ? <Group title={t('timeline')}>{timed.flatMap((event, index) => index === nowIndex ? [<NowLine key="now" minute={nowMinutes!} />, row(event)] : [row(event)])}{nowIndex === timed.length ? <NowLine minute={nowMinutes!} /> : null}</Group> : null}
  </View>;
}

/**
 * The right column of the desktop calendar: the chosen day as a heading with
 * its count, the day's events, and a way to add one on that day.
 */
export function DesktopDayPane({ dateIso, todayIso, events, openEventId, nowMinutes, onOpen, onCreate, onEdit, onDelete, lunar = false, japanese = false, children }: {
  dateIso: string; todayIso: string; events: EventResponseDto[]; openEventId: string | null; nowMinutes: number;
  onOpen(event: EventResponseDto): void; onCreate(): void; children?: ReactNode;
  /** Names the day's lunar date, festivals and solar term under the heading. */
  lunar?: boolean;
  /** Names the day's holiday in Japan before them. */
  japanese?: boolean;
  onEdit?: (event: EventResponseDto) => (() => void) | undefined; onDelete?: (event: EventResponseDto) => (() => void) | undefined;
}) {
  const date = dayDate(dateIso);
  const { t } = useTranslation('events');
  const isToday = dateIso === todayIso;
  return <View style={{ flex: 1, minHeight: 0 }}>
    <View style={{ paddingHorizontal: theme.spacing[5], paddingTop: theme.spacing[4], paddingBottom: theme.spacing[3], borderBottomWidth: theme.borderWidths.default, borderBottomColor: theme.colors.separator, gap: theme.spacing[1] / 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] }}>
        <Heading variant="section" level={2}>{`${formatDate(date)} ${formatWeekday(date)}`}</Heading>
        {isToday ? <Chip tone="accent">{t('today')}</Chip> : null}
      </View>
      <Text variant="meta">{[japanese ? holidayNameOn(dateIso) : null, lunar ? lunarDescriptionOn(dateIso) : null, events.length ? t('count', { count: events.length }) : t('noEvents')].filter(Boolean).join(' · ')}</Text>
    </View>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: theme.spacing[3], paddingTop: theme.spacing[4] }}>
      <DayAgendaList dateIso={dateIso} events={events} openEventId={openEventId} nowMinutes={isToday ? nowMinutes : null} onOpen={onOpen} {...(onEdit ? { onEdit } : {})} {...(onDelete ? { onDelete } : {})}>{children}</DayAgendaList>
    </ScrollView>
    <View style={{ padding: theme.spacing[4], paddingTop: theme.spacing[3], borderTopWidth: theme.borderWidths.default, borderTopColor: theme.colors.separator }}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('createOnDayName', { date: formatDate(date) })} onPress={onCreate} style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing[1] + 2, minHeight: theme.layout.desktopControl, borderRadius: theme.borderRadii.sm, borderWidth: theme.borderWidths.default, borderStyle: 'dashed', borderColor: theme.colors.outline, backgroundColor: pressed || hovered ? theme.colors.surfaceSubtle : theme.colors.transparent })}>
        <Plus size={theme.controlSizes.icon - 6} color={theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} />
        <Text variant="meta">{t('createOnDay', { date: formatDate(date) })}</Text>
      </Pressable>
    </View>
  </View>;
}
