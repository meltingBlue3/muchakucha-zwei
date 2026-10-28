import type { ReminderNotification } from './reminder-types';

/**
 * Reminders that ring like an alarm clock until dismissed. Only Android has
 * them, through the app's own native module; everywhere else a reminder that
 * should ring is an ordinary notification.
 */
export const alarmsSupported = false;

export async function scheduledAlarmIds(): Promise<string[]> { return []; }

export async function scheduleAlarm(_notification: ReminderNotification): Promise<void> {}

export async function cancelAlarm(_id: string): Promise<void> {}

/** Also silences one ringing now. */
export async function cancelAllAlarms(): Promise<void> {}

/** Whether a ringing alarm may cover the lock screen, as far as the system says; null where it cannot ring. */
export function alarmCanCoverLockScreen(): boolean | null { return null; }

export async function openAlarmSettings(): Promise<void> {}
