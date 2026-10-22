import type { UpcomingReminderDto } from '@muchakucha/api-client';
import * as Notifications from 'expo-notifications';
import { syncReminders } from '../reminder-sync';

const mockListUpcomingReminders = jest.fn();
let mockToken: string | null = 'access-token';
jest.mock('../../auth/session-runtime', () => ({
  sessionApiClient: { listUpcomingReminders: (...args: unknown[]) => mockListUpcomingReminders(...args) },
  sessionTransport: { getAccessToken: () => Promise.resolve(mockToken) },
}));
jest.mock('../../households/household-context', () => ({ useHouseholdContext: () => ({ households: [] }) }));

const notifications = Notifications as typeof Notifications & {
  __setPermission(next: { granted: boolean; status: string; canAskAgain: boolean }): void;
};

function upcoming(key: string, title: string, at: string): UpcomingReminderDto {
  return {
    key, kind: 'task', householdId: 'h1', householdName: '小林之家', itemId: key.split(':')[1] ?? null, occurrenceDate: null,
    title, at, dateOnly: false, fireAt: at, location: null,
  };
}

async function scheduled() {
  return (await Notifications.getAllScheduledNotificationsAsync()).map(request => ({
    title: request.content.title,
    date: (request.trigger as { date: Date }).date.toISOString(),
    url: (request.content.data as { url: string }).url,
  }));
}

beforeEach(() => {
  mockToken = 'access-token';
  mockListUpcomingReminders.mockReset();
});

test('schedules what the server lists and later drops what it no longer lists', async () => {
  const at = new Date(Date.now() + 3_600_000).toISOString();
  mockListUpcomingReminders.mockResolvedValueOnce({ reminders: [upcoming('task:a', '交水费', at), upcoming('task:b', '取快递', at)] });
  await syncReminders();
  expect(mockListUpcomingReminders).toHaveBeenCalledWith('access-token', expect.any(String));
  expect((await scheduled()).map(item => item.title).sort()).toEqual(['交水费', '取快递']);

  mockListUpcomingReminders.mockResolvedValueOnce({ reminders: [upcoming('task:b', '取快递', at)] });
  await syncReminders();
  expect(await scheduled()).toEqual([{ title: '取快递', date: at, url: '/households/h1/tasks/b' }]);
});

test('leaves notifications alone that are not reminders', async () => {
  await Notifications.scheduleNotificationAsync({ identifier: 'other', content: { title: '别的' }, trigger: null });
  mockListUpcomingReminders.mockResolvedValueOnce({ reminders: [] });
  await syncReminders();
  expect((await Notifications.getAllScheduledNotificationsAsync()).map(request => request.identifier)).toEqual(['other']);
});

test('without permission or a session it neither asks the server nor schedules', async () => {
  notifications.__setPermission({ granted: false, status: 'denied', canAskAgain: true });
  await syncReminders();
  notifications.__setPermission({ granted: true, status: 'granted', canAskAgain: true });
  mockToken = null;
  await syncReminders();
  expect(mockListUpcomingReminders).not.toHaveBeenCalled();
});

test('a failed request keeps the reminders already scheduled', async () => {
  const at = new Date(Date.now() + 3_600_000).toISOString();
  mockListUpcomingReminders.mockResolvedValueOnce({ reminders: [upcoming('task:a', '交水费', at)] });
  await syncReminders();
  mockListUpcomingReminders.mockRejectedValueOnce(new Error('offline'));
  await syncReminders();
  expect((await scheduled()).map(item => item.title)).toEqual(['交水费']);
});

test('a request during a run is served by one more run, not a parallel one', async () => {
  const at = new Date(Date.now() + 3_600_000).toISOString();
  let release: (value: { reminders: UpcomingReminderDto[] }) => void = () => undefined;
  mockListUpcomingReminders
    .mockImplementationOnce(() => new Promise(resolve => { release = resolve; }))
    .mockResolvedValueOnce({ reminders: [upcoming('task:b', '取快递', at)] });
  const first = syncReminders();
  const second = syncReminders();
  const third = syncReminders();
  // The first run reaches the server only after reading the permission and token.
  while (mockListUpcomingReminders.mock.calls.length === 0) await new Promise(resolve => setTimeout(resolve, 0));
  release({ reminders: [upcoming('task:a', '交水费', at)] });
  await Promise.all([first, second, third]);
  expect(mockListUpcomingReminders).toHaveBeenCalledTimes(2);
  expect((await scheduled()).map(item => item.title)).toEqual(['取快递']);
});
