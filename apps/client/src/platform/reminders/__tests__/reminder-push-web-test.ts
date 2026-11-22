const { webcrypto } = jest.requireActual<{ webcrypto: Crypto }>('node:crypto');

async function newPublicKey() {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return new Uint8Array(await webcrypto.subtle.exportKey('raw', pair.publicKey));
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

let publicKey: Uint8Array;
let p256dh: Uint8Array;
const auth = webcrypto.getRandomValues(new Uint8Array(16));
const endpoint = 'https://fcm.googleapis.com/fcm/send/web-test';
let expected: { token: string; keys: { p256dh: string; auth: string } };
const originalKey = process.env.EXPO_PUBLIC_REMINDER_WEB_PUSH_KEY;
const globals = new Map<PropertyKey, PropertyDescriptor | undefined>();

function mockGlobal(key: PropertyKey, value: unknown) {
  globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, value });
}

function subscription(applicationServerKey: Uint8Array) {
  return {
    endpoint,
    options: { applicationServerKey: new Uint8Array(applicationServerKey).buffer },
    getKey: jest.fn((name: PushEncryptionKeyName) => new Uint8Array(name === 'auth' ? auth : p256dh).buffer),
    unsubscribe: jest.fn(async () => true),
  };
}

function browser(permission: NotificationPermission = 'granted', existing: ReturnType<typeof subscription> | null = null) {
  const notification = {
    permission,
    requestPermission: jest.fn(async (): Promise<NotificationPermission> => {
      notification.permission = 'granted';
      return notification.permission;
    }),
  };
  const registration = {
    pushManager: {
      getSubscription: jest.fn(async () => existing),
      subscribe: jest.fn(async () => subscription(publicKey)),
    },
  };
  const serviceWorker = {
    register: jest.fn(async () => registration),
    ready: Promise.resolve(registration),
    getRegistration: jest.fn(async () => registration),
    addEventListener: jest.fn<void, [string, (message: MessageEvent) => void]>(),
    removeEventListener: jest.fn(),
  };
  mockGlobal('window', globalThis);
  mockGlobal('navigator', { serviceWorker });
  mockGlobal('Notification', notification);
  mockGlobal('PushManager', jest.fn());
  return { notification, serviceWorker, pushManager: registration.pushManager };
}

beforeEach(async () => {
  [publicKey, p256dh] = await Promise.all([newPublicKey(), newPublicKey()]);
  expected = { token: endpoint, keys: { p256dh: base64Url(p256dh), auth: base64Url(auth) } };
  process.env.EXPO_PUBLIC_REMINDER_WEB_PUSH_KEY = base64Url(publicKey);
});

afterEach(() => {
  for (const [key, descriptor] of globals) {
    if (descriptor === undefined) Reflect.deleteProperty(globalThis, key);
    else Object.defineProperty(globalThis, key, descriptor);
  }
  globals.clear();
  if (originalKey === undefined) delete process.env.EXPO_PUBLIC_REMINDER_WEB_PUSH_KEY;
  else process.env.EXPO_PUBLIC_REMINDER_WEB_PUSH_KEY = originalKey;
});

test('asks for permission immediately and creates the first subscription in the same call', async () => {
  const { notification, serviceWorker, pushManager } = browser('default');
  await jest.isolateModulesAsync(async () => {
    const device = jest.requireActual<typeof import('../reminder-notifications.web')>('../reminder-notifications.web');
    const request = device.requestNotificationPermission();
    expect(notification.requestPermission).toHaveBeenCalledTimes(1);
    await expect(request).resolves.toBe('granted');
    expect(serviceWorker.register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    expect(pushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true, applicationServerKey: new Uint8Array(publicKey),
    });
  });
});

test('reuses a subscription with the current VAPID public key', async () => {
  const existing = subscription(publicKey);
  const { pushManager } = browser('granted', existing);
  await jest.isolateModulesAsync(async () => {
    const { getReminderPushToken } = jest.requireActual<typeof import('../reminder-push.web')>('../reminder-push.web');
    await expect(getReminderPushToken(jest.fn())).resolves.toEqual(expected);
    expect(existing.unsubscribe).not.toHaveBeenCalled();
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });
});

test('replaces the subscription when the VAPID public key changes', async () => {
  const existing = subscription(await newPublicKey());
  const { pushManager } = browser('granted', existing);
  await jest.isolateModulesAsync(async () => {
    const { getReminderPushToken } = jest.requireActual<typeof import('../reminder-push.web')>('../reminder-push.web');
    await expect(getReminderPushToken(jest.fn())).resolves.toEqual(expected);
    expect(existing.unsubscribe).toHaveBeenCalledTimes(1);
    expect(pushManager.subscribe).toHaveBeenCalledTimes(1);
  });
});

test.each([
  ['default', 'undetermined'],
  ['granted', 'granted'],
  ['denied', 'blocked'],
] as const)('maps browser permission %s to %s', async (permission, expectedPermission) => {
  const { notification, pushManager } = browser(permission);
  await jest.isolateModulesAsync(async () => {
    const device = jest.requireActual<typeof import('../reminder-notifications.web')>('../reminder-notifications.web');
    await expect(device.notificationPermission()).resolves.toBe(expectedPermission);
    expect(notification.requestPermission).not.toHaveBeenCalled();
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });
});

test('sign-out unsubscribes from the existing service worker registration', async () => {
  const existing = subscription(publicKey);
  const { serviceWorker, pushManager } = browser('granted', existing);
  await jest.isolateModulesAsync(async () => {
    const device = jest.requireActual<typeof import('../reminder-notifications.web')>('../reminder-notifications.web');
    await device.cancelAllReminders();
    expect(serviceWorker.getRegistration).toHaveBeenCalledWith('/');
    expect(existing.unsubscribe).toHaveBeenCalledTimes(1);
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });
});

test('only forwards reminder routes from worker messages and removes the listener on cleanup', async () => {
  const { serviceWorker } = browser();
  await jest.isolateModulesAsync(async () => {
    const device = jest.requireActual<typeof import('../reminder-notifications.web')>('../reminder-notifications.web');
    const open = jest.fn();
    const stop = device.onReminderOpened(open);
    const [event, handle] = serviceWorker.addEventListener.mock.calls[0]!;
    handle(new MessageEvent('message', { data: { type: 'reminder-open', url: '/sign-in' } }));
    handle(new MessageEvent('message', { data: { type: 'reminder-open', url: '/households/a/tasks/b' } }));
    expect(open.mock.calls).toEqual([['/households/a/tasks/b']]);
    stop();
    expect(serviceWorker.removeEventListener).toHaveBeenCalledWith(event, handle);
  });
});
