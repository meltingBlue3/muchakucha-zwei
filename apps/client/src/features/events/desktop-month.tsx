import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import type { EventResponseDto } from '@muchakucha/api-client';
import { getCalendarMonth, getDayNames, toDateIso } from './calendar-utils';
import { formatDayLabel, toTimeValue } from '../../ui/date-values';
import { Text } from '../../ui/primitives';
import { labelTint, theme } from '../../ui/theme';

export function eventLastDate(event: Pick<EventResponseDto, 'startTime' | 'endTime'>) {
  return toDateIso(new Date(Math.max(new Date(event.startTime).getTime(), new Date(event.endTime).getTime() - 1)));
}

/** One segment per week, with shared lanes across all seven cells. */
export function monthSegments(events: EventResponseDto[], first: string, last: string) {
  const ends: string[] = [];
  return events.filter(event => event.allDay || toDateIso(new Date(event.startTime)) !== eventLastDate(event))
    .map(event => ({ event, start: toDateIso(new Date(event.startTime)) > first ? toDateIso(new Date(event.startTime)) : first, end: eventLastDate(event) < last ? eventLastDate(event) : last }))
    .filter(segment => segment.start <= segment.end)
    .sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end) || a.event.id.localeCompare(b.event.id))
    .map(segment => {
      let lane = ends.findIndex(end => end < segment.start);
      if (lane < 0) lane = ends.length;
      ends[lane] = segment.end;
      return { ...segment, lane };
    });
}

