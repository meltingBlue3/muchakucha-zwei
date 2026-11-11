import type { RecurrenceDto, RecurrenceRuleListItemDto } from '@muchakucha/api-client';

import { draftFromRule, followStartDate, presetOf, presetRule, recurrenceInputFromResponse, ruleFromDraft } from '../recurrence-options';
import { recurrencePreview } from '../recurrence-preview';
import { formatRecurrenceSummary } from '../recurrence-summary';

// 2026-11-23 is lunar 十月十五; 2026-12-16 is 冬月初八.
const start = '2026-11-23';
const tz = 'Asia/Shanghai';

describe('lunar yearly repeat', () => {
  test('the lunar preset repeats on the start date\'s lunar day and is recognized again', () => {
    const rule = presetRule('lunarYearly', start, tz, null);
    expect(rule).toEqual({ freq: 'yearly', interval: 1, startsOn: start, timezone: tz, lunar: { month: 10, day: 15 } });
    expect(presetOf(rule, start)).toBe('lunarYearly');
    expect(presetOf(presetRule('yearly', start, tz, rule), start)).toBe('yearly');
    expect(presetRule('yearly', start, tz, rule).lunar).toBeUndefined();
  });

  test('moving the start date moves the lunar day; anchoring a split keeps it', () => {
    const rule = presetRule('lunarYearly', start, tz, null);
    expect(followStartDate(rule, '2026-12-16').lunar).toEqual({ month: 11, day: 8 });
    expect(followStartDate(rule, '2027-11-12', false).lunar).toEqual({ month: 10, day: 15 });
  });

  test('a custom yearly draft can follow the lunar calendar', () => {
    const draft = { ...draftFromRule(null, start), freq: 'yearly' as const, lunar: true };
    expect(ruleFromDraft(draft, start, tz, null)).toEqual({ freq: 'yearly', interval: 1, startsOn: start, timezone: tz, lunar: { month: 10, day: 15 } });
    expect(draftFromRule(presetRule('lunarYearly', start, tz, null), start).lunar).toBe(true);
  });

  test('a birthday turned into a weekly rule clears the birthday explicitly', () => {
    const birthday: RecurrenceDto = { ...presetRule('lunarYearly', start, tz, null), occasion: 'birthday', birthYear: 1968 };
    expect(presetRule('weekly', start, tz, birthday)).toMatchObject({ freq: 'weekly', occasion: null, birthYear: null });
    expect(presetRule('lunarYearly', start, tz, birthday)).toMatchObject({ occasion: 'birthday', birthYear: 1968 });
  });

  test('summaries name the lunar date, with a note for 三十', () => {
    expect(formatRecurrenceSummary(presetRule('lunarYearly', start, tz, null), tz).summary).toBe('每年农历十月十五重复');
    expect(formatRecurrenceSummary({ freq: 'yearly', interval: 2, startsOn: start, timezone: tz, lunar: { month: 12, day: 30 } }, tz)).toMatchObject({
      summary: '每 2 年的农历腊月三十重复',
      clampNote: '农历小月没有三十，会自动改到廿九。',
    });
  });

  test('a stored lunar rule comes back as a request with its marks', () => {
    const rule: RecurrenceRuleListItemDto = {
      id: 'rule', title: '妈妈的农历生日', kind: 'event', freq: 'yearly', interval: 1, byWeekday: [], startsOn: start, endsOn: null, count: null,
      timezone: tz, startTimeLocal: '00:00', durationMinutes: 1440, lunar: { month: 10, day: 15 }, occasion: 'birthday', birthYear: 1968,
      nextOccurrenceDate: start, updatedAt: '2026-11-11T00:00:00.000Z',
    };
    expect(recurrenceInputFromResponse(rule)).toMatchObject({ lunar: { month: 10, day: 15 }, occasion: 'birthday', birthYear: 1968 });
    expect(recurrencePreview(rule, 3)).toEqual(['2026-11-23', '2027-11-12', '2028-11-30']);
  });
});
