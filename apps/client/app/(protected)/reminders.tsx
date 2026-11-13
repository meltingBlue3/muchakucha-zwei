import { useTranslation } from '../../src/i18n';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState, type RefObject } from 'react';
import { Pressable, View } from 'react-native';
import Bell from 'lucide-react-native/icons/bell';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import House from 'lucide-react-native/icons/house';
import Smartphone from 'lucide-react-native/icons/smartphone';
import type { UpdateReminderSettingsDto } from '@muchakucha/api-client';
import { AccountScreen } from '../../src/features/households/household-screen';
import { BackgroundReminderSettingsRow } from '../../src/features/reminders/background-reminder-guide';
import { EnableNotificationsButton, useAlarmLockScreen, useNotificationPermission } from '../../src/features/reminders/notification-permission';
import { useReminderSettings } from '../../src/features/reminders/reminder-settings';
import { minutesLabel, TIMED_REMINDER_MINUTES, type ReminderKind } from '../../src/features/reminders/reminder-rules';
import { alarmsSupported } from '../../src/platform/reminders/reminder-alarm';
import { backgroundReminderGuide } from '../../src/platform/reminders/background-reminder-guide';
import { remindersSupported } from '../../src/platform/reminders/reminder-notifications';
import { AppDialog } from '../../src/ui/app-dialog';
import { OptionRow } from '../../src/ui/compose-rows';
import { PageIntro } from '../../src/ui/page-intro';
import { Banner, Button, LoadError, LoadingState, Stack, Text } from '../../src/ui/primitives';
import { SettingsRows, SettingsSection, SwitchRow } from '../../src/ui/settings-section';
import { theme } from '../../src/ui/theme';

type Choosing = 'task' | 'event' | 'time';

const DATE_ONLY_TIMES = Array.from({ length: 17 }, (_, index) => `${String(index + 6).padStart(2, '0')}:00`);

const deviceRow = { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3], minHeight: theme.controlSizes.touchTarget } as const;

const sectionIcon = (Icon: typeof Bell) => <Icon size={theme.controlSizes.icon} color={theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} />;

/** A setting as a row: its name, the current value and an arrow; pressing it opens the choices. */
function SettingRow({ label, value, trigger, disabled, onPress }: { label: string; value: string; trigger: RefObject<View | null>; disabled: boolean; onPress(): void }) {
  const { t } = useTranslation('reminders');
  return (
    <Pressable
      ref={trigger}
      accessibilityRole="button"
      accessibilityLabel={t('settings.row', { label, value })}
      aria-haspopup="dialog"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2], minHeight: theme.controlSizes.touchTarget, paddingVertical: theme.spacing[2], marginHorizontal: -theme.spacing[2], paddingHorizontal: theme.spacing[2], borderRadius: theme.borderRadii.md, backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.transparent })}
    >
      <Text style={{ flex: 1 }}>{label}</Text>
      <Text variant="bodySm">{value}</Text>
      <ChevronRight size={theme.controlSizes.icon} color={theme.colors.inkFaint} strokeWidth={theme.controlSizes.iconStroke} />
    </Pressable>
  );
}

/**
 * 提醒: this phone's notification permission and lock-screen alarms, the
 * person's default reminders and whether they ring, and which households may
 * remind them. Every change saves at once.
 */
