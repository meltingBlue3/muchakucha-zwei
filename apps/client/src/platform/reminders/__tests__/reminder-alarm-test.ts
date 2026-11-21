import * as Notifications from '../local-notifications';
import { cancelAllReminders, cancelLocalReminderNotifications, cancelReminder, onReminderOpened, scheduleReminder, scheduledReminderIds, takeLaunchReminderUrl } from '../reminder-notifications.native';
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

test('clearing ordinary reminders preserves local alarms', async () => {
  await scheduleReminder(reminder('reminder:task:a@1#x', true));
  await scheduleReminder(reminder('reminder:task:b@1#y', false));
  await cancelLocalReminderNotifications();
  expect(await scheduledReminderIds()).toEqual(['reminder:task:a@1#x']);
});

test('a visible push opens the event once even when it launches the app', async () => {
  const notifications = Notifications as typeof Notifications & {
    __respond(response: unknown): void;
    __setLastResponse(response: unknown): void;
  };
  const url = '/households/886213ab-50a9-43fa-a6d5-affa0732cc33/events/eb7b8d2f-34dd-40a0-ac9f-d52b5ca095bf';
  const response = {
    actionIdentifier: Notifications.DEFAULT_ACTION_IDENTIFIER,
    notification: { date: 123, request: { identifier: 'provider-id', content: { data: { reminderPush: true, url } } } },
  };
  const open = jest.fn();
  const stop = onReminderOpened(open);
  try {
    notifications.__setLastResponse(response);
    expect(await takeLaunchReminderUrl()).toBe(url);
    notifications.__respond(response);
    expect(open).not.toHaveBeenCalled();
    notifications.__respond({
      ...response,
      notification: { ...response.notification, date: 124 },
    });
    expect(open).toHaveBeenCalledWith(url);
  } finally {
    stop();
  }
});
