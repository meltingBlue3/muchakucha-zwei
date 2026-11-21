import type { PushTokenListener } from 'expo-notifications/build/TokenEmitter';

jest.mock('expo', () => ({ isRunningInExpoGo: () => false }));

const mockGetExpoPushToken = jest.fn();
jest.mock('expo-notifications/build/getExpoPushTokenAsync', () => ({
  getExpoPushTokenAsync: () => mockGetExpoPushToken(),
}));

const mockAddPushTokenListener = jest.fn<void, [PushTokenListener]>();
jest.mock('expo-notifications/build/TokenEmitter', () => ({
  addPushTokenListener: (listener: PushTokenListener) => mockAddPushTokenListener(listener),
}));
jest.mock('expo-notifications/build/getDevicePushTokenAsync', () => ({
  getDevicePushTokenAsync: () => Promise.resolve({ data: 'android:original', type: 'android' }),
}));

test('requests another sync when the first Expo token arrives after the local fallback', async () => {
  jest.useFakeTimers();
  const previousFlag = process.env.EXPO_PUBLIC_REMINDER_PUSH_ENABLED;
  process.env.EXPO_PUBLIC_REMINDER_PUSH_ENABLED = 'true';
  try {
    let deliverToken: (value: { data: string }) => void = () => undefined;
    mockGetExpoPushToken.mockImplementation(() => new Promise(resolve => { deliverToken = resolve; }));
    const { getReminderPushToken } = jest.requireActual<typeof import('../reminder-push.native')>('../reminder-push.native');
    const requestSync = jest.fn();

    const first = getReminderPushToken(requestSync);
    await jest.advanceTimersByTimeAsync(5_000);
    await expect(first).resolves.toBeNull();
    expect(requestSync).not.toHaveBeenCalled();

    deliverToken({ data: 'ExpoPushToken[device]' });
    await expect(getReminderPushToken(requestSync)).resolves.toBe('ExpoPushToken[device]');
    expect(requestSync).toHaveBeenCalledTimes(1);
  } finally {
    if (previousFlag === undefined) delete process.env.EXPO_PUBLIC_REMINDER_PUSH_ENABLED;
    else process.env.EXPO_PUBLIC_REMINDER_PUSH_ENABLED = previousFlag;
    jest.useRealTimers();
  }
});

test('selects the Firebase token on Android and requests registration when the token rotates', async () => {
  const originalFlag = process.env.EXPO_PUBLIC_REMINDER_PUSH_ENABLED;
  const originalFcmFlag = process.env.EXPO_PUBLIC_REMINDER_FCM_ENABLED;
  jest.doMock('react-native', () => ({ Platform: { OS: 'android' } }));
  process.env.EXPO_PUBLIC_REMINDER_PUSH_ENABLED = 'true';
  process.env.EXPO_PUBLIC_REMINDER_FCM_ENABLED = 'true';
  try {
    const requestSync = jest.fn();
    await jest.isolateModulesAsync(async () => {
      const adapter = jest.requireActual<typeof import('../reminder-push.native')>('../reminder-push.native');
      expect(adapter.reminderPushProvider).toBe('fcm');
      await expect(adapter.getReminderPushToken(requestSync)).resolves.toBe('android:original');

      expect(mockAddPushTokenListener).toHaveBeenCalledTimes(1);
      const [notify] = mockAddPushTokenListener.mock.calls[0]!;
      notify({ data: 'android:rotated', type: 'android' });
      expect(requestSync).toHaveBeenCalledTimes(1);
      await expect(adapter.getReminderPushToken(requestSync)).resolves.toBe('android:rotated');
    });
  } finally {
    jest.dontMock('react-native');
    if (originalFlag === undefined) delete process.env.EXPO_PUBLIC_REMINDER_PUSH_ENABLED;
    else process.env.EXPO_PUBLIC_REMINDER_PUSH_ENABLED = originalFlag;
    if (originalFcmFlag === undefined) delete process.env.EXPO_PUBLIC_REMINDER_FCM_ENABLED;
    else process.env.EXPO_PUBLIC_REMINDER_FCM_ENABLED = originalFcmFlag;
  }
});
