/**
 * Local notifications that the phone schedules for itself. The server never
 * pushes; it only says which reminders this person should get next.
 */
export type NotificationPermission = 'granted' | 'undetermined' | 'denied' | 'blocked' | 'unsupported';

export interface ReminderNotification {
  /** Starts with `REMINDER_ID_PREFIX`; other notifications are left alone. */
  id: string;
  kind: 'task' | 'event';
  title: string;
  body: string;
  fireAt: Date;
  /** The in-app route opened when the notification is tapped. */
  url: string;
}

export const REMINDER_ID_PREFIX = 'reminder:';
