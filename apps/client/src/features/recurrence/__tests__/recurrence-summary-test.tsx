import type { RecurrenceDto } from '@muchakucha/api-client';
import { render } from '@testing-library/react-native';

import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import {
  formatRecurrenceSummary,
  RecurrenceSummary,
} from '../recurrence-summary';

const baseRule: RecurrenceDto = {
  freq: 'daily',
  startsOn: '2026-08-12',
  timezone: 'Asia/Shanghai',
};

describe('recurrence summary formatting', () => {
  test.each([
    [{ ...baseRule, freq: 'daily' }, '每天重复'],
    [{ ...baseRule, freq: 'weekly', byWeekday: [3] }, '每周三重复'],
    [{ ...baseRule, freq: 'weekly', byWeekday: [6, 2, 4] }, '每周二、四、六重复'],
    [{ ...baseRule, freq: 'monthly' }, '每月 12 日重复'],
    [{ ...baseRule, freq: 'yearly' }, '每年 8 月 12 日重复'],
  ] satisfies [RecurrenceDto, string][])('formats %j as a Chinese summary', (rule, expected) => {
    expect(formatRecurrenceSummary(rule, 'Asia/Shanghai').summary).toBe(expected);
  });

  test('appends mutually exclusive ending conditions', () => {
    expect(
      formatRecurrenceSummary({ ...baseRule, endsOn: '2027-08-12' }, 'Asia/Shanghai').summary,
    ).toBe('每天重复，到 2027-08-12 为止');
    expect(formatRecurrenceSummary({ ...baseRule, count: 10 }, 'Asia/Shanghai').summary).toBe(
      '每天重复，共 10 次',
    );
  });

  test.each(['2026-08-29', '2026-08-30', '2026-08-31'])(
    'explains monthly clamping for %s',
    (startsOn) => {
      expect(
        formatRecurrenceSummary(
          { ...baseRule, freq: 'monthly', startsOn },
          'Asia/Shanghai',
        ).clampNote,
      ).toBe('有些月份没有这一天，会自动改到当月最后一天。');
    },
  );

  test('does not show the monthly note for safe dates or other frequencies', () => {
    expect(
      formatRecurrenceSummary(
        { ...baseRule, freq: 'monthly', startsOn: '2026-08-28' },
        'Asia/Shanghai',
      ).clampNote,
    ).toBeNull();
    expect(
      formatRecurrenceSummary(
        { ...baseRule, freq: 'yearly', startsOn: '2026-08-31' },
        'Asia/Shanghai',
      ).clampNote,
    ).toBeNull();
  });

  test('shows a timezone note only when the rule differs from the device', () => {
    expect(formatRecurrenceSummary(baseRule, 'Asia/Shanghai').timeZoneNote).toBeNull();
    expect(formatRecurrenceSummary({ ...baseRule, timezone: 'Asia/Tokyo' }, 'Asia/Shanghai').timeZoneNote).toBe(
      '按 Asia/Tokyo 的日期重复。',
    );
  });

  test('never exposes recurrence implementation vocabulary', () => {
    const output = JSON.stringify(
      formatRecurrenceSummary(
        { ...baseRule, freq: 'weekly', byWeekday: [2, 4, 6], count: 10 },
        'Asia/Shanghai',
      ),
    );
    expect(output).not.toMatch(/RRULE|FREQ|BYDAY|interval|occurrenceDate/);
  });
});

describe('RecurrenceSummary', () => {
  test('renders summary, clamp explanation, and timezone note together', async () => {
    const view = await render(
      <MuchakuchaThemeProvider>
        <RecurrenceSummary
          rule={{ ...baseRule, freq: 'monthly', startsOn: '2026-08-31', timezone: 'Asia/Tokyo' }}
          deviceTimeZone="Asia/Shanghai"
        />
      </MuchakuchaThemeProvider>,
    );

    expect(view.getByText('每月 31 日重复')).toBeTruthy();
    expect(view.getByText('有些月份没有这一天，会自动改到当月最后一天。')).toBeTruthy();
    expect(view.getByText('按 Asia/Tokyo 的日期重复。')).toBeTruthy();
    expect(view.getByLabelText('每月 31 日重复').props.numberOfLines).toBe(2);
  });
});
