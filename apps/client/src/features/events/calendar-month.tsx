import { useTranslation } from '../../i18n';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { Theme } from '../../ui/theme';
import { Text } from '../../ui/primitives';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import { formatDayLabel } from '../../ui/date-values';
import { lunarLabelOn } from '../lunar/lunar-calendar';
import { eraYearOfMonth, holidayLabelOn, holidayNameOn } from '../wareki/japanese-calendar';
import { calendarDayName, getCalendarMonth, getDayNames, formatMonthLabel, toDateIso, type CalendarDay } from './calendar-utils';

/** What a detailed month cell shows for one event. */
export interface CalendarCellEvent {
  id: string;
  title: string;
  color: string;
}

interface CalendarMonthProps {
  todayIso?: string;
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
  /** Shows each day's lunar date, solar term or festival under its number. */
  lunar?: boolean;
  /** Marks Japan's holidays in vermilion, names them under the number, and adds the era year to the heading. */
  japanese?: boolean;
}

const TITLES_PER_DAY = 3;

/**
 * The month grid, or one week of it. A filled ink circle marks the selected
 * day and a pale vermilion one today; a holiday's number is vermilion. Days
 * with events carry a dot, or their titles when the grid is wide enough.
 */
export function CalendarMonth({
  todayIso = toDateIso(new Date()),
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
  lunar = false,
  japanese = false,
}: CalendarMonthProps) {
  const { t } = useTranslation('events');
  const activeTheme = useTheme<Theme>();
  const dayNames = getDayNames();
  const calendar = useMemo(() => getCalendarMonth(year, month, todayIso), [year, month, todayIso]);
  const week = mode === 'week';
  const detailed = !week && eventTitlesByDate !== undefined;
  const weeks = week
    ? [calendar.weeks.find(row => row.some(day => day.iso === selectedDateIso)) ?? calendar.weeks.find(row => row.some(day => day.isToday)) ?? calendar.weeks[0]!]
    : calendar.weeks;
  const cellSize = activeTheme.controlSizes.touchTarget - activeTheme.spacing[3];
  /** A line of small text sits by each number. */
  const labelled = lunar || japanese;
  const eraYear = japanese ? eraYearOfMonth(year, month) : null;

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

  // Android flattens a View with no background away, and when a later update
  // gives it a color, rebuilds it from that update alone: the radius is lost
  // and the mark turns square. Keeping the mark a real view keeps its radius.
  const dayMark = (day: CalendarDay, selected: boolean, pressed: boolean) => (
    <View
      collapsable={false}
      style={{
        width: cellSize,
        height: cellSize,
        // Half the size, not `full`: Android draws an oversized radius as a square.
        borderRadius: cellSize / 2,
        alignItems: 'center',
        justifyContent: 'center',
        // Same marks as the date picker: a filled circle selects, and today's is vermilion, pale until selected.
        backgroundColor: selected
          ? day.isToday ? activeTheme.colors.accent : activeTheme.colors.primary
          : day.isToday ? activeTheme.colors.accentSoft : pressed ? activeTheme.colors.surfaceMuted : activeTheme.colors.transparent,
      }}
    >
      <Text
        variant="numeral"
        color={selected ? 'surface' : day.isToday ? 'accentStrong' : !day.isCurrentMonth ? 'inkFaint' : japanese && holidayNameOn(day.iso) !== null ? 'accent' : 'ink'}
        style={day.isToday || selected ? { fontFamily: activeTheme.fontFamilies.numericStrong } : undefined}
      >
        {day.dayOfMonth}
      </Text>
    </View>
  );

  // A holiday's name takes the place of the lunar text, in vermilion like its
  // number. Festivals, solar terms and the first of a lunar month stand out in ink.
  const dayLabel = (day: CalendarDay) => {
    const holiday = japanese ? holidayLabelOn(day.iso) : null;
    const label = holiday === null && lunar ? lunarLabelOn(day.iso) : null;
    const text = holiday ?? label?.text ?? null;
    // An empty line keeps the event dots of a row level.
    if (text === null) return detailed ? null : <View style={{ height: activeTheme.typography.lunarDay.lineHeight }} />;
    const name = (
      <Text
        numberOfLines={1}
        color={!day.isCurrentMonth ? 'inkFaint' : holiday !== null ? 'accent' : label?.kind !== 'day' ? 'ink' : 'inkFaint'}
        style={{ ...activeTheme.typography.lunarDay, fontFamily: activeTheme.fontFamilies.regular }}
      >
        {text}
      </Text>
    );
    // Four characters are a hair wider than a cell on a 320px screen, so under
    // the number the text gets the gaps beside the cell as well.
    return detailed ? name : <View style={{ alignSelf: 'stretch', alignItems: 'center', marginHorizontal: -activeTheme.spacing[1] }}>{name}</View>;
  };

  return (
    <View style={{ backgroundColor: activeTheme.colors.surface, borderRadius: activeTheme.borderRadii.lg, paddingHorizontal: activeTheme.spacing[2], paddingTop: activeTheme.spacing[1], paddingBottom: onToggleMode ? 0 : activeTheme.spacing[2] }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        {week && onPrevWeek ? arrow(t('previousWeek'), ChevronLeft, onPrevWeek) : arrow(t('previousMonth'), ChevronLeft, onPrevMonth)}
        <View style={{ alignItems: 'center' }}>
          <Text variant="section" accessibilityRole="header" aria-level={2}>{formatMonthLabel(year, month)}</Text>
          {eraYear ? <Text variant="caption" color="inkFaint" style={{ fontWeight: '400' }}>{eraYear}</Text> : null}
        </View>
        {week && onNextWeek ? arrow(t('nextWeek'), ChevronRight, onNextWeek) : arrow(t('nextMonth'), ChevronRight, onNextMonth)}
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
                accessibilityLabel={calendarDayName(formatDayLabel(day.date), day.isToday, eventCount, japanese ? holidayNameOn(day.iso) : null)}
                style={({ pressed }) => detailed
                  ? { flex: 1, minWidth: 0, minHeight: activeTheme.spacing[16] + activeTheme.spacing[6], padding: activeTheme.spacing[1], gap: activeTheme.spacing[1] / 2, backgroundColor: pressed ? activeTheme.colors.surfaceSubtle : activeTheme.colors.transparent }
                  : { flex: 1, minHeight: activeTheme.controlSizes.touchTarget + activeTheme.spacing[2] + (labelled ? activeTheme.typography.lunarDay.lineHeight : 0), alignItems: 'center', paddingVertical: activeTheme.spacing[1] }}
              >
                {({ pressed }) => detailed ? <>
                  {labelled ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: activeTheme.spacing[1] }}>{dayMark(day, selected, false)}{dayLabel(day)}</View> : dayMark(day, selected, false)}
                  {titles.slice(0, TITLES_PER_DAY).map(event => (
                    <View key={event.id} style={{ flexDirection: 'row', alignItems: 'center', gap: activeTheme.spacing[1], paddingHorizontal: activeTheme.spacing[1] }}>
                      <View style={{ width: activeTheme.spacing[1] + 1, height: activeTheme.spacing[1] + 1, borderRadius: activeTheme.borderRadii.full, backgroundColor: event.color }} />
                      <Text variant="caption" color={day.isCurrentMonth ? 'ink' : 'inkFaint'} numberOfLines={1} style={{ flex: 1, fontWeight: '400' }}>{event.title}</Text>
                    </View>
                  ))}
                  {titles.length > TITLES_PER_DAY ? <Text variant="caption" color="inkFaint" style={{ paddingHorizontal: activeTheme.spacing[1] }}>{t('more', { count: titles.length - TITLES_PER_DAY })}</Text> : null}
                </> : <>
                  {dayMark(day, selected, pressed)}
                  {labelled ? dayLabel(day) : null}
                  <View collapsable={false} style={{ width: activeTheme.spacing[1] + 1, height: activeTheme.spacing[1] + 1, marginTop: labelled ? activeTheme.spacing[1] / 2 : activeTheme.spacing[1], borderRadius: activeTheme.borderRadii.full, backgroundColor: eventCount > 0 ? (titles[0]?.color ?? activeTheme.colors.inkFaint) : activeTheme.colors.transparent }} />
                </>}
              </Pressable>
            );
          })}
        </View>
      ))}

      {onToggleMode ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={week ? t('expandMonth') : t('collapseMonth')}
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
