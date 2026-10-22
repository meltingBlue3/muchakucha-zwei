import { AccessibilityInfo } from 'react-native';

type MockSecureStore = {
  __reset(): void;
};

const mediaPreferences = new Map<string, boolean>([
  ['(forced-colors: active)', false],
  ['(prefers-reduced-motion: reduce)', false],
]);

jest.mock('expo-secure-store', () => {
  const storedSecrets = new Map<string, string>();

  const getCurrentPlatform = (): typeof import('react-native').Platform => {
    const { Platform: currentPlatform } = jest.requireActual(
      'react-native',
    ) as typeof import('react-native');

    return currentPlatform;
  };

  const requireNativePlatform = (): void => {
    const currentPlatform = getCurrentPlatform();
    if (currentPlatform.OS === 'web') {
      throw new Error(
        'SecureStore is unavailable on Web; Web sessions must use HttpOnly cookies.',
      );
    }
  };

  // The native module rejects these keys, so the mock does too.
  const requireValidKey = (key: string): void => {
    if (!/^[\w.-]+$/.test(key)) {
      throw new Error(
        'Invalid key provided to SecureStore. Keys must not be empty and contain only alphanumeric characters, ".", "-", and "_".',
      );
    }
  };

  return {
    AFTER_FIRST_UNLOCK: 0,
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
    ALWAYS: 2,
    ALWAYS_THIS_DEVICE_ONLY: 3,
    WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: 4,
    WHEN_UNLOCKED: 5,
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
    __reset: (): void => storedSecrets.clear(),
    deleteItemAsync: jest.fn(async (key: string): Promise<void> => {
      requireNativePlatform();
      requireValidKey(key);
      storedSecrets.delete(key);
    }),
    getItemAsync: jest.fn(async (key: string): Promise<string | null> => {
      requireNativePlatform();
      requireValidKey(key);
      return storedSecrets.get(key) ?? null;
    }),
    isAvailableAsync: jest.fn(
      async (): Promise<boolean> => getCurrentPlatform().OS !== 'web',
    ),
    setItemAsync: jest.fn(async (key: string, value: string): Promise<void> => {
      requireNativePlatform();
      requireValidKey(key);
      storedSecrets.set(key, value);
    }),
  };
});

// expo-audio extends a native shared-object class at import time, which the
// Jest native-module mocks do not provide. Screens with a composer import it,
// so a recorder that never records stands in; voice tests mock the adapter.
jest.mock('expo-audio', () => ({
  AudioQuality: { MIN: 0, LOW: 32, MEDIUM: 64, HIGH: 96, MAX: 127 },
  IOSOutputFormat: { MPEG4AAC: 'aac ', LINEARPCM: 'lpcm' },
  getRecordingPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: true, status: 'undetermined', expires: 'never' })),
  requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: true, status: 'undetermined', expires: 'never' })),
  setAudioModeAsync: jest.fn(async () => undefined),
  useAudioRecorder: jest.fn(() => ({
    uri: null,
    prepareToRecordAsync: jest.fn(async () => undefined),
    record: jest.fn(),
    stop: jest.fn(async () => undefined),
    getStatus: jest.fn(() => ({ canRecord: false, isRecording: false, durationMillis: 0, mediaServicesDidReset: false, url: null })),
  })),
}));

// expo-notifications registers a push-token listener at import time and warns
// about Expo Go. Reminders only schedule local notifications, so an in-memory
// scheduler with a settable permission stands in; `__reset` runs before each test.
jest.mock('expo-notifications', () => {
  const scheduled = new Map<string, { identifier: string; content: unknown; trigger: unknown }>();
  const responseListeners = new Set<(mockResponse: unknown) => void>();
  let permission = { granted: true, status: 'granted', canAskAgain: true, expires: 'never' };
  let lastResponse: unknown = null;
  return {
    AndroidImportance: { HIGH: 4 },
    IosAuthorizationStatus: { PROVISIONAL: 3 },
    SchedulableTriggerInputTypes: { DATE: 'date' },
    DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
    __reset: (): void => {
      scheduled.clear();
      responseListeners.clear();
      permission = { granted: true, status: 'granted', canAskAgain: true, expires: 'never' };
      lastResponse = null;
    },
    __setPermission: (next: { granted: boolean; status: string; canAskAgain: boolean }): void => { permission = { ...next, expires: 'never' }; },
    __respond: (response: unknown): void => { for (const listener of responseListeners) listener(response); },
    __setLastResponse: (response: unknown): void => { lastResponse = response; },
    setNotificationHandler: (): void => undefined,
    setNotificationChannelAsync: async (): Promise<null> => null,
    getPermissionsAsync: async () => permission,
    requestPermissionsAsync: async () => permission,
    getAllScheduledNotificationsAsync: async () => [...scheduled.values()],
    scheduleNotificationAsync: async (request: { identifier: string; content: unknown; trigger: unknown }) => {
      scheduled.set(request.identifier, request);
      return request.identifier;
    },
    cancelScheduledNotificationAsync: async (identifier: string) => { scheduled.delete(identifier); },
    addNotificationResponseReceivedListener: (listener: (mockResponse: unknown) => void) => {
      responseListeners.add(listener);
      return { remove: () => responseListeners.delete(listener) };
    },
    getLastNotificationResponseAsync: async () => lastResponse,
    clearLastNotificationResponseAsync: async () => { lastResponse = null; },
  };
});

// React Native 0.86.2's getDevServer() reads NativeSourceCode's scriptURL and
// calls .match() on it with no null guard. Jest's default native-module mock
// resolves scriptURL to null, so any module that calls getDevServer() as an
// import-time side effect (e.g. expo-router's Navigator, via expo's Fast
// Refresh message socket) crashes the whole test file before a single test
// runs. Provide a fixed dev-server descriptor so that import-time call is safe.
jest.mock('react-native/Libraries/Core/Devtools/getDevServer', () => ({
  __esModule: true,
  default: () => ({
    url: 'http://localhost:8081/',
    fullBundleUrl: null,
    bundleLoadedFromServer: false,
  }),
}));

const rejectUnmockedRequest = (input: Parameters<typeof fetch>[0]) =>
  Promise.reject(new Error(`Unmocked network request: ${String(input)}`));

const unmockedFetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
  rejectUnmockedRequest,
);

Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  value: unmockedFetch,
  writable: true,
});

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: jest.fn((query: string): MediaQueryList => ({
    addEventListener: jest.fn(),
    addListener: jest.fn(),
    dispatchEvent: jest.fn(() => true),
    matches: mediaPreferences.get(query) ?? false,
    media: query,
    onchange: null,
    removeEventListener: jest.fn(),
    removeListener: jest.fn(),
  })),
  writable: true,
});

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  (jest.requireMock('expo-secure-store') as MockSecureStore).__reset();
  (jest.requireMock('expo-notifications') as MockSecureStore).__reset();
  unmockedFetch.mockReset().mockImplementation(rejectUnmockedRequest);
  mediaPreferences.set('(forced-colors: active)', false);
  mediaPreferences.set('(prefers-reduced-motion: reduce)', false);
});
