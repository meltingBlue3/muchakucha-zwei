import { getReminderPushToken, unsubscribeReminderPush, webReminderSupport } from './reminder-push.web';
import type { NotificationPermission, ReminderNotification } from './reminder-types';

export { webReminderSupport };
export { REMINDER_ID_PREFIX, type NotificationPermission, type ReminderNotification } from './reminder-types';

export const remindersSupported = webReminderSupport === 'supported';
export const localAlarmsSupported = false;

const permissions = {
  default: 'undetermined',
  granted: 'granted',
  denied: 'blocked',
} as const;

export async function notificationPermission(): Promise<NotificationPermission> {
  return remindersSupported ? permissions[Notification.permission] : 'unsupported';
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!remindersSupported) return 'unsupported';
  // The browser prompt needs the transient activation from the button press.
  const permission = await Notification.requestPermission();
  if (permission === 'granted') await getReminderPushToken(() => undefined);
  return permissions[permission];
}

export async function refreshReminderChannels(): Promise<void> {}
export async function openNotificationSettings(): Promise<void> {}
export async function scheduledReminderIds(): Promise<string[]> { return []; }
export async function scheduleReminder(_notification: ReminderNotification): Promise<void> {}
export async function cancelReminder(_id: string): Promise<void> {}
export async function cancelLocalReminderNotifications(): Promise<void> {}

export const cancelAllReminders = unsubscribeReminderPush;

export function onReminderOpened(listener: (url: string) => void): () => void {
  const serviceWorker = navigator.serviceWorker;
  function onMessage({ data }: MessageEvent<{ type?: unknown; url?: unknown } | null>) {
    if (data?.type === 'reminder-open' && typeof data.url === 'string' && data.url.startsWith('/households/')) {
      listener(data.url);
    }
  }
  serviceWorker.addEventListener('message', onMessage);
  return () => serviceWorker.removeEventListener('message', onMessage);
}

export async function takeLaunchReminderUrl(): Promise<string | null> { return null; }
