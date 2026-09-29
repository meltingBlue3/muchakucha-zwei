import type { RecurrenceDto } from '@muchakucha/api-client';

import { draftFromRule, followStartDate, moveDraftStart, presetOf, presetRule, ruleFromDraft, validateDraft, withDraftStart } from '../recurrence-options';
import { formatRecurrenceSummary } from '../recurrence-summary';

// 2026-09-27 is a Sunday (weekday 0).
const start = '2026-09-27';
const tz = 'Asia/Shanghai';

describe('Google-style repeat presets', () => {
  test('recognizes each preset and treats anything else as custom', () => {
    expect(presetOf(null, start)).toBe('none');
    for (const freq of ['daily', 'weekly', 'monthly', 'yearly'] as const) {
      expect(presetOf(presetRule(freq, start, tz, null), start)).toBe(freq);
    }
    const weekly = presetRule('weekly', start, tz, null);
    expect(presetOf({ ...weekly, byWeekday: [0, 2] }, start)).toBe('custom');
    expect(presetOf({ ...weekly, interval: 2 }, start)).toBe('custom');
    expect(presetOf({ ...weekly, count: 4 }, start)).toBe('custom');
    expect(presetOf({ ...weekly, endsOn: '2026-12-31' }, start)).toBe('custom');
  });

  test('a preset clears endings and keeps server-owned series fields', () => {
    const previous: RecurrenceDto = { freq: 'weekly', interval: 3, byWeekday: [1, 3], startsOn: start, timezone: tz, count: 5, startTimeLocal: '08:30', durationMinutes: 60 };
    expect(presetRule('monthly', start, tz, previous)).toEqual({ freq: 'monthly', interval: 1, startsOn: start, timezone: tz, startTimeLocal: '08:30', durationMinutes: 60 });
    expect(presetRule('weekly', start, tz, null).byWeekday).toEqual([0]);
  });

  test('a single-day weekly rule follows the start date; a custom day set stays put', () => {
    const weekly = presetRule('weekly', start, tz, null);
    expect(followStartDate(weekly, '2026-09-29')).toMatchObject({ startsOn: '2026-09-29', byWeekday: [2] });
    const custom = { ...weekly, byWeekday: [1, 3] };
    expect(followStartDate(custom, '2026-09-29')).toMatchObject({ startsOn: '2026-09-29', byWeekday: [1, 3] });
    expect(followStartDate(weekly, start)).toBe(weekly);
  });

  test('anchoring an existing rule to a new split date keeps its weekday', () => {
    const monday = { ...presetRule('weekly', '2026-09-28', tz, null) };
    expect(followStartDate(monday, '2026-10-04', false)).toMatchObject({ startsOn: '2026-10-04', byWeekday: [1] });
  });
});

describe('custom repeat drafts', () => {
  test('round-trips an interval, sorted weekdays and a count', () => {
    const draft = { ...draftFromRule(null, start), intervalText: '2', byWeekday: [3, 1, 3], ending: 'count' as const, countText: '4' };
    expect(validateDraft(draft, start)).toEqual({});
    expect(ruleFromDraft(draft, start, tz, null)).toEqual({ freq: 'weekly', interval: 2, byWeekday: [1, 3], startsOn: start, timezone: tz, count: 4 });
  });

  test('drops fields that do not apply to the chosen unit and ending', () => {
    const draft = { ...draftFromRule(null, start), freq: 'monthly' as const, ending: 'date' as const, endsOn: '2027-01-31', countText: '9' };
    expect(ruleFromDraft(draft, start, tz, null)).toEqual({ freq: 'monthly', interval: 1, startsOn: start, timezone: tz, endsOn: '2027-01-31' });
  });

  test('reports every invalid field', () => {
    const draft = { ...draftFromRule(null, start), intervalText: '53', byWeekday: [], ending: 'date' as const, endsOn: start };
    expect(validateDraft(draft, start)).toEqual({
      interval: '间隔需要在 1 到 52 之间。',
      byWeekday: '至少需要选择一天。',
      endsOn: '截止日期必须晚于开始日期。',
    });
    expect(validateDraft({ ...draft, intervalText: '1', byWeekday: [0], ending: 'count', countText: '0' }, start)).toEqual({ count: '重复次数需要在 1 到 1000 之间。' });
  });

  test('summaries mention the interval only when it is above one', () => {
    const rule = (patch: Partial<RecurrenceDto>): RecurrenceDto => ({ freq: 'daily', interval: 1, startsOn: start, timezone: tz, ...patch });
    expect(formatRecurrenceSummary(rule({}), tz).summary).toBe('每天重复');
    expect(formatRecurrenceSummary(rule({ interval: 3 }), tz).summary).toBe('每 3 天重复');
    expect(formatRecurrenceSummary(rule({ freq: 'weekly', interval: 2, byWeekday: [1, 3] }), tz).summary).toBe('每 2 周的周一、三重复');
    expect(formatRecurrenceSummary(rule({ freq: 'monthly', interval: 2, count: 4 }), tz).summary).toBe('每 2 个月的 27 日重复，共 4 次');
  });
});

describe('a rule that owns its start', () => {
  test('the draft starts from the rule, else the default date, with no time', () => {
    expect(draftFromRule(null, '2026-09-29')).toMatchObject({ startsOn: '2026-09-29', startTime: '', byWeekday: [2] });
    const rule: RecurrenceDto = { freq: 'daily', startsOn: '2026-10-05', startTimeLocal: '12:00', timezone: 'Asia/Shanghai' };
    expect(draftFromRule(rule, '2026-09-29')).toMatchObject({ startsOn: '2026-10-05', startTime: '12:00' });
  });

  test('moving the start carries a single start-weekday rule along, not a chosen set', () => {
    const draft = draftFromRule(null, '2026-09-29');
    expect(moveDraftStart(draft, '2026-10-01').byWeekday).toEqual([4]);
    expect(moveDraftStart({ ...draft, byWeekday: [1, 3] }, '2026-10-01').byWeekday).toEqual([1, 3]);
  });

  test('applies the chosen start date and time, and clears a removed time', () => {
    const draft = { ...draftFromRule(null, '2026-09-29'), startsOn: '2026-10-05', startTime: '12:00' };
    const rule = withDraftStart(ruleFromDraft(draft, draft.startsOn, 'Asia/Shanghai', null), draft);
    expect(rule).toMatchObject({ startsOn: '2026-10-05', startTimeLocal: '12:00' });
    expect(withDraftStart(rule, { ...draft, startTime: '' })).not.toHaveProperty('startTimeLocal');
  });
});
