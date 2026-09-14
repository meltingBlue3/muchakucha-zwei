import { useCallback, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { Theme } from '../../ui/theme';
import { Text } from '../../ui/primitives';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import { getCalendarMonth, getDayNames, formatMonthLabel, type CalendarDay } from './calendar-utils';

const DAY_CELL_SIZE = 36;
const DOT_SIZE = 6;

interface CalendarMonthProps {
  year: number;
  month: number;
  eventsByDate: Map<string, number>;
  selectedDateIso: string | null;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onSelectDate: (dateIso: string) => void;
}

export function CalendarMonth({
  year,
  month,
  eventsByDate,
  selectedDateIso,
  onPrevMonth,
  onNextMonth,
  onSelectDate,
}: CalendarMonthProps) {
  const activeTheme = useTheme<Theme>();
  const dayNames = getDayNames();
  const calendar = useMemo(() => getCalendarMonth(year, month), [year, month]);

  const handleSelectDay = useCallback(
    (day: CalendarDay) => {
      onSelectDate(day.iso);
    },
    [onSelectDate],
  );

  return (
    <View style={{ backgroundColor: activeTheme.colors.surface, borderRadius: activeTheme.borderRadii.xl, padding: activeTheme.spacing[3], borderWidth: activeTheme.borderWidths.default, borderColor: activeTheme.colors.separator }}>
      {/* Month header */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: activeTheme.spacing[4],
        }}
      >
        <Pressable
          onPress={onPrevMonth}
          accessibilityLabel="上一个月"
          accessibilityRole="button"
          hitSlop={activeTheme.spacing[3]}
          style={({ pressed }) => ({
            opacity: pressed ? 0.6 : 1,
            padding: activeTheme.spacing[2],
            minHeight: activeTheme.controlSizes.touchTarget,
            minWidth: activeTheme.controlSizes.touchTarget,
            alignItems: 'center',
            justifyContent: 'center',
          })}
        >
          <ChevronLeft color={activeTheme.colors.coral} size={activeTheme.controlSizes.icon} />
        </Pressable>
        <Text variant="body" style={{ fontWeight: '600', flexShrink: 1 }}>{formatMonthLabel(year, month)}</Text>
        <Pressable
          onPress={onNextMonth}
          accessibilityLabel="下一个月"
          accessibilityRole="button"
          hitSlop={activeTheme.spacing[3]}
          style={({ pressed }) => ({
            opacity: pressed ? 0.6 : 1,
            padding: activeTheme.spacing[2],
            minHeight: activeTheme.controlSizes.touchTarget,
            minWidth: activeTheme.controlSizes.touchTarget,
            alignItems: 'center',
            justifyContent: 'center',
          })}
        >
          <ChevronRight color={activeTheme.colors.coral} size={activeTheme.controlSizes.icon} />
        </Pressable>
      </View>

      {/* Day name headers */}
      <View
        style={{
          flexDirection: 'row',
          marginBottom: activeTheme.spacing[2],
        }}
      >
        {dayNames.map((name) => (
          <View
            key={name}
            style={{
              flex: 1,
              alignItems: 'center',
              paddingVertical: activeTheme.spacing[1],
            }}
          >
            <Text variant="caption">{name}</Text>
          </View>
        ))}
      </View>

      {/* Weeks */}
      {calendar.weeks.map((week, weekIdx) => (
        <View key={weekIdx} style={{ flexDirection: 'row' }}>
          {week.map((day) => {
            const eventCount = eventsByDate.get(day.iso) ?? 0;
            const isSelected = day.iso === selectedDateIso;

            return (
              <Pressable
                key={day.iso}
                onPress={() => handleSelectDay(day)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${day.iso}${day.isToday ? '，今天' : ''}${eventCount > 0 ? `，${eventCount}个事件` : ''}`}
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: activeTheme.controlSizes.touchTarget + activeTheme.spacing[2],
                  alignItems: 'center',
                  paddingVertical: activeTheme.spacing[1],
                  opacity: pressed ? 0.7 : 1,
                  backgroundColor: isSelected
                    ? activeTheme.colors.coralSoft
                    : 'transparent',
                  borderRadius: activeTheme.borderRadii.sm,
                })}
              >
                <View
                  style={{
                    minWidth: DAY_CELL_SIZE,
                    minHeight: DAY_CELL_SIZE,
                    borderRadius: DAY_CELL_SIZE / 2,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isSelected
                      ? activeTheme.colors.coral
                      : 'transparent',
                  }}
                >
                  <Text
                    variant="bodySm"
                    color={isSelected ? 'surface' : day.isToday ? 'coral' : day.isCurrentMonth ? 'ink' : 'inkMuted'}
                  >
                    {day.dayOfMonth}
                  </Text>
                </View>
                {eventCount > 0 && (
                  <View
                    style={{
                      width: DOT_SIZE,
                      height: DOT_SIZE,
                      borderRadius: DOT_SIZE / 2,
                      backgroundColor: activeTheme.colors.teal,
                      marginTop: activeTheme.spacing[0] + 2,
                    }}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
