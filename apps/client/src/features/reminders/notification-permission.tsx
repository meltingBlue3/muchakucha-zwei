import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as device from '../../platform/reminders/reminder-notifications';
import type { NotificationPermission } from '../../platform/reminders/reminder-types';
import { Button, Inline, Text } from '../../ui/primitives';
import { requestReminderSync } from './reminder-sync';

/** This phone's notification permission, checked again whenever the app returns from the system settings. */
export function useNotificationPermission(): { permission: NotificationPermission | null; enable(): Promise<void> } {
  const [permission, setPermission] = useState<NotificationPermission | null>(device.remindersSupported ? null : 'unsupported');

  const refresh = useCallback(async () => {
    try { setPermission(await device.notificationPermission()); } catch { setPermission('undetermined'); }
  }, []);

  useEffect(() => {
    if (!device.remindersSupported) return undefined;
    void refresh();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => subscription.remove();
  }, [refresh]);

  const enable = useCallback(async () => {
    if (permission === 'blocked') {
      await device.openNotificationSettings();
      return;
    }
    const next = await device.requestNotificationPermission();
    setPermission(next);
    if (next === 'granted') requestReminderSync(0);
  }, [permission]);

  return { permission, enable };
}

/** The action that turns notifications on: ask, or send the person to the settings once the system stops asking. */
export function EnableNotificationsButton({ permission, onPress }: { permission: NotificationPermission; onPress(): void }) {
  return (
    <Button size="compact" tone="secondary" onPress={onPress} label={permission === 'blocked' ? '打开设置' : '开启'} accessibilityLabel={permission === 'blocked' ? '打开系统设置以开启通知' : '开启通知'} />
  );
}

/** Shown in the 提醒我 step on a phone that would not show the reminder. */
export function NotificationPermissionNotice() {
  const { permission, enable } = useNotificationPermission();
  if (permission === null || permission === 'granted' || permission === 'unsupported') return null;
  return (
    <Inline gap={3} style={{ alignItems: 'center' }}>
      <Text variant="bodySm" style={{ flex: 1 }}>这台手机的通知未开启，提醒不会出现。</Text>
      <EnableNotificationsButton permission={permission} onPress={() => void enable()} />
    </Inline>
  );
}
