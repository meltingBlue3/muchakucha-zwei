import type { RecurrenceRuleListItemDto } from '@muchakucha/api-client';
import { recurrencePreview } from '../recurrence-preview';

const rule: RecurrenceRuleListItemDto = { id: 'rule', title: '月末整理', kind: 'task', freq: 'monthly', interval: 1, startsOn: '2026-01-31', endsOn: null, count: null, timezone: 'Asia/Shanghai', byWeekday: [], startTimeLocal: null, durationMinutes: null, lunar: null, occasion: null, birthYear: null, nextOccurrenceDate: '2026-01-31', updatedAt: '2026-01-01T00:00:00Z' };

test('month-end previews clamp without moving the original day anchor', () => {
  expect(recurrencePreview(rule, 3)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
});
test('count is the total series bound, not five more dates from today', () => {
  expect(recurrencePreview({ ...rule, count: 3, nextOccurrenceDate: '2026-03-31' })).toEqual(['2026-03-31']);
});
test('weekly intervals preserve the series week and include multiple chosen weekdays', () => {
  expect(recurrencePreview({ ...rule, freq: 'weekly', startsOn: '2026-11-10', nextOccurrenceDate: '2026-11-10', interval: 2, byWeekday: [2, 4], endsOn: '2026-11-24' })).toEqual(['2026-11-10', '2026-11-12', '2026-11-24']);
});
test('a leap-day series returns to February 29 in the next leap year', () => {
  expect(recurrencePreview({ ...rule, freq: 'yearly', startsOn: '2024-02-29', nextOccurrenceDate: '2025-02-28' }, 4)).toEqual(['2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']);
});
