import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { alarmCanCoverLockScreen, alarmsSupported, openAlarmSettings } from '../../platform/reminders/reminder-alarm';
import * as device from '../../platform/reminders/reminder-notifications';
import type { NotificationPermission } from '../../platform/reminders/reminder-types';
import { Banner, Button, Inline, Stack, Text } from '../../ui/primitives';
import { requestReminderSync } from './reminder-sync';

/** This phone's notification permission, checked again whenever the app returns from the system settings. */
export function useNotificationPermission(): { permission: NotificationPermission | null; error: string | null; enable(): Promise<void> } {
  const [permission, setPermission] = useState<NotificationPermission | null>(device.remindersSupported ? null : 'unsupported');
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    try {
      if (permission === 'blocked') {
        await device.openNotificationSettings();
        return;
      }
      const next = await device.requestNotificationPermission();
      setPermission(next);
      if (next === 'granted') requestReminderSync(0);
    } catch {
      setError(permission === 'blocked'
        ? '无法打开系统设置，请在手机设置中开启通知。'
        : '无法开启通知，请更新安装包后重试。');
    }
  }, [permission]);

  return { permission, error, enable };
}

/**
 * Whether a ringing alarm may cover this phone's lock screen, as far as the
 * system tells, checked again on return from the settings. Chinese systems
 * keep their own switches for it that no app can read.
 */
export function useAlarmLockScreen(): { canCover: boolean | null; error: string | null; openSettings(): Promise<void> } {
  const [canCover, setCanCover] = useState(alarmCanCoverLockScreen);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!alarmsSupported) return undefined;
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') setCanCover(alarmCanCoverLockScreen()); });
    return () => subscription.remove();
  }, []);

  const openSettings = useCallback(async () => {
    setError(null);
    try { await openAlarmSettings(); } catch { setError('无法打开系统设置，请在手机设置里找到这个 App 的权限。'); }
  }, []);

  return { canCover, error, openSettings };
}

/** The action that turns notifications on: ask, or send the person to the settings once the system stops asking. */
export function EnableNotificationsButton({ permission, onPress }: { permission: NotificationPermission; onPress(): void }) {
  return (
    <Button size="compact" tone="secondary" onPress={onPress} label={permission === 'blocked' ? '打开设置' : '开启'} accessibilityLabel={permission === 'blocked' ? '打开系统设置以开启通知' : '开启通知'} />
  );
}

/** Shown in the 提醒我 step on a phone that would not show the reminder. */
export function NotificationPermissionNotice() {
  const { permission, error, enable } = useNotificationPermission();
  if (permission === null || permission === 'granted' || permission === 'unsupported') return null;
  return (
    <Stack gap={3}>
      <Inline gap={3} style={{ alignItems: 'center' }}>
        <Text variant="bodySm" style={{ flex: 1 }}>这台手机的通知未开启，提醒不会出现。</Text>
        <EnableNotificationsButton permission={permission} onPress={() => void enable()} />
      </Inline>
      {error !== null ? <Banner>{error}</Banner> : null}
    </Stack>
  );
}
