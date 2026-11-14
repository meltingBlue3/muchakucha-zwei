import { useState } from 'react';
import { formatLunarDay, formatLunarMonth, formatLunarMonthDay } from '@muchakucha/lunar';

import { currentLanguage, useTranslation } from '../../i18n';
import { FilterOptions } from '../../ui/filter-options';
import { PickerActions } from '../../ui/picker-panels';
import { Stack } from '../../ui/primitives';
import { solarMonthDays, type BirthdayCalendar } from './birthday-dates';

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

/**
 * A birthday's month and day without a year: 正月 … 腊月 and 初一 … 三十 for a
 * lunar one, 1月 … 12月 and 1 … 31 for a Gregorian one. A Japanese interface
 * counts the lunar ones 一月 … 十二月 and 一日 … 三十日.
 */
export function MonthDayPicker({ calendar, month, day, onCancel, onDone }: {
  calendar: BirthdayCalendar;
  month: number;
  day: number;
  onCancel(): void;
  onDone(month: number, day: number): void;
}) {
  const { t } = useTranslation(['birthdays', 'common']);
  const language = currentLanguage();
  const [chosenMonth, setChosenMonth] = useState(month || 1);
  const [chosenDay, setChosenDay] = useState(day || 1);
  const lunar = calendar === 'lunar';
  const dayCount = lunar ? 30 : solarMonthDays(chosenMonth);
  const days = Array.from({ length: dayCount }, (_, index) => index + 1);
  const monthLabel = (value: number) => lunar ? formatLunarMonth(value, false, language) : t('picker.solarMonth', { month: value });
  const dayLabel = (value: number) => lunar ? formatLunarDay(value, language) : String(value);
  const dayName = (value: number) => lunar ? formatLunarMonthDay(chosenMonth, value, false, language) : t('picker.solarDay', { month: chosenMonth, day: value });
  const chooseMonth = (value: string) => {
    const next = Number(value);
    setChosenMonth(next);
    if (!lunar) setChosenDay(current => Math.min(current, solarMonthDays(next)));
  };
  return (
    <Stack gap={4}>
      <FilterOptions
        label={t(lunar ? 'picker.lunarMonth' : 'picker.month')}
        value={String(chosenMonth)}
        options={MONTHS.map(value => ({ value: String(value), label: monthLabel(value), name: monthLabel(value) }))}
        onChange={chooseMonth}
      />
      <FilterOptions
        label={t(lunar ? 'picker.lunarDay' : 'picker.day')}
        value={String(chosenDay)}
        options={days.map(value => ({ value: String(value), label: dayLabel(value), name: dayName(value) }))}
        onChange={value => setChosenDay(Number(value))}
      />
      <PickerActions onCancel={onCancel} onConfirm={() => onDone(chosenMonth, chosenDay)} confirmLabel={t('common:done')} />
    </Stack>
  );
}
