import * as Notifications from './local-notifications';
import { Linking, Platform } from 'react-native';
import { REMINDER_ID_PREFIX, type NotificationPermission, type ReminderNotification } from './reminder-types';

export { REMINDER_ID_PREFIX, type NotificationPermission, type ReminderNotification } from './reminder-types';

// Two channels, so either kind can be silenced in the system settings.
const CHANNELS = {
  task: { id: 'task-reminders', name: '任务提醒' },
  event: { id: 'event-reminders', name: '日程提醒' },
} as const;

// A reminder that comes due while the app is open is still shown.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

let channels: Promise<void> | null = null;
function ensureChannels(): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();
  channels ??= Promise.all(Object.values(CHANNELS).map(channel => Notifications.setNotificationChannelAsync(channel.id, {
    name: channel.name,
    importance: Notifications.AndroidImportance.HIGH,
  }))).then(() => undefined, (error: unknown) => { channels = null; throw error; });
  return channels;
}

function permissionOf(status: Notifications.NotificationPermissionsStatus): NotificationPermission {
  if (status.granted || status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return 'granted';
  if (status.status === 'undetermined') return 'undetermined';
  return status.canAskAgain ? 'denied' : 'blocked';
}

export const remindersSupported = true;

export async function notificationPermission(): Promise<NotificationPermission> {
  return permissionOf(await Notifications.getPermissionsAsync());
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  // Android 13 shows its permission prompt only once the app has a channel.
  await ensureChannels();
  return permissionOf(await Notifications.requestPermissionsAsync());
}

export async function openNotificationSettings(): Promise<void> {
  await Linking.openSettings();
}

export async function scheduledReminderIds(): Promise<string[]> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled.map(request => request.identifier).filter(id => id.startsWith(REMINDER_ID_PREFIX));
}

export async function scheduleReminder(notification: ReminderNotification): Promise<void> {
  await ensureChannels();
  await Notifications.scheduleNotificationAsync({
    identifier: notification.id,
    content: { title: notification.title, body: notification.body, data: { url: notification.url } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: notification.fireAt, channelId: CHANNELS[notification.kind].id },
  });
}

export async function cancelReminder(id: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(id);
}

export async function cancelAllReminders(): Promise<void> {
  await Promise.all((await scheduledReminderIds()).map(cancelReminder));
}

// A tap that launches the app can reach both the listener and the launch
// response; each notification opens its route once.
const opened = new Set<string>();
function openedUrl(response: Notifications.NotificationResponse | null): string | null {
  if (response === null || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return null;
  const { identifier, content } = response.notification.request;
  const url: unknown = content.data?.url;
  const key = `${identifier}@${response.notification.date}`;
  if (!identifier.startsWith(REMINDER_ID_PREFIX) || typeof url !== 'string' || opened.has(key)) return null;
  opened.add(key);
  return url;
}

export function onReminderOpened(listener: (url: string) => void): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener(response => {
    const url = openedUrl(response);
    if (url !== null) listener(url);
  });
  return () => subscription.remove();
}

export async function takeLaunchReminderUrl(): Promise<string | null> {
  const response = await Notifications.getLastNotificationResponseAsync();
  if (response === null) return null;
  await Notifications.clearLastNotificationResponseAsync();
  return openedUrl(response);
}
