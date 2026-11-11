import { useState } from 'react';
import { formatLunarDay, formatLunarMonth } from '@muchakucha/lunar';

import { FilterOptions } from '../../ui/filter-options';
import { PickerActions } from '../../ui/picker-panels';
import { Stack } from '../../ui/primitives';
import { solarMonthDays, type BirthdayCalendar } from './birthday-dates';

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

/**
 * A birthday's month and day without a year: 正月 … 腊月 and 初一 … 三十 for a
 * lunar one, 1月 … 12月 and 1 … 31 for a Gregorian one.
 */
export function MonthDayPicker({ calendar, month, day, onCancel, onDone }: {
  calendar: BirthdayCalendar;
  month: number;
  day: number;
  onCancel(): void;
  onDone(month: number, day: number): void;
}) {
  const [chosenMonth, setChosenMonth] = useState(month || 1);
  const [chosenDay, setChosenDay] = useState(day || 1);
  const lunar = calendar === 'lunar';
  const dayCount = lunar ? 30 : solarMonthDays(chosenMonth);
  const days = Array.from({ length: dayCount }, (_, index) => index + 1);
  const monthLabel = (value: number) => lunar ? formatLunarMonth(value) : `${value}月`;
  const dayLabel = (value: number) => lunar ? formatLunarDay(value) : String(value);
  const chooseMonth = (value: string) => {
    const next = Number(value);
    setChosenMonth(next);
    if (!lunar) setChosenDay(current => Math.min(current, solarMonthDays(next)));
  };
  return (
    <Stack gap={4}>
      <FilterOptions
        label={lunar ? '农历月份' : '月份'}
        value={String(chosenMonth)}
        options={MONTHS.map(value => ({ value: String(value), label: monthLabel(value), name: monthLabel(value) }))}
        onChange={chooseMonth}
      />
      <FilterOptions
        label={lunar ? '农历日子' : '日子'}
        value={String(chosenDay)}
        options={days.map(value => ({ value: String(value), label: dayLabel(value), name: `${monthLabel(chosenMonth)}${lunar ? '' : ' '}${dayLabel(value)}${lunar ? '' : '日'}` }))}
        onChange={value => setChosenDay(Number(value))}
      />
      <PickerActions onCancel={onCancel} onConfirm={() => onDone(chosenMonth, chosenDay)} confirmLabel="完成" />
    </Stack>
  );
}
