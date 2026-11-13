import { useTranslation } from '../../i18n';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { alarmCanCoverLockScreen, alarmsSupported, openAlarmSettings } from '../../platform/reminders/reminder-alarm';
import * as device from '../../platform/reminders/reminder-notifications';
import type { NotificationPermission } from '../../platform/reminders/reminder-types';
import { Banner, Button, Inline, Stack, Text } from '../../ui/primitives';
import { requestReminderSync } from './reminder-sync';

/** This phone's notification permission, checked again whenever the app returns from the system settings. */
export function useNotificationPermission(): { permission: NotificationPermission | null; error: string | null; enable(): Promise<void> } {
  const { t } = useTranslation('reminders');
  const [permission, setPermission] = useState<NotificationPermission | null>(device.remindersSupported ? null : 'unsupported');
  const [error, setError] = useState<'permission.settingsError' | 'permission.enableError' | 'permission.alarmSettingsError' | null>(null);

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
        ? 'permission.settingsError'
        : 'permission.enableError');
    }
  }, [permission]);

  return { permission, error: error === null ? null : t(error), enable };
}

/**
 * Whether a ringing alarm may cover this phone's lock screen, as far as the
 * system tells, checked again on return from the settings. Chinese systems
 * keep their own switches for it that no app can read.
 */
export function useAlarmLockScreen(): { canCover: boolean | null; error: string | null; openSettings(): Promise<void> } {
  const { t } = useTranslation('reminders');
  const [canCover, setCanCover] = useState(alarmCanCoverLockScreen);
  const [error, setError] = useState<'permission.settingsError' | 'permission.enableError' | 'permission.alarmSettingsError' | null>(null);

  useEffect(() => {
    if (!alarmsSupported) return undefined;
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') setCanCover(alarmCanCoverLockScreen()); });
    return () => subscription.remove();
  }, []);

  const openSettings = useCallback(async () => {
    setError(null);
    try { await openAlarmSettings(); } catch { setError('permission.alarmSettingsError'); }
  }, []);

  return { canCover, error: error === null ? null : t(error), openSettings };
}

/** The action that turns notifications on: ask, or send the person to the settings once the system stops asking. */
export function EnableNotificationsButton({ permission, onPress }: { permission: NotificationPermission; onPress(): void }) {
  const { t } = useTranslation('reminders');
  return (
    <Button size="compact" tone="secondary" onPress={onPress} label={permission === 'blocked' ? t('permission.openSettings') : t('permission.enable')} accessibilityLabel={permission === 'blocked' ? t('permission.openNotificationSettings') : t('permission.enableNotifications')} />
  );
}

/** Shown in the 提醒我 step on a phone that would not show the reminder. */
export function NotificationPermissionNotice() {
  const { t } = useTranslation('reminders');
  const { permission, error, enable } = useNotificationPermission();
  if (permission === null || permission === 'granted' || permission === 'unsupported') return null;
  return (
    <Stack gap={3}>
      <Inline gap={3} style={{ alignItems: 'center' }}>
        <Text variant="bodySm" style={{ flex: 1 }}>{t('permission.notice')}</Text>
        <EnableNotificationsButton permission={permission} onPress={() => void enable()} />
      </Inline>
      {error !== null ? <Banner>{error}</Banner> : null}
    </Stack>
  );
}
