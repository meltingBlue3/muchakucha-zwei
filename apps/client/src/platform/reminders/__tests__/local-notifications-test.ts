// Expo Go has the local scheduler but not the remote topic subscription module.
// Load the real JS entry points so a barrel import cannot hide that mismatch.
jest.unmock('expo-notifications');
jest.unmock('../local-notifications');
jest.mock('expo-notifications/build/TopicSubscriptionModule', () => {
  throw new Error("Cannot find native module 'ExpoTopicSubscriptionModule'");
});
jest.mock('expo-notifications/build/NotificationScheduler', () => ({
  __esModule: true,
  default: { scheduleNotificationAsync: jest.fn(async (id: string) => id) },
}));

import NotificationScheduler from 'expo-notifications/build/NotificationScheduler';

test('local reminders load and schedule without the remote push native module', async () => {
  const { scheduleReminder } = jest.requireActual<typeof import('../reminder-notifications.native')>('../reminder-notifications.native');
  const fireAt = new Date(Date.now() + 60_000);
  await scheduleReminder({ id: 'reminder:local-test', kind: 'task', title: '真机提醒测试', body: '今天到期', fireAt, url: '/households/h1/tasks/t1', alarm: false });
  expect(NotificationScheduler.scheduleNotificationAsync).toHaveBeenCalledWith(
    'reminder:local-test',
    expect.objectContaining({ title: '真机提醒测试' }),
    expect.objectContaining({ type: 'date', timestamp: fireAt.getTime() }),
  );
});
