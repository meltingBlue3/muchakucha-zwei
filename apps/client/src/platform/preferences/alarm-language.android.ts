import { requireOptionalNativeModule } from 'expo';

export function announceAlarmLanguage(tag: string): void {
  // Older binaries have the alarm module without this method.
  const alarm = requireOptionalNativeModule<{ setLanguage?(tag: string): void }>('ReminderAlarm');
  alarm?.setLanguage?.(tag);
}
