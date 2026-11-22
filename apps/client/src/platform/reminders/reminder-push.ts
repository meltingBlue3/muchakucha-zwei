import type { ReminderPushProvider, ReminderPushToken } from './reminder-types';

export const pushRegistrationEnabled = false;
export const reminderPushProvider: ReminderPushProvider = 'expo';

export async function getReminderPushToken(_onTokenReady: () => void): Promise<ReminderPushToken | null> { return null; }
