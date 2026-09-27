import { formatDateRange } from '../../features/events/calendar-utils';
import { formatDueDate } from '../../features/tasks/task-utils';
import { formatDate, formatDateTime } from '../date-values';

beforeAll(() => { jest.useFakeTimers({ now: new Date(2030, 5, 15, 12) }); });
afterAll(() => { jest.useRealTimers(); });

test('dates drop the year inside the current year and keep it outside', () => {
  expect(formatDate(new Date(2030, 5, 20))).toBe('6月20日');
  expect(formatDate(new Date(2031, 0, 3))).toBe('2031年1月3日');
  expect(formatDate(new Date(2030, 5, 20), { weekday: true })).toBe('6月20日周四');
  expect(formatDateTime(new Date(2030, 5, 20, 9, 5))).toBe('6月20日 09:05');
});

test('task due dates use the same display date', () => {
  expect(formatDueDate(new Date(2030, 5, 20).toISOString())).toBe('6月20日');
  expect(formatDueDate(null)).toBe('');
});

test('event ranges name both dates when they span days', () => {
  const at = (day: number, hour: number) => new Date(2030, 5, day, hour).toISOString();
  expect(formatDateRange(at(20, 9), at(20, 10), false)).toBe('6月20日 09:00 – 10:00');
  expect(formatDateRange(at(20, 22), at(21, 1), false)).toBe('6月20日 22:00 – 6月21日 01:00');
  expect(formatDateRange(at(20, 0), new Date(2030, 5, 20, 23, 59, 59).toISOString(), true)).toBe('6月20日 全天');
  expect(formatDateRange(at(20, 0), new Date(2030, 5, 22, 23, 59, 59).toISOString(), true)).toBe('6月20日 – 6月22日 全天');
});
