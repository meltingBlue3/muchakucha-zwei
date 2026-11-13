import * as SecureStore from 'expo-secure-store';
import { Linking, Platform } from 'react-native';

export const backgroundReminderGuide = Platform.OS === 'android' && Platform.constants.Brand.toLowerCase() === 'realme' ? 'realme' : 'android';

const hintKey = 'background-reminder-hint-v1';
let checked = false;

export function claimBackgroundReminderHint(): boolean {
  if (checked) return false;
  checked = true;
  try {
    if (SecureStore.getItem(hintKey) === 'seen') return false;
    SecureStore.setItem(hintKey, 'seen');
  } catch {
    // Keep the hint once per session if device storage is unavailable.
  }
  return true;
}

export function openBackgroundReminderSettings(): Promise<void> {
  return Linking.openSettings();
}
