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
      storedSecrets.delete(key);
    }),
    getItemAsync: jest.fn(async (key: string): Promise<string | null> => {
      requireNativePlatform();
      return storedSecrets.get(key) ?? null;
    }),
    isAvailableAsync: jest.fn(
      async (): Promise<boolean> => getCurrentPlatform().OS !== 'web',
    ),
    setItemAsync: jest.fn(async (key: string, value: string): Promise<void> => {
      requireNativePlatform();
      storedSecrets.set(key, value);
    }),
  };
});

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
  unmockedFetch.mockReset().mockImplementation(rejectUnmockedRequest);
  mediaPreferences.set('(forced-colors: active)', false);
  mediaPreferences.set('(prefers-reduced-motion: reduce)', false);
});