export default function RemindersRoute() {
  const { t } = useTranslation(['reminders', 'profile', 'navigation']);
  const { settings, status, reload, save } = useReminderSettings();
  const { permission, error: permissionError, enable } = useNotificationPermission();
  const { canCover, error: lockScreenError, openSettings } = useAlarmLockScreen();
  const defaultLabel = (minutes: number | null, kind: ReminderKind) => minutes === null ? t('off') : minutesLabel(minutes, kind, false, '09:00');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<'settings.saveError' | null>(null);
  const [choosing, setChoosing] = useState<Choosing | null>(null);
  const taskTrigger = useRef<View>(null);
  const eventTrigger = useRef<View>(null);
  const timeTrigger = useRef<View>(null);
  const triggers = { task: taskTrigger, event: eventTrigger, time: timeTrigger };

  // Households joined or left elsewhere show up when the page comes back.
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const apply = async (change: Partial<UpdateReminderSettingsDto>) => {
    if (settings === null) return;
    setSaving(true);
    setError(null);
    try {
      await save({
        taskMinutesBefore: settings.taskMinutesBefore,
        eventMinutesBefore: settings.eventMinutesBefore,
        dateOnlyTime: settings.dateOnlyTime,
        alarm: settings.alarm,
        mutedHouseholdIds: settings.households.filter(household => household.muted).map(household => household.id),
        ...change,
      });
      setChoosing(null);
    } catch {
      setError('settings.saveError');
    } finally {
      setSaving(false);
    }
  };

  const minuteOptions = (kind: ReminderKind, current: number | null) => (
    <View accessibilityRole="radiogroup" accessibilityLabel={kind === 'task' ? t('settings.task') : t('settings.event')}>
      {[null, ...TIMED_REMINDER_MINUTES].map(minutes => (
        <OptionRow
          key={String(minutes)}
          label={defaultLabel(minutes, kind)}
          checked={minutes === current}
          disabled={saving}
          onPress={() => void apply(kind === 'task' ? { taskMinutesBefore: minutes } : { eventMinutesBefore: minutes })}
        />
      ))}
    </View>
  );

  return (
    <AccountScreen accessibilityLabel={t('profile:links.reminders.label')} refreshing={status === 'loading' && settings !== null} onRefresh={reload}>
      <Stack gap={6}>
        <PageIntro title={t('profile:links.reminders.label')} />
        {error !== null ? <Banner>{t(error)}</Banner> : null}
        {permissionError !== null ? <Banner>{permissionError}</Banner> : null}
        {lockScreenError !== null ? <Banner>{lockScreenError}</Banner> : null}

        {remindersSupported && permission !== null ? (
          <SettingsSection title={t('settings.device')} icon={sectionIcon(Smartphone)}>
            <SettingsRows>
              <View style={deviceRow}>
                <View style={{ flex: 1 }}>
                  <Text>{t('settings.notifications')}</Text>
                  <Text variant="meta">{permission === 'granted' ? t('settings.granted') : t('settings.notGranted')}</Text>
                </View>
                {permission === 'granted' ? <Text variant="bodySm">{t('settings.enabled')}</Text> : <EnableNotificationsButton permission={permission} onPress={() => void enable()} />}
              </View>
              {backgroundReminderGuide !== null ? <BackgroundReminderSettingsRow /> : null}
              {alarmsSupported ? (
                <View style={deviceRow}>
                  <View style={{ flex: 1 }}>
                    <Text>{t('settings.lockScreen')}</Text>
                    <Text variant="meta">
                      {canCover === false
                        ? t('settings.lockScreenBlocked')
                        : t('settings.lockScreenGuide')}
                    </Text>
                  </View>
                  <Button size="compact" tone="secondary" label={t('settings.goToSettings')} accessibilityLabel={t('settings.openLockScreen')} onPress={() => void openSettings()} />
                </View>
              ) : null}
            </SettingsRows>
          </SettingsSection>
        ) : null}

        {settings === null ? (
          status === 'failed'
            ? <LoadError message={t('settings.loadError')} onRetry={reload} />
            : <LoadingState label={t('settings.loading')} />
        ) : (
          <>
            {status === 'failed' ? <LoadError message={t('settings.refreshError')} onRetry={reload} /> : null}
            <SettingsSection title={t('defaultReminder')} icon={sectionIcon(Bell)} detail={t('settings.defaultsHelp')}>
              <SettingsRows>
                <SettingRow label={t('settings.task')} value={defaultLabel(settings.taskMinutesBefore, 'task')} trigger={taskTrigger} disabled={saving} onPress={() => setChoosing('task')} />
                <SettingRow label={t('settings.event')} value={defaultLabel(settings.eventMinutesBefore, 'event')} trigger={eventTrigger} disabled={saving} onPress={() => setChoosing('event')} />
                <SettingRow label={t('settings.time')} value={t('sameDayTime', { time: settings.dateOnlyTime })} trigger={timeTrigger} disabled={saving} onPress={() => setChoosing('time')} />
                <SwitchRow label={t('settings.useAlarm')} value={settings.alarm} disabled={saving} onChange={(on) => void apply({ alarm: on })}>
                  <Text variant="meta">{t(alarmsSupported ? 'settings.alarmHelp' : 'settings.alarmHelpWeb')}</Text>
                </SwitchRow>
              </SettingsRows>
            </SettingsSection>

            <SettingsSection title={t('navigation:family')} icon={sectionIcon(House)} detail={t('settings.householdHelp')}>
              <SettingsRows>
                {settings.households.map(household => (
                  <SwitchRow
                    key={household.id}
                    label={household.name}
                    name={t('settings.householdSwitch', { name: household.name })}
                    value={!household.muted}
                    disabled={saving}
                    onChange={(on) => void apply({
                      mutedHouseholdIds: settings.households
                        .filter(item => item.id === household.id ? !on : item.muted)
                        .map(item => item.id),
                    })}
                  />
                ))}
              </SettingsRows>
            </SettingsSection>
          </>
        )}

        <Text variant="caption">
          {remindersSupported
            ? t('settings.nativeInfo')
            : t('settings.webInfo')}
        </Text>
      </Stack>

      {choosing !== null && settings !== null ? (
        <AppDialog
          anchored
          title={choosing === 'task' ? t('settings.task') : choosing === 'event' ? t('settings.event') : t('settings.time')}
          busy={saving}
          onClose={() => setChoosing(null)}
          trigger={triggers[choosing]}
        >
          {choosing === 'task' ? minuteOptions('task', settings.taskMinutesBefore) : null}
          {choosing === 'event' ? minuteOptions('event', settings.eventMinutesBefore) : null}
          {choosing === 'time' ? (
            <Stack gap={2}>
              <Text variant="bodySm">{t('settings.dateOnlyHelp')}</Text>
              <View accessibilityRole="radiogroup" accessibilityLabel={t('settings.dateOnlyGroup')}>
                {(DATE_ONLY_TIMES.includes(settings.dateOnlyTime) ? DATE_ONLY_TIMES : [...DATE_ONLY_TIMES, settings.dateOnlyTime].sort()).map(time => (
                  <OptionRow key={time} label={t('sameDayTime', { time })} checked={time === settings.dateOnlyTime} disabled={saving} onPress={() => void apply({ dateOnlyTime: time })} />
                ))}
              </View>
            </Stack>
          ) : null}
        </AppDialog>
      ) : null}
    </AccountScreen>
  );
}
