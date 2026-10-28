import * as Notifications from '../local-notifications';
import { cancelAllReminders, cancelReminder, scheduleReminder, scheduledReminderIds } from '../reminder-notifications.native';
import type { ReminderNotification } from '../reminder-types';

// A phone whose build has the alarm module.
const mockAlarms = new Map<string, ReminderNotification>();
jest.mock('../reminder-alarm', () => ({
  alarmsSupported: true,
  scheduledAlarmIds: jest.fn(async () => [...mockAlarms.keys()]),
  scheduleAlarm: jest.fn(async (notification: ReminderNotification) => { mockAlarms.set(notification.id, notification); }),
  cancelAlarm: jest.fn(async (id: string) => { mockAlarms.delete(id); }),
  cancelAllAlarms: jest.fn(async () => { mockAlarms.clear(); }),
}));

function reminder(id: string, alarm: boolean): ReminderNotification {
  return { id, kind: 'task', title: '吃药', body: '今天 18:00 到期', fireAt: new Date(Date.now() + 3_600_000), url: '/households/h1/tasks/t1', alarm };
}

async function notificationIds(): Promise<string[]> {
  return (await Notifications.getAllScheduledNotificationsAsync()).map(request => request.identifier);
}

beforeEach(() => mockAlarms.clear());

test('a reminder that rings is an alarm, and the rest stay notifications', async () => {
  await scheduleReminder(reminder('reminder:task:a@1#x', true));
  await scheduleReminder(reminder('reminder:task:b@1#y', false));
  expect([...mockAlarms.keys()]).toEqual(['reminder:task:a@1#x']);
  expect(await notificationIds()).toEqual(['reminder:task:b@1#y']);
  // Reconciling sees both, so neither is scheduled twice.
  expect((await scheduledReminderIds()).sort()).toEqual(['reminder:task:a@1#x', 'reminder:task:b@1#y']);
});

test('cancels an id wherever it is held, and signing out leaves neither', async () => {
  await scheduleReminder(reminder('reminder:task:a@1#x', true));
  await scheduleReminder(reminder('reminder:task:b@1#y', false));
  await scheduleReminder(reminder('reminder:task:c@1#z', true));
  await cancelReminder('reminder:task:a@1#x');
  expect([...mockAlarms.keys()]).toEqual(['reminder:task:c@1#z']);
  await cancelAllReminders();
  expect(await scheduledReminderIds()).toEqual([]);
});
