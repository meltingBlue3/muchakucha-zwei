import type { NotificationPermission, ReminderNotification } from './reminder-types';

export { REMINDER_ID_PREFIX, type NotificationPermission, type ReminderNotification } from './reminder-types';

/** Web and other platforms without local notifications schedule nothing. */
export const remindersSupported = false;

export async function notificationPermission(): Promise<NotificationPermission> { return 'unsupported'; }

export async function requestNotificationPermission(): Promise<NotificationPermission> { return 'unsupported'; }

export async function openNotificationSettings(): Promise<void> {}

export async function scheduledReminderIds(): Promise<string[]> { return []; }

export async function scheduleReminder(_notification: ReminderNotification): Promise<void> {}

export async function cancelReminder(_id: string): Promise<void> {}

/** Signing out leaves no family content on the lock screen. */
export async function cancelAllReminders(): Promise<void> {}

export function onReminderOpened(_listener: (url: string) => void): () => void { return () => undefined; }

/** The route of a reminder whose tap launched the app, handed out once. */
export async function takeLaunchReminderUrl(): Promise<string | null> { return null; }
