import { useDesktopDensity } from './use-desktop';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import CalendarDays from 'lucide-react-native/icons/calendar';
import Pencil from 'lucide-react-native/icons/pencil';
import { Button, Inline, Stack, Text, TextField } from './primitives';
import { theme } from './theme';
import { daysSinceMonday, formatYearMonth, formatDayLabel, normalizeDateInput, normalizeTimeInput, parseDateValue, toDateValue, weekHeader } from './date-values';
import { useTranslation } from '../i18n';

/** Right-aligned 取消 / 确定, like a Material dialog. */
export function PickerActions({ onCancel, onConfirm, confirmLabel, confirmDisabled = false }: {
  onCancel(): void;
  onConfirm(): void;
  confirmLabel?: string;
  confirmDisabled?: boolean;
}) {
  const { t } = useTranslation('common');
  return (
    <Inline gap={2} style={{ justifyContent: 'flex-end', marginTop: theme.spacing[2] }}>
      <Button label={t('cancel')} tone="secondary" onPress={onCancel} />
      <Button label={confirmLabel ?? t('confirm')} disabled={confirmDisabled} onPress={onConfirm} />
    </Inline>
  );
}

/** A Monday-first month grid. `value` is "YYYY-MM-DD". */
export function CalendarGrid({ value, onSelect, compact = false, markedDates = [] }: { value: string; onSelect(value: string): void; compact?: boolean; markedDates?: string[] }) {
  const { t } = useTranslation('picker');
  const dense = useDesktopDensity();
  const target = compact || dense ? theme.layout.desktopControl : theme.controlSizes.touchTarget;
  const selected = parseDateValue(value);
  const [month, setMonth] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));
  useEffect(() => {
    setMonth(current => current.getFullYear() === selected.getFullYear() && current.getMonth() === selected.getMonth()
      ? current : new Date(selected.getFullYear(), selected.getMonth(), 1));
    // Follow the selection only when the value itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const today = toDateValue(new Date());
  // A desktop month fills its weeks with the neighbouring months' days, as a wall calendar does.
  const outside = compact || dense;
  const weeks = useMemo(() => {
    const leading = daysSinceMonday(month);
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells: Array<Date | null> = [
      ...Array.from({ length: leading }, (_, index) => outside ? new Date(month.getFullYear(), month.getMonth(), index - leading + 1) : null),
      ...Array.from({ length: days }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1)),
    ];
    while (cells.length % 7 !== 0) cells.push(outside ? new Date(month.getFullYear(), month.getMonth(), cells.length - leading + 1) : null);
    return Array.from({ length: cells.length / 7 }, (_, row) => cells.slice(row * 7, row * 7 + 7));
  }, [month, outside]);
  const shift = (delta: number) => setMonth(current => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  const monthLabel = formatYearMonth(month);
  const navButton = (label: string, delta: number, icon: React.ReactNode) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => shift(delta)} style={({ pressed }) => ({ width: target, height: target, borderRadius: theme.borderRadii.full, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.transparent })}>
      {icon}
    </Pressable>
  );
  return (
    <Stack gap={1}>
      <Inline>
        <Text variant="label" accessibilityLiveRegion="polite" style={{ flex: 1 }}>{monthLabel}</Text>
        {navButton(t('previousMonth'), -1, <ChevronLeft size={theme.controlSizes.icon} color={theme.colors.ink} />)}
        {navButton(t('nextMonth'), 1, <ChevronRight size={theme.controlSizes.icon} color={theme.colors.ink} />)}
      </Inline>
      <View style={{ flexDirection: 'row' }} importantForAccessibility="no-hide-descendants" aria-hidden>
        {weekHeader().map(day => <Text key={day} variant="caption" style={{ flex: 1, textAlign: 'center' }}>{day}</Text>)}
      </View>
      {weeks.map((week, row) => (
        <View key={row} style={{ flexDirection: 'row' }}>
          {week.map((day, column) => {
            if (!day) return <View key={column} style={{ flex: 1, height: target }} />;
            const dayValue = toDateValue(day);
            const isSelected = dayValue === value;
            const isToday = dayValue === today;
            const otherMonth = day.getMonth() !== month.getMonth();
            return (
              <View key={column} style={{ flex: 1, alignItems: 'center' }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={isToday ? t('today', { date: formatDayLabel(day) }) : formatDayLabel(day)}
                  accessibilityState={{ selected: isSelected }}
                  aria-pressed={isSelected}
                  onPress={() => onSelect(dayValue)}
                  style={({ pressed }) => ({
                    width: target - theme.spacing[1],
                    height: target - theme.spacing[1],
                    borderRadius: theme.borderRadii.full,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isSelected ? (isToday ? theme.colors.accent : theme.colors.primary) : isToday ? theme.colors.accentSoft : pressed ? theme.colors.surfaceMuted : theme.colors.transparent,
                  })}
                >
                  <Text variant="numeral" color={isSelected ? 'surface' : isToday ? 'accentStrong' : otherMonth ? 'inkFaint' : 'ink'} style={dense || compact ? { fontSize: theme.typography.meta.fontSize + 0.5 } : undefined}>{day.getDate()}</Text>{markedDates.includes(dayValue) ? <View style={{ position: 'absolute', bottom: 0, width: theme.spacing[1], height: theme.spacing[1], borderRadius: theme.borderRadii.full, backgroundColor: isSelected ? theme.colors.surface : theme.colors.inkMuted }} /> : null}
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}
    </Stack>
  );
}

/** Material-style date dialog content: headline, calendar or keyboard entry, and actions. */
export function DatePickerPanel({ value, onConfirm, onCancel }: { value: string; onConfirm(value: string): void; onCancel(): void }) {
  const { t } = useTranslation('picker');
  const [draft, setDraft] = useState(() => toDateValue(parseDateValue(value)));
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState(draft);
  const typed = normalizeDateInput(text);
  const current = typing ? typed : draft;
  const confirm = () => { if (current) onConfirm(current); };
  return (
    <Stack gap={3}>
      <Inline>
        <Text variant="heading" style={{ flex: 1 }}>{current ? formatDayLabel(parseDateValue(current)) : t('invalidDate')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(typing ? 'showCalendar' : 'showKeyboard')}
          onPress={() => {
            if (typing && typed) setDraft(typed);
            if (!typing) setText(draft);
            setTyping(!typing);
          }}
          style={({ pressed }) => ({ width: theme.controlSizes.touchTarget, height: theme.controlSizes.touchTarget, borderRadius: theme.borderRadii.full, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.transparent })}
        >
          {typing ? <CalendarDays size={theme.controlSizes.icon} color={theme.colors.ink} /> : <Pencil size={theme.controlSizes.icon} color={theme.colors.ink} />}
        </Pressable>
      </Inline>
      {typing ? (
        <TextField
          label={t('dateInput')}
          hint={t('dateHint')}
          value={text}
          onChangeText={setText}
          onSubmitEditing={confirm}
          autoFocus
          {...(text !== '' && !typed ? { error: t('dateError') } : {})}
        />
      ) : (
        <CalendarGrid value={draft} onSelect={setDraft} />
      )}
      <PickerActions onCancel={onCancel} onConfirm={confirm} confirmDisabled={!current} />
    </Stack>
  );
}

const TIME_SLOTS = Array.from({ length: 96 }, (_, index) => `${String(Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}`);

/**
 * Web time dialog content modeled on Google Calendar for the web: exact keyboard
 * entry plus quarter-hour choices; choosing a slot applies it immediately.
 */
export function TimePickerPanel({ value, onConfirm, onCancel }: { value: string; onConfirm(value: string): void; onCancel(): void }) {
  const { t } = useTranslation('picker');
  const [text, setText] = useState(value);
  const typed = normalizeTimeInput(text);
  const list = useRef<ScrollView>(null);
  const dense = useDesktopDensity();
  const rowHeight = dense ? theme.layout.desktopControl : theme.controlSizes.touchTarget;
  const nearest = useMemo(() => {
    const [h = 0, m = 0] = (normalizeTimeInput(value) ?? '09:00').split(':').map(Number);
    return Math.min(95, h * 4 + Math.floor(m / 15));
  }, [value]);
  return (
    <Stack gap={3}>
      <TextField
        label={t('timeInput')}
        hint={t('timeHint')}
        value={text}
        onChangeText={setText}
        onSubmitEditing={() => { if (typed) onConfirm(typed); }}
        {...(text !== '' && !typed ? { error: t('timeError') } : {})}
      />
      {/* Only the list scrolls (five rows at most), so the entry above and the actions below stay in view. */}
      <ScrollView
        ref={list}
        accessibilityRole="list"
        accessibilityLabel={t('timeSlots')}
        nestedScrollEnabled
        onLayout={() => list.current?.scrollTo({ y: Math.max(0, (nearest - 2) * rowHeight), animated: false })}
        style={{ maxHeight: rowHeight * 5, borderTopWidth: theme.borderWidths.default, borderTopColor: theme.colors.separator }}
      >
        {TIME_SLOTS.map(slot => {
          const isSelected = slot === value;
          return (
            <Pressable
              key={slot}
              accessibilityRole="button"
              accessibilityLabel={t('selectSlot', { time: slot })}
              accessibilityState={{ selected: isSelected }}
              onPress={() => onConfirm(slot)}
              style={({ pressed }) => ({ height: rowHeight, justifyContent: 'center', paddingHorizontal: theme.spacing[3], borderRadius: theme.borderRadii.sm, backgroundColor: isSelected ? theme.colors.surfaceSelected : pressed ? theme.colors.surfaceMuted : theme.colors.transparent })}
            >
              <Text variant={isSelected ? 'label' : 'body'}>{slot}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <PickerActions onCancel={onCancel} onConfirm={() => { if (typed) onConfirm(typed); }} confirmDisabled={!typed} />
    </Stack>
  );
}
