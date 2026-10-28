import { requireOptionalNativeModule } from 'expo';
import type { ReminderNotification } from './reminder-types';

interface ReminderAlarmModule {
  schedule(id: string, fireAt: number, title: string, body: string, url: string): Promise<void>;
  cancel(id: string): Promise<void>;
  cancelAll(): Promise<void>;
  scheduledIds(): Promise<string[]>;
  canUseFullScreen(): boolean;
  openAlarmSettings(): Promise<void>;
}

// modules/reminder-alarm. Absent in Expo Go and in builds made before it,
// where alarms fall back to notifications.
const native = requireOptionalNativeModule<ReminderAlarmModule>('ReminderAlarm');

// The scheme in app.json: the alarm screen opens its item as a deep link.
const APP_SCHEME = 'muchakucha-zwei';

export const alarmsSupported = native !== null;

export async function scheduledAlarmIds(): Promise<string[]> {
  return native === null ? [] : native.scheduledIds();
}

export async function scheduleAlarm(notification: ReminderNotification): Promise<void> {
  await native?.schedule(notification.id, notification.fireAt.getTime(), notification.title, notification.body, `${APP_SCHEME}:/${notification.url}`);
}

export async function cancelAlarm(id: string): Promise<void> {
  await native?.cancel(id);
}

export async function cancelAllAlarms(): Promise<void> {
  await native?.cancelAll();
}

export function alarmCanCoverLockScreen(): boolean | null {
  return native === null ? null : native.canUseFullScreen();
}

export async function openAlarmSettings(): Promise<void> {
  await native?.openAlarmSettings();
}
