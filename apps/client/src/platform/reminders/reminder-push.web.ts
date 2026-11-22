import type { ReminderPushToken, WebReminderSupport } from './reminder-types';

const publicKey = process.env.EXPO_PUBLIC_REMINDER_WEB_PUSH_KEY;

function support(): WebReminderSupport {
  if (!publicKey || typeof window === 'undefined' || typeof navigator === 'undefined') return 'unsupported';
  if ('standalone' in navigator && navigator.standalone === false) return 'requiresHomeScreen';
  return navigator.serviceWorker && typeof PushManager !== 'undefined' && typeof Notification !== 'undefined'
    ? 'supported' : 'unsupported';
}

export const webReminderSupport = support();
export const pushRegistrationEnabled = webReminderSupport === 'supported';
export const reminderPushProvider = 'web';

let worker: Promise<ServiceWorkerRegistration> | undefined;
let pendingSubscription: Promise<ReminderPushToken | null> | undefined;

function registerWorker(): Promise<ServiceWorkerRegistration> {
  return worker ??= navigator.serviceWorker.register('/sw.js', { scope: '/' })
    .then(() => navigator.serviceWorker.ready)
    .catch((error: unknown) => {
      worker = undefined;
      throw error;
    });
}

function encodeKey(key: ArrayBuffer): string {
  const text = String.fromCharCode(...new Uint8Array(key));
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function subscribe(key: string): Promise<ReminderPushToken> {
  const { pushManager } = await registerWorker();
  let subscription = await pushManager.getSubscription();
  if (subscription !== null) {
    const previousKey = subscription.options.applicationServerKey;
    if (previousKey === null || encodeKey(previousKey) !== key) {
      await subscription.unsubscribe();
      subscription = null;
    }
  }
  if (subscription === null) {
    const decoded = atob(key.replaceAll('-', '+').replaceAll('_', '/'));
    const applicationServerKey = Uint8Array.from(decoded, byte => byte.charCodeAt(0));
    subscription = await pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
  }
  const p256dh = subscription.getKey('p256dh');
  const auth = subscription.getKey('auth');
  if (p256dh === null || auth === null) throw new Error('Web Push subscription is missing encryption keys');
  return { token: subscription.endpoint, keys: { p256dh: encodeKey(p256dh), auth: encodeKey(auth) } };
}

export async function getReminderPushToken(_onTokenReady: () => void): Promise<ReminderPushToken | null> {
  if (!pushRegistrationEnabled || !publicKey || Notification.permission !== 'granted') return null;
  return pendingSubscription ??= subscribe(publicKey).finally(() => { pendingSubscription = undefined; });
}

export async function unsubscribeReminderPush(): Promise<void> {
  if (typeof navigator === 'undefined' || typeof navigator.serviceWorker?.getRegistration !== 'function') return;
  await pendingSubscription?.catch(() => undefined);
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager?.getSubscription();
  await subscription?.unsubscribe();
}
