// Built inside the factory: the adapter asks for the module as soon as it loads.
jest.mock('expo', () => {
  const native = {
    schedule: jest.fn(async (..._args: unknown[]) => undefined),
    scheduledIds: jest.fn(async () => ['reminder:task:a@1#x']),
    canUseFullScreen: jest.fn(() => false),
  };
  return { requireOptionalNativeModule: () => native };
});

import { alarmCanCoverLockScreen, alarmsSupported, scheduleAlarm, scheduledAlarmIds } from '../reminder-alarm.android';

const mockNative = (jest.requireMock('expo') as { requireOptionalNativeModule(): { schedule: jest.Mock<Promise<undefined>, unknown[]> } }).requireOptionalNativeModule();

test('hands the native module the moment and a deep link that opens the item', async () => {
  expect(alarmsSupported).toBe(true);
  await scheduleAlarm({ id: 'reminder:task:a@1#x', kind: 'task', title: '吃药', body: '今天 18:00 到期', fireAt: new Date(1_900_000_000_000), url: '/households/h1/tasks/t1', alarm: true });
  expect(mockNative.schedule).toHaveBeenCalledWith('reminder:task:a@1#x', 1_900_000_000_000, '吃药', '今天 18:00 到期', 'muchakucha-zwei://households/h1/tasks/t1');
  // Expo Router reads the host and path of an app-scheme link as the route.
  const link = new URL(String(mockNative.schedule.mock.calls[0]?.[4]));
  expect(`${link.host}${link.pathname}`).toBe('households/h1/tasks/t1');
});

test('passes the stored ids and the lock-screen answer through', async () => {
  expect(await scheduledAlarmIds()).toEqual(['reminder:task:a@1#x']);
  expect(alarmCanCoverLockScreen()).toBe(false);
});
