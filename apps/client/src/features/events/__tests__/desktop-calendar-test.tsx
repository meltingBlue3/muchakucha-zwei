import type { EventResponseDto } from '@muchakucha/api-client';
import { eventLastDate, monthSegments } from '../desktop-month';
import { timelineLanes } from '../desktop-today';

const event = (id: string, startTime: string, endTime: string): EventResponseDto => ({ id, householdId: 'home', title: id, startTime, endTime, allDay: true, description: null, location: null, labels: [], createdBy: 'user', createdAt: startTime, updatedAt: startTime, recurrenceRuleId: null, recurrence: null, myReminder: { mode: 'default', minutesBefore: null, alarm: null }, cancelledAt: null });

test('an exclusive midnight end does not paint another calendar day', () => {
  expect(eventLastDate(event('trip', '2026-11-09T00:00:00', '2026-11-12T00:00:00'))).toBe('2026-11-11');
});

test('a multiweek event is clipped to each week without repeating its title per day', () => {
  const trip = event('trip', '2026-11-07T00:00:00', '2026-11-13T00:00:00');
  expect(monthSegments([trip], '2026-11-02', '2026-11-08').map(({ start, end }) => [start, end])).toEqual([['2026-11-07', '2026-11-08']]);
  expect(monthSegments([trip], '2026-11-09', '2026-11-15').map(({ start, end }) => [start, end])).toEqual([['2026-11-09', '2026-11-12']]);
});

test('overlapping bars have separate lanes and later bars reuse the first free lane', () => {
  const entries = [event('a', '2026-11-09T00:00:00', '2026-11-12T00:00:00'), event('b', '2026-11-10T00:00:00', '2026-11-11T00:00:00'), event('c', '2026-11-12T00:00:00', '2026-11-14T00:00:00')];
  expect(monthSegments(entries, '2026-11-09', '2026-11-15').map(({ event, lane }) => [event.id, lane])).toEqual([['a', 0], ['b', 1], ['c', 0]]);
});

test('overlapping time blocks share width while a later block uses the whole timeline', () => {
  const entries = [event('a', '2026-11-10T09:00:00Z', '2026-11-10T11:00:00Z'), event('b', '2026-11-10T10:00:00Z', '2026-11-10T12:00:00Z'), event('c', '2026-11-10T13:00:00Z', '2026-11-10T14:00:00Z')];
  expect(timelineLanes(entries).map(({ event, lane, columns }) => [event.id, lane, columns])).toEqual([['a', 0, 2], ['b', 1, 2], ['c', 0, 1]]);
});
