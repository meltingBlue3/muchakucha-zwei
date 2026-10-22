import type { UpcomingReminderDto } from '@muchakucha/api-client';
import { reminderChanges, reminderNotification } from '../reminder-plan';

function reminder(overrides: Partial<UpcomingReminderDto>): UpcomingReminderDto {
  return {
    key: 'task:t1', kind: 'task', householdId: 'h1', householdName: '小林之家', itemId: 't1', occurrenceDate: null,
    title: '交水费', at: new Date('2026-10-24T18:00:00').toISOString(), dateOnly: false,
    fireAt: new Date('2026-10-24T18:00:00').toISOString(), location: null,
    ...overrides,
  };
}

describe('reminderNotification', () => {
  test('says when, counted from the moment it appears, then where, then whose', () => {
    expect(reminderNotification(reminder({}), { showHousehold: false })).toMatchObject({
      title: '交水费', body: '今天 18:00 到期', kind: 'task', url: '/households/h1/tasks/t1',
      fireAt: new Date('2026-10-24T18:00:00'),
    });
    const event = reminder({
      key: 'event:e1', kind: 'event', itemId: 'e1', title: '带小宝打疫苗', location: '社区卫生服务中心',
      at: new Date('2026-10-25T15:30:00').toISOString(), fireAt: new Date('2026-10-24T15:30:00').toISOString(),
    });
    expect(reminderNotification(event, { showHousehold: true }).body).toBe('明天 15:30 开始 · 社区卫生服务中心 · 小林之家');
    expect(reminderNotification(reminder({ dateOnly: true, at: new Date('2026-10-27T00:00:00').toISOString() }), { showHousehold: false }).body)
      .toBe('10月27日到期');
    expect(reminderNotification(reminder({ kind: 'event', dateOnly: true, itemId: 'e2', at: new Date('2026-10-24T00:00:00').toISOString(), fireAt: new Date('2026-10-24T09:00:00').toISOString() }), { showHousehold: false }).body)
      .toBe('今天全天');
  });

  test('a series occurrence without a row yet opens its household\'s day', () => {
    expect(reminderNotification(reminder({ key: 'task:r1:2026-10-25', itemId: null, occurrenceDate: '2026-10-25' }), { showHousehold: false }).url)
      .toBe('/households/h1/today');
  });

  test('keeps its id while nothing it shows changes, and takes a new one when something does', () => {
    const first = reminderNotification(reminder({}), { showHousehold: false });
    expect(reminderNotification(reminder({}), { showHousehold: false }).id).toBe(first.id);
    expect(first.id.startsWith('reminder:task:t1@')).toBe(true);
    expect(reminderNotification(reminder({ title: '交电费' }), { showHousehold: false }).id).not.toBe(first.id);
    expect(reminderNotification(reminder({ fireAt: new Date('2026-10-24T17:30:00').toISOString() }), { showHousehold: false }).id).not.toBe(first.id);
    expect(reminderNotification(reminder({}), { showHousehold: true }).id).not.toBe(first.id);
  });
});

describe('reminderChanges', () => {
  test('cancels what is no longer wanted and adds only what is missing', () => {
    const keep = reminderNotification(reminder({}), { showHousehold: false });
    const add = reminderNotification(reminder({ key: 'task:t2', itemId: 't2', title: '取快递' }), { showHousehold: false });
    expect(reminderChanges([keep.id, 'reminder:task:gone@1#x'], [keep, add])).toEqual({ cancel: ['reminder:task:gone@1#x'], schedule: [add] });
  });
});
