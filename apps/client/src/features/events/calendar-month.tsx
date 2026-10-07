import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { Theme } from '../../ui/theme';
import { Text } from '../../ui/primitives';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import { formatDayLabel, parseDateValue } from '../../ui/date-values';
import { getCalendarMonth, getDayNames, formatMonthLabel, type CalendarDay } from './calendar-utils';

/** What a detailed month cell shows for one event. */
export interface CalendarCellEvent {
  id: string;
  title: string;
  color: string;
}

interface CalendarMonthProps {
  year: number;
  month: number;
  eventsByDate: Map<string, number>;
  selectedDateIso: string | null;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onSelectDate: (dateIso: string) => void;
  /** `week` shows only the row holding the selected date, for phones. */
  mode?: 'month' | 'week';
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
  /** Offers 展开月历 / 收起月历 under the grid. */
  onToggleMode?: () => void;
  /** Event titles inside each day, for a month grid with room to show them. */
  eventTitlesByDate?: Map<string, CalendarCellEvent[]>;
  /** Without room for titles, each day's dot takes its first event's color. */
  eventColorsByDate?: Map<string, CalendarCellEvent[]>;
}

const TITLES_PER_DAY = 3;

/**
 * The month grid, or one week of it. A filled ink circle marks the selected
 * day and vermilion marks today; days with events carry a dot, or their titles
 * when the grid is wide enough.
 */
