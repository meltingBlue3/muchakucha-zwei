import { isRunningInExpoGo } from 'expo';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { ReminderPushToken } from './reminder-types';

export const reminderPushProvider = Platform.OS === 'android' && process.env.EXPO_PUBLIC_REMINDER_FCM_ENABLED === 'true' ? 'fcm' : 'expo';
const TOKEN_KEY = reminderPushProvider === 'fcm' ? 'muchakucha.reminder-fcm.v1' : 'muchakucha.reminder-push.v1';
export const pushRegistrationEnabled = process.env.EXPO_PUBLIC_REMINDER_PUSH_ENABLED === 'true' && !isRunningInExpoGo();
let registration: Promise<string | null> | undefined;
let listeningForFcm = false;

async function registerWithExpo(): Promise<string> {
  // Import the SDK's token entry point so its native token rotation listener
  // is installed. The shared notification adapter stays usable in Expo Go.
  const { getExpoPushTokenAsync } = require('expo-notifications/build/getExpoPushTokenAsync') as typeof import('expo-notifications/build/getExpoPushTokenAsync');
  const { data } = await getExpoPushTokenAsync();
  return data;
}

async function readFcmToken(onTokenReady: () => void): Promise<string> {
  const { getDevicePushTokenAsync } = require('expo-notifications/build/getDevicePushTokenAsync') as typeof import('expo-notifications/build/getDevicePushTokenAsync');
  if (!listeningForFcm) {
    const { addPushTokenListener } = require('expo-notifications/build/TokenEmitter') as typeof import('expo-notifications/build/TokenEmitter');
    addPushTokenListener(({ data }) => {
      if (typeof data !== 'string') return;
      registration = SecureStore.setItemAsync(TOKEN_KEY, data).catch(() => undefined).then(() => data);
      onTokenReady();
    });
    listeningForFcm = true;
  }
  const { data } = await getDevicePushTokenAsync();
  if (typeof data !== 'string') throw new Error('Firebase did not return an Android push token');
  return data;
}

export async function getReminderPushToken(onTokenReady: () => void): Promise<ReminderPushToken | null> {
  if (!pushRegistrationEnabled) return null;
  if (registration === undefined) {
    const fetchToken = reminderPushProvider === 'fcm' ? readFcmToken(onTokenReady) : registerWithExpo();
    const pending: Promise<string | null> = fetchToken.then(async token => {
      if (registration !== pending) return registration ?? null;
      await SecureStore.setItemAsync(TOKEN_KEY, token).catch(() => undefined);
      return token;
    }, () => {
      if (registration !== pending) return registration ?? null;
      registration = undefined;
      return null;
    });
    registration = pending;
  }
  const pending = registration;
  // On a phone with no reachable push service, local scheduling still starts.
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const fresh = await Promise.race([pending, new Promise<null>(resolve => { timeout = setTimeout(() => resolve(null), 5_000); })]);
    if (fresh !== null) return { token: fresh };
    const cached = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
    // A first registration may finish after local reminders have taken over.
    void pending.then(token => { if (token !== null && token !== cached) onTokenReady(); });
    return cached === null ? null : { token: cached };
  } finally {
    clearTimeout(timeout);
  }
}