export function DesktopMonth({ year, month, todayIso, selectedDateIso, events, onSelectDate, onOpenEvent }: {
  year: number; month: number; todayIso: string; selectedDateIso: string | null; events: EventResponseDto[];
  onSelectDate(date: string): void; onOpenEvent(event: EventResponseDto): void;
}) {
  const weeks = useMemo(() => {
    const rows = [...getCalendarMonth(year, month, todayIso).weeks];
    while (rows.length < 6) {
      const next = new Date(`${rows.at(-1)!.at(-1)!.iso}T12:00:00`);
      rows.push(Array.from({ length: 7 }, () => { next.setDate(next.getDate() + 1); return { date: new Date(next), iso: toDateIso(next), dayOfMonth: next.getDate(), isCurrentMonth: next.getMonth() === month, isToday: toDateIso(next) === todayIso }; }));
    }
    return rows;
  }, [year, month, todayIso]);
  return <View testID="desktop-month-grid" style={{ flex: 1, minHeight: 0 }}>
    <View style={{ flexDirection: 'row', height: theme.layout.desktopControl }}>{getDayNames().map(name => <View key={name} style={{ flex: 1, justifyContent: 'center', paddingLeft: theme.spacing[3] }}><Text variant="caption" color="inkFaint" style={{ fontWeight: '400' }}>{`周${name}`}</Text></View>)}</View>
    {weeks.map(week => {
      const segments = monthSegments(events, week[0]!.iso, week[6]!.iso);
      const lanes = Math.min(2, Math.max(0, ...segments.map(segment => segment.lane + 1)));
      return <View key={week[0]!.iso} style={{ flex: 1, minHeight: theme.spacing[16] + theme.spacing[6], flexDirection: 'row', borderTopWidth: theme.borderWidths.default, borderTopColor: theme.colors.separator }}>
        {week.map((day, index) => {
          const singles = events.filter(event => !event.allDay && toDateIso(new Date(event.startTime)) === day.iso && eventLastDate(event) === day.iso).sort((a, b) => a.startTime.localeCompare(b.startTime));
          // A cell fits four lines, one fewer under a spanning bar; when they overflow, the last line counts the rest.
          const room = lanes ? 3 : 4;
          const shown = singles.length > room ? room - 1 : singles.length;
          const hidden = singles.length - shown + segments.filter(segment => segment.lane >= 2 && segment.start <= day.iso && segment.end >= day.iso).length;
          // Named like the phone month: the date, whether it is today, and how many events fall on it.
          const eventCount = events.filter(event => toDateIso(new Date(event.startTime)) <= day.iso && eventLastDate(event) >= day.iso).length;
          return <View key={day.iso} style={{ flex: 1, minWidth: 0, borderLeftWidth: index ? theme.borderWidths.default : 0, borderLeftColor: theme.colors.separator, backgroundColor: day.iso === selectedDateIso ? theme.colors.canvas : day.isCurrentMonth ? theme.colors.surface : theme.colors.surfaceSubtle }}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${formatDayLabel(new Date(`${day.iso}T12:00:00`))}${day.isToday ? '，今天' : ''}${eventCount > 0 ? `，${eventCount}个日程` : ''}`} aria-pressed={day.iso === selectedDateIso} onPress={() => onSelectDate(day.iso)} style={{ padding: theme.spacing[1], height: theme.layout.desktopControl }}><View style={{ alignSelf: 'flex-start', borderRadius: theme.borderRadii.full, minWidth: theme.spacing[6], height: theme.spacing[6], paddingHorizontal: theme.spacing[1], alignItems: 'center', justifyContent: 'center', backgroundColor: day.isToday ? theme.colors.accent : theme.colors.transparent }}><Text variant="caption" color={day.isToday ? 'surface' : day.isCurrentMonth ? 'ink' : 'inkFaint'} style={{ fontSize: theme.typography.meta.fontSize, fontFamily: day.isToday ? theme.fontFamilies.numericStrong : theme.fontFamilies.numeric, fontWeight: day.isToday ? '600' : '400' }}>{day.dayOfMonth === 1 ? `${new Date(`${day.iso}T12:00:00`).getMonth() + 1}月1日` : day.dayOfMonth}</Text></View></Pressable>
            <View style={{ paddingTop: lanes * theme.spacing[6], paddingHorizontal: theme.spacing[1], gap: theme.spacing[1] / 2 }}>{singles.slice(0, shown).map(event => <Pressable key={event.id} accessibilityRole="button" accessibilityLabel={`查看月历日程：${event.title}`} {...({ title: `${toTimeValue(new Date(event.startTime))} ${event.title}` } as object)} onPress={() => { onSelectDate(day.iso); onOpenEvent(event); }} style={({ hovered }: { pressed: boolean; hovered?: boolean }) => ({ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[1] + 2, height: theme.spacing[5], paddingHorizontal: theme.spacing[1], borderRadius: theme.spacing[1], backgroundColor: hovered ? theme.colors.surfaceMuted : theme.colors.transparent })}><View style={{ width: theme.spacing[1] + 2, height: theme.spacing[1] + 2, borderRadius: theme.borderRadii.full, backgroundColor: event.labels?.[0]?.color ?? theme.colors.inkMuted }} /><Text variant="caption" color="ink" numberOfLines={1} style={{ flex: 1, fontWeight: '400', fontSize: theme.typography.tag.fontSize + 1 }}>{event.title}</Text></Pressable>)}{hidden ? <Pressable accessibilityRole="button" accessibilityLabel={`${day.iso}还有 ${hidden} 项`} onPress={() => onSelectDate(day.iso)} style={{ paddingHorizontal: theme.spacing[1], height: theme.spacing[5], justifyContent: 'center' }}><Text variant="caption" color="inkMuted" style={{ fontWeight: '400' }}>还有 {hidden} 项</Text></Pressable> : null}</View>
          </View>;
        })}
        {segments.filter(segment => segment.lane < 2).map(({ event, start, end, lane }) => {
          const left = week.findIndex(day => day.iso === start);
          const right = week.findIndex(day => day.iso === end);
          const color = event.labels?.[0]?.color ?? theme.colors.inkMuted;
          return <Pressable key={event.id} testID="calendar-span" accessibilityRole="button" accessibilityLabel={`跨日安排：${event.title}`} onPress={() => { onSelectDate(start); onOpenEvent(event); }} style={{ position: 'absolute', left: `${left * 100 / 7}%`, right: `${(6 - right) * 100 / 7}%`, marginHorizontal: theme.spacing[1], top: theme.layout.desktopControl + lane * theme.spacing[6], height: theme.spacing[5], justifyContent: 'center', borderRadius: theme.spacing[1], backgroundColor: labelTint(color), borderLeftWidth: theme.borderWidths.focus + 1, borderLeftColor: color, paddingHorizontal: theme.spacing[2] }}><Text variant="caption" numberOfLines={1} color="ink" style={{ fontWeight: '400', fontSize: theme.typography.tag.fontSize + 1 }}>{event.title}</Text></Pressable>;
        })}
      </View>;
    })}
  </View>;
}
