import { useCallback, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { Theme } from '../../ui/theme';
import { Text } from '../../ui/primitives';
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
    <View>
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
          hitSlop={activeTheme.spacing[3]}
          style={({ pressed }) => ({
            opacity: pressed ? 0.6 : 1,
            padding: activeTheme.spacing[2],
          })}
        >
          <Text variant="label" color="coral">
            ‹
          </Text>
        </Pressable>
        <Text variant="heading">{formatMonthLabel(year, month)}</Text>
        <Pressable
          onPress={onNextMonth}
          accessibilityLabel="下一个月"
          hitSlop={activeTheme.spacing[3]}
          style={({ pressed }) => ({
            opacity: pressed ? 0.6 : 1,
            padding: activeTheme.spacing[2],
          })}
        >
          <Text variant="label" color="coral">
            ›
          </Text>
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
                accessibilityLabel={`${day.dayOfMonth}日${eventCount > 0 ? `，${eventCount}个事件` : ''}`}
                style={({ pressed }) => ({
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: activeTheme.spacing[1],
                  opacity: day.isCurrentMonth ? (pressed ? 0.7 : 1) : 0.35,
                  backgroundColor: isSelected
                    ? activeTheme.colors.coralSoft
                    : 'transparent',
                  borderRadius: activeTheme.borderRadii.sm,
                })}
              >
                <View
                  style={{
                    width: DAY_CELL_SIZE,
                    height: DAY_CELL_SIZE,
                    borderRadius: DAY_CELL_SIZE / 2,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: day.isToday
                      ? activeTheme.colors.coral
                      : 'transparent',
                  }}
                >
                  <Text
                    variant="bodySm"
                    color={day.isToday ? 'surface' : day.isCurrentMonth ? 'ink' : 'inkMuted'}
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