export function CalendarMonth({
  year,
  month,
  eventsByDate,
  selectedDateIso,
  onPrevMonth,
  onNextMonth,
  onSelectDate,
  mode = 'month',
  onPrevWeek,
  onNextWeek,
  onToggleMode,
  eventTitlesByDate,
  eventColorsByDate,
}: CalendarMonthProps) {
  const activeTheme = useTheme<Theme>();
  const dayNames = getDayNames();
  const calendar = useMemo(() => getCalendarMonth(year, month), [year, month]);
  const week = mode === 'week';
  const detailed = !week && eventTitlesByDate !== undefined;
  const weeks = week
    ? [calendar.weeks.find(row => row.some(day => day.iso === selectedDateIso)) ?? calendar.weeks.find(row => row.some(day => day.isToday)) ?? calendar.weeks[0]!]
    : calendar.weeks;
  const cellSize = activeTheme.controlSizes.touchTarget - activeTheme.spacing[3];

  const arrow = (label: string, Icon: typeof ChevronLeft, onPress: () => void) => (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
      style={({ pressed }) => ({
        backgroundColor: pressed ? activeTheme.colors.surfaceMuted : activeTheme.colors.transparent,
        borderRadius: activeTheme.borderRadii.full,
        minHeight: activeTheme.controlSizes.touchTarget,
        minWidth: activeTheme.controlSizes.touchTarget,
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      <Icon color={activeTheme.colors.inkMuted} size={activeTheme.controlSizes.icon} strokeWidth={activeTheme.controlSizes.iconStroke} />
    </Pressable>
  );

  const dayMark = (day: CalendarDay, selected: boolean, pressed: boolean) => (
    <View
      style={{
        width: cellSize,
        height: cellSize,
        borderRadius: activeTheme.borderRadii.full,
        alignItems: 'center',
        justifyContent: 'center',
        // Same marks as the date picker: a filled circle selects, vermilion marks today.
        backgroundColor: selected
          ? day.isToday ? activeTheme.colors.accent : activeTheme.colors.primary
          : pressed ? activeTheme.colors.surfaceMuted : activeTheme.colors.transparent,
      }}
    >
      <Text
        variant="numeral"
        color={selected ? 'surface' : day.isToday ? 'accent' : day.isCurrentMonth ? 'ink' : 'inkFaint'}
        style={day.isToday || selected ? { fontFamily: activeTheme.fontFamilies.numericStrong } : undefined}
      >
        {day.dayOfMonth}
      </Text>
    </View>
  );

  return (
    <View style={{ backgroundColor: activeTheme.colors.surface, borderRadius: activeTheme.borderRadii.lg, paddingHorizontal: activeTheme.spacing[2], paddingTop: activeTheme.spacing[1], paddingBottom: onToggleMode ? 0 : activeTheme.spacing[2] }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        {week && onPrevWeek ? arrow('上一周', ChevronLeft, onPrevWeek) : arrow('上一个月', ChevronLeft, onPrevMonth)}
        <Text variant="section" accessibilityRole="header" aria-level={2}>{formatMonthLabel(year, month)}</Text>
        {week && onNextWeek ? arrow('下一周', ChevronRight, onNextWeek) : arrow('下一个月', ChevronRight, onNextMonth)}
      </View>

      <View style={{ flexDirection: 'row', marginBottom: activeTheme.spacing[1] }}>
        {dayNames.map((name) => (
          <View key={name} style={{ flex: 1, alignItems: detailed ? 'flex-start' : 'center', paddingLeft: detailed ? activeTheme.spacing[1] : 0, paddingVertical: activeTheme.spacing[1] }}>
            <View style={{ width: cellSize, alignItems: 'center' }}><Text variant="caption" color="inkFaint">{name}</Text></View>
          </View>
        ))}
      </View>

      {weeks.map((row, weekIdx) => (
        <View key={weekIdx} style={{ flexDirection: 'row', ...(detailed ? { borderTopWidth: activeTheme.borderWidths.default, borderTopColor: activeTheme.colors.separator } : {}) }}>
          {row.map((day) => {
            const eventCount = eventsByDate.get(day.iso) ?? 0;
            const selected = day.iso === selectedDateIso;
            const titles = (eventTitlesByDate ?? eventColorsByDate)?.get(day.iso) ?? [];
            return (
              <Pressable
                key={day.iso}
                onPress={() => onSelectDate(day.iso)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                aria-pressed={selected}
                accessibilityLabel={`${formatDayLabel(parseDateValue(day.iso))}${day.isToday ? '，今天' : ''}${eventCount > 0 ? `，${eventCount}个日程` : ''}`}
                style={({ pressed }) => detailed
                  ? { flex: 1, minWidth: 0, minHeight: activeTheme.spacing[16] + activeTheme.spacing[6], padding: activeTheme.spacing[1], gap: activeTheme.spacing[1] / 2, backgroundColor: pressed ? activeTheme.colors.surfaceSubtle : activeTheme.colors.transparent }
                  : { flex: 1, minHeight: activeTheme.controlSizes.touchTarget + activeTheme.spacing[2], alignItems: 'center', paddingVertical: activeTheme.spacing[1] }}
              >
                {({ pressed }) => detailed ? <>
                  {dayMark(day, selected, false)}
                  {titles.slice(0, TITLES_PER_DAY).map(event => (
                    <View key={event.id} style={{ flexDirection: 'row', alignItems: 'center', gap: activeTheme.spacing[1], paddingHorizontal: activeTheme.spacing[1] }}>
                      <View style={{ width: activeTheme.spacing[1] + 1, height: activeTheme.spacing[1] + 1, borderRadius: activeTheme.borderRadii.full, backgroundColor: event.color }} />
                      <Text variant="caption" color={day.isCurrentMonth ? 'ink' : 'inkFaint'} numberOfLines={1} style={{ flex: 1, fontWeight: '400' }}>{event.title}</Text>
                    </View>
                  ))}
                  {titles.length > TITLES_PER_DAY ? <Text variant="caption" color="inkFaint" style={{ paddingHorizontal: activeTheme.spacing[1] }}>{`还有 ${titles.length - TITLES_PER_DAY} 项`}</Text> : null}
                </> : <>
                  {dayMark(day, selected, pressed)}
                  <View style={{ width: activeTheme.spacing[1] + 1, height: activeTheme.spacing[1] + 1, marginTop: activeTheme.spacing[1], borderRadius: activeTheme.borderRadii.full, backgroundColor: eventCount > 0 ? (titles[0]?.color ?? activeTheme.colors.inkFaint) : activeTheme.colors.transparent }} />
                </>}
              </Pressable>
            );
          })}
        </View>
      ))}

      {onToggleMode ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={week ? '展开月历' : '收起月历'}
          aria-expanded={!week}
          onPress={onToggleMode}
          style={({ pressed }) => ({ minHeight: activeTheme.controlSizes.touchTarget - activeTheme.spacing[2], alignItems: 'center', justifyContent: 'center', borderRadius: activeTheme.borderRadii.md, backgroundColor: pressed ? activeTheme.colors.surfaceMuted : activeTheme.colors.transparent })}
        >
          {week
            ? <ChevronDown color={activeTheme.colors.inkFaint} size={activeTheme.controlSizes.icon} strokeWidth={activeTheme.controlSizes.iconStroke} />
            : <ChevronUp color={activeTheme.colors.inkFaint} size={activeTheme.controlSizes.icon} strokeWidth={activeTheme.controlSizes.iconStroke} />}
        </Pressable>
      ) : null}
    </View>
  );
}
