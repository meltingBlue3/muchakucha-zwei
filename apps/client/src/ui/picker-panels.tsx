import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import CalendarDays from 'lucide-react-native/icons/calendar';
import Pencil from 'lucide-react-native/icons/pencil';
import { Button, Inline, Stack, Text, TextField } from './primitives';
import { theme } from './theme';
import { formatDayLabel, normalizeDateInput, normalizeTimeInput, parseDateValue, toDateValue } from './date-values';

const WEEK_HEADER = ['一', '二', '三', '四', '五', '六', '日'] as const;

/** Right-aligned 取消 / 确定, like a Material dialog. */
export function PickerActions({ onCancel, onConfirm, confirmLabel = '确定', confirmDisabled = false }: {
  onCancel(): void;
  onConfirm(): void;
  confirmLabel?: string;
  confirmDisabled?: boolean;
}) {
  return (
    <Inline gap={2} style={{ justifyContent: 'flex-end', marginTop: theme.spacing[2] }}>
      <Button label="取消" tone="secondary" onPress={onCancel} />
      <Button label={confirmLabel} disabled={confirmDisabled} onPress={onConfirm} />
    </Inline>
  );
}

/** A Monday-first month grid. `value` is "YYYY-MM-DD". */
export function CalendarGrid({ value, onSelect }: { value: string; onSelect(value: string): void }) {
  const selected = parseDateValue(value);
  const [month, setMonth] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));
  useEffect(() => {
    setMonth(current => current.getFullYear() === selected.getFullYear() && current.getMonth() === selected.getMonth()
      ? current : new Date(selected.getFullYear(), selected.getMonth(), 1));
    // Follow the selection only when the value itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const today = toDateValue(new Date());
  const weeks = useMemo(() => {
    const leading = (month.getDay() + 6) % 7;
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells: Array<Date | null> = [
      ...Array.from({ length: leading }, () => null),
      ...Array.from({ length: days }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1)),
    ];
    while (cells.length % 7 !== 0) cells.push(null);
    return Array.from({ length: cells.length / 7 }, (_, row) => cells.slice(row * 7, row * 7 + 7));
  }, [month]);
  const shift = (delta: number) => setMonth(current => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  const monthLabel = `${month.getFullYear()}年${month.getMonth() + 1}月`;
  const navButton = (label: string, delta: number, icon: React.ReactNode) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => shift(delta)} style={({ pressed }) => ({ width: theme.controlSizes.touchTarget, height: theme.controlSizes.touchTarget, borderRadius: theme.borderRadii.full, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.transparent })}>
      {icon}
    </Pressable>
  );
  return (
    <Stack gap={1}>
      <Inline>
        <Text variant="label" accessibilityLiveRegion="polite" style={{ flex: 1 }}>{monthLabel}</Text>
        {navButton('上个月', -1, <ChevronLeft size={theme.controlSizes.icon} color={theme.colors.ink} />)}
        {navButton('下个月', 1, <ChevronRight size={theme.controlSizes.icon} color={theme.colors.ink} />)}
      </Inline>
      <View style={{ flexDirection: 'row' }} importantForAccessibility="no-hide-descendants" aria-hidden>
        {WEEK_HEADER.map(day => <Text key={day} variant="caption" style={{ flex: 1, textAlign: 'center' }}>{day}</Text>)}
      </View>
      {weeks.map((week, row) => (
        <View key={row} style={{ flexDirection: 'row' }}>
          {week.map((day, column) => {
            if (!day) return <View key={column} style={{ flex: 1, height: theme.controlSizes.touchTarget }} />;
            const dayValue = toDateValue(day);
            const isSelected = dayValue === value;
            const isToday = dayValue === today;
            return (
              <View key={column} style={{ flex: 1, alignItems: 'center' }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${formatDayLabel(day)}${isToday ? '，今天' : ''}`}
                  accessibilityState={{ selected: isSelected }}
                  aria-pressed={isSelected}
                  onPress={() => onSelect(dayValue)}
                  style={({ pressed }) => ({
                    width: theme.controlSizes.touchTarget - theme.spacing[1],
                    height: theme.controlSizes.touchTarget - theme.spacing[1],
                    borderRadius: theme.borderRadii.full,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: isToday && !isSelected ? theme.borderWidths.default : 0,
                    borderColor: theme.colors.coral,
                    backgroundColor: isSelected ? theme.colors.coral : pressed ? theme.colors.surfaceMuted : theme.colors.transparent,
                  })}
                >
                  <Text color={isSelected ? 'surface' : isToday ? 'coral' : 'ink'}>{day.getDate()}</Text>
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
  const [draft, setDraft] = useState(() => toDateValue(parseDateValue(value)));
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState(draft);
  const typed = normalizeDateInput(text);
  const current = typing ? typed : draft;
  const confirm = () => { if (current) onConfirm(current); };
  return (
    <Stack gap={3}>
      <Inline>
        <Text variant="heading" style={{ flex: 1 }}>{current ? formatDayLabel(parseDateValue(current)) : '日期无效'}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={typing ? '切换到日历' : '切换到键盘输入'}
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
          label="输入日期"
          hint="例如 2026-09-28"
          value={text}
          onChangeText={setText}
          onSubmitEditing={confirm}
          autoFocus
          {...(text !== '' && !typed ? { error: '请输入有效的日期，例如 2026-09-28。' } : {})}
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
  const [text, setText] = useState(value);
  const typed = normalizeTimeInput(text);
  const list = useRef<ScrollView>(null);
  const rowHeight = theme.controlSizes.touchTarget;
  const nearest = useMemo(() => {
    const [h = 0, m = 0] = (normalizeTimeInput(value) ?? '09:00').split(':').map(Number);
    return Math.min(95, h * 4 + Math.floor(m / 15));
  }, [value]);
  return (
    <Stack gap={3}>
      <TextField
        label="输入时间"
        hint="24 小时制，例如 14:30"
        value={text}
        onChangeText={setText}
        onSubmitEditing={() => { if (typed) onConfirm(typed); }}
        {...(text !== '' && !typed ? { error: '请输入有效的时间，例如 14:30。' } : {})}
      />
      <PickerActions onCancel={onCancel} onConfirm={() => { if (typed) onConfirm(typed); }} confirmDisabled={!typed} />
      {/* Only the list scrolls, so keyboard entry and actions stay in view. */}
      <ScrollView
        ref={list}
        accessibilityRole="list"
        accessibilityLabel="可选时间"
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
              accessibilityLabel={`选择 ${slot}`}
              accessibilityState={{ selected: isSelected }}
              onPress={() => onConfirm(slot)}
              style={({ pressed }) => ({ height: rowHeight, justifyContent: 'center', paddingHorizontal: theme.spacing[3], borderRadius: theme.borderRadii.sm, backgroundColor: isSelected ? theme.colors.coralSoft : pressed ? theme.colors.surfaceMuted : theme.colors.transparent })}
            >
              <Text variant={isSelected ? 'label' : 'body'}>{slot}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </Stack>
  );
}
