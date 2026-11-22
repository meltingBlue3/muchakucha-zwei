/**
 * Reminders scheduled on this device, including ringing Android alarms.
 */
export type NotificationPermission = 'granted' | 'undetermined' | 'denied' | 'blocked' | 'unsupported';
export type WebReminderSupport = 'supported' | 'unsupported' | 'requiresHomeScreen';
export type ReminderPushProvider = 'expo' | 'fcm' | 'web';

export interface ReminderPushToken {
  token: string;
  keys?: { p256dh: string; auth: string };
}

export interface ReminderNotification {
  /** Starts with `REMINDER_ID_PREFIX`; other notifications are left alone. */
  id: string;
  kind: 'task' | 'event';
  title: string;
  body: string;
  fireAt: Date;
  /** The in-app route opened when the notification is tapped. */
  url: string;
  /** Ring like an alarm clock until dismissed, where the phone can. */
  alarm: boolean;
}

export const REMINDER_ID_PREFIX = 'reminder:';
