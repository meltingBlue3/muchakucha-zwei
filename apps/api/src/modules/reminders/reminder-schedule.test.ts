import { describe, expect, test } from 'vitest';
import { DEFAULT_REMINDER_SETTINGS, planReminders, wallClock, type ReminderCandidate } from './reminder-schedule.js';

const SHANGHAI = 'Asia/Shanghai';
// 2026-10-24 10:00 in Shanghai.
const NOW = new Date('2026-10-24T02:00:00.000Z');

function candidate(overrides: Partial<ReminderCandidate>): ReminderCandidate {
  return {
    key: 'task:a', kind: 'task', householdId: 'h', householdName: '小林之家', itemId: 'a', occurrenceDate: null,
    title: '交水费', at: new Date('2026-10-24T10:00:00.000Z'), allDay: false, location: null, minutesBefore: undefined,
    alarm: null, ...overrides,
  };
}

function plan(candidates: ReminderCandidate[], defaults = DEFAULT_REMINDER_SETTINGS, timeZone = SHANGHAI) {
  return planReminders(candidates, defaults, { now: NOW, timeZone });
}

describe('planReminders', () => {
  test('a timed task fires at its due time and an event 15 minutes before it starts, by default', () => {
    const planned = plan([
      candidate({}),
      candidate({ key: 'event:b', kind: 'event', itemId: 'b', title: '打疫苗', at: new Date('2026-10-24T07:30:00.000Z') }),
    ]);
    expect(planned.map(item => [item.key, item.fireAt.toISOString(), item.dateOnly])).toEqual([
      ['event:b', '2026-10-24T07:15:00.000Z', false],
      ['task:a', '2026-10-24T10:00:00.000Z', false],
    ]);
  });

  test('date-only items count back from the date-only time on their own local day', () => {
    // Local midnight of 10-25 in Shanghai, as the task form stores a date without a time.
    const dueDay = new Date('2026-10-24T16:00:00.000Z');
    const planned = plan([
      candidate({ at: dueDay }),
      candidate({ key: 'task:c', itemId: 'c', at: dueDay, minutesBefore: 1440 }),
      candidate({ key: 'event:d', kind: 'event', itemId: 'd', at: dueDay, allDay: true }),
    ], { ...DEFAULT_REMINDER_SETTINGS, dateOnlyTime: '20:00' });
    expect(planned.map(item => [item.key, item.fireAt.toISOString(), item.dateOnly])).toEqual([
      // The day before at 20:00 local.
      ['task:c', '2026-10-24T12:00:00.000Z', true],
      // Following the defaults, an all-day event fires at the date-only time too.
      ['event:d', '2026-10-25T12:00:00.000Z', true],
      ['task:a', '2026-10-25T12:00:00.000Z', true],
    ]);
  });

  test('an all-day event uses the date-only time even when it was stored at another hour', () => {
    const planned = plan([candidate({ kind: 'event', key: 'event:e', at: new Date('2026-10-25T04:00:00.000Z'), allDay: true })]);
    expect(planned[0]?.fireAt.toISOString()).toBe('2026-10-25T01:00:00.000Z');
  });

  test('a personal choice wins over the default, and null turns one reminder off', () => {
    const planned = plan([
      candidate({ minutesBefore: 30 }),
      candidate({ key: 'task:off', itemId: 'off', minutesBefore: null }),
    ]);
    expect(planned.map(item => [item.key, item.fireAt.toISOString()])).toEqual([['task:a', '2026-10-24T09:30:00.000Z']]);
  });

  test('defaults of null silence everything that follows them', () => {
    const planned = plan([
      candidate({}),
      candidate({ key: 'event:b', kind: 'event', itemId: 'b' }),
      candidate({ key: 'task:own', itemId: 'own', minutesBefore: 60 }),
    ], { taskMinutesBefore: null, eventMinutesBefore: null, dateOnlyTime: '09:00', alarm: false });
    expect(planned.map(item => item.key)).toEqual(['task:own']);
  });

  test('each reminder rings by its own choice, or by the default when it has none', () => {
    const items = [
      candidate({}),
      candidate({ key: 'task:ring', itemId: 'ring', alarm: true }),
      candidate({ key: 'task:quiet', itemId: 'quiet', alarm: false }),
    ];
    const ringing = (defaults: typeof DEFAULT_REMINDER_SETTINGS) => plan(items, defaults).map(item => [item.key, item.alarm]);
    expect(ringing(DEFAULT_REMINDER_SETTINGS)).toEqual([['task:a', false], ['task:quiet', false], ['task:ring', true]]);
    expect(ringing({ ...DEFAULT_REMINDER_SETTINGS, alarm: true })).toEqual([['task:a', true], ['task:quiet', false], ['task:ring', true]]);
  });

  test('nothing already past is sent late, and nothing beyond seven days is scheduled yet', () => {
    const planned = plan([
      candidate({ key: 'task:past', at: new Date('2026-10-24T01:59:00.000Z') }),
      candidate({ key: 'task:now', at: NOW }),
      candidate({ key: 'task:edge', at: new Date('2026-10-31T02:00:00.000Z') }),
      candidate({ key: 'task:late', at: new Date('2026-10-31T02:01:00.000Z') }),
      // Due beyond the window, but the reminder itself falls inside it.
      candidate({ key: 'task:early', at: new Date('2026-11-01T02:00:00.000Z'), minutesBefore: 1440 }),
    ]);
    expect(planned.map(item => item.key)).toEqual(['task:early', 'task:edge']);
  });

  test('keeps the nearest reminders, in a stable order, up to the limit', () => {
    const same = new Date('2026-10-24T12:00:00.000Z');
    const planned = planReminders(
      [candidate({ key: 'task:z', at: same }), candidate({ key: 'task:y', at: same }), candidate({ key: 'task:x', at: new Date('2026-10-25T12:00:00.000Z') })],
      DEFAULT_REMINDER_SETTINGS,
      { now: NOW, timeZone: SHANGHAI, limit: 2 },
    );
    expect(planned.map(item => item.key)).toEqual(['task:y', 'task:z']);
  });

  test('the date-only time is a wall-clock time across a daylight-saving change', () => {
    // 2027-03-14 is the spring-forward day in New York; local midnight is still EST.
    const planned = planReminders(
      [candidate({ at: new Date('2027-03-14T05:00:00.000Z') })],
      DEFAULT_REMINDER_SETTINGS,
      { now: new Date('2027-03-13T12:00:00.000Z'), timeZone: 'America/New_York' },
    );
    // 09:00 EDT, after the change.
    expect(planned[0]?.fireAt.toISOString()).toBe('2027-03-14T13:00:00.000Z');
  });
});

describe('wallClock', () => {
  test('reads midnight as minute zero, not 24:00', () => {
    expect(wallClock(new Date('2026-10-24T16:00:00.000Z'), SHANGHAI)).toEqual({ date: { year: 2026, month: 10, day: 25 }, minutes: 0 });
  });
});
