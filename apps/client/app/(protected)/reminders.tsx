import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Pressable, Switch, View } from 'react-native';
import Bell from 'lucide-react-native/icons/bell';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import House from 'lucide-react-native/icons/house';
import Smartphone from 'lucide-react-native/icons/smartphone';
import type { UpdateReminderSettingsDto } from '@muchakucha/api-client';
import { AccountScreen } from '../../src/features/households/household-screen';
import { EnableNotificationsButton, useAlarmLockScreen, useNotificationPermission } from '../../src/features/reminders/notification-permission';
import { useReminderSettings } from '../../src/features/reminders/reminder-settings';
import { ALARM_DETAIL, minutesLabel, TIMED_REMINDER_MINUTES, type ReminderKind } from '../../src/features/reminders/reminder-rules';
import { alarmsSupported } from '../../src/platform/reminders/reminder-alarm';
import { remindersSupported } from '../../src/platform/reminders/reminder-notifications';
import { AppDialog } from '../../src/ui/app-dialog';
import { OptionRow } from '../../src/ui/compose-rows';
import { PageIntro } from '../../src/ui/page-intro';
import { Banner, Button, LoadError, LoadingState, Stack, Text } from '../../src/ui/primitives';
import { SettingsRows, SettingsSection } from '../../src/ui/settings-section';
import { theme } from '../../src/ui/theme';

type Choosing = 'task' | 'event' | 'time';

const DATE_ONLY_TIMES = Array.from({ length: 17 }, (_, index) => `${String(index + 6).padStart(2, '0')}:00`);

const deviceRow = { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3], minHeight: theme.controlSizes.touchTarget } as const;

const sectionIcon = (Icon: typeof Bell) => <Icon size={theme.controlSizes.icon} color={theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} />;

function defaultLabel(minutes: number | null, kind: ReminderKind): string {
  return minutes === null ? '不提醒' : minutesLabel(minutes, kind, false, '09:00');
}

/** A setting as a row: its name, the current value and an arrow; pressing it opens the choices. */
function SettingRow({ label, value, trigger, disabled, onPress }: { label: string; value: string; trigger: RefObject<View | null>; disabled: boolean; onPress(): void }) {
  return (
    <Pressable
      ref={trigger}
      accessibilityRole="button"
      accessibilityLabel={`${label}，${value}`}
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

/** A switch as a row; `name` is its accessible name when the label alone would not say what it switches. */
function SwitchRow({ label, name = label, value, disabled, onChange, children }: { label: string; name?: string; value: boolean; disabled: boolean; onChange(value: boolean): void; children?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3], minHeight: theme.controlSizes.touchTarget, paddingVertical: theme.spacing[2] }}>
      <View style={{ flex: 1 }}>
        <Text>{label}</Text>
        {children}
      </View>
      <Switch
        accessibilityLabel={name}
        disabled={disabled}
        value={value}
        onValueChange={onChange}
        // As in the event form: a neutral track when off, ink when on, a white thumb.
        trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
        thumbColor={theme.colors.surface}
        ios_backgroundColor={theme.colors.border}
      />
    </View>
  );
}

/**
 * 提醒: this phone's notification permission and lock-screen alarms, the
 * person's default reminders and whether they ring, and which households may
 * remind them. Every change saves at once.
 */
export default function RemindersRoute() {
  const { settings, status, reload, save } = useReminderSettings();
  const { permission, error: permissionError, enable } = useNotificationPermission();
  const { canCover, error: lockScreenError, openSettings } = useAlarmLockScreen();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      setError('没有保存，请检查网络后重试。');
    } finally {
      setSaving(false);
    }
  };

  const minuteOptions = (kind: ReminderKind, current: number | null) => (
    <View accessibilityRole="radiogroup" accessibilityLabel={kind === 'task' ? '分给我的任务' : '日程'}>
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
    <AccountScreen accessibilityLabel="提醒" refreshing={status === 'loading' && settings !== null} onRefresh={reload}>
      <Stack gap={6}>
        <PageIntro title="提醒" />
        {error !== null ? <Banner>{error}</Banner> : null}
        {permissionError !== null ? <Banner>{permissionError}</Banner> : null}
        {lockScreenError !== null ? <Banner>{lockScreenError}</Banner> : null}

        {remindersSupported && permission !== null ? (
          <SettingsSection title="本机通知" icon={sectionIcon(Smartphone)}>
            <SettingsRows>
              <View style={deviceRow}>
                <View style={{ flex: 1 }}>
                  <Text>通知</Text>
                  <Text variant="meta">{permission === 'granted' ? '提醒到时间会在这台手机上弹出。' : '通知未开启，提醒不会出现。'}</Text>
                </View>
                {permission === 'granted' ? <Text variant="bodySm">已开启</Text> : <EnableNotificationsButton permission={permission} onPress={() => void enable()} />}
              </View>
              {alarmsSupported ? (
                <View style={deviceRow}>
                  <View style={{ flex: 1 }}>
                    <Text>锁屏时弹出闹铃</Text>
                    <Text variant="meta">
                      {canCover === false
                        ? '系统未允许，锁屏时闹铃只响铃、不弹出画面。'
                        : '如果锁屏时闹铃只响、不弹出画面，在设置里允许「锁屏显示」和「后台弹出界面」，并把「省电策略」设为「无限制」。'}
                    </Text>
                  </View>
                  <Button size="compact" tone="secondary" label="去设置" accessibilityLabel="打开系统设置，允许闹铃在锁屏时弹出" onPress={() => void openSettings()} />
                </View>
              ) : null}
            </SettingsRows>
          </SettingsSection>
        ) : null}

        {settings === null ? (
          status === 'failed'
            ? <LoadError message="无法加载提醒设置，请重试。" onRetry={reload} />
            : <LoadingState label="正在加载提醒设置" />
        ) : (
          <>
            {status === 'failed' ? <LoadError message="无法更新提醒设置，下面是上次加载的内容。" onRetry={reload} /> : null}
            <SettingsSection title="默认提醒" icon={sectionIcon(Bell)} detail="可以在任务或日程里单独设置，只影响你自己。">
              <SettingsRows>
                <SettingRow label="分给我的任务" value={defaultLabel(settings.taskMinutesBefore, 'task')} trigger={taskTrigger} disabled={saving} onPress={() => setChoosing('task')} />
                <SettingRow label="日程" value={defaultLabel(settings.eventMinutesBefore, 'event')} trigger={eventTrigger} disabled={saving} onPress={() => setChoosing('event')} />
                <SettingRow label="只有日期时" value={`当天 ${settings.dateOnlyTime}`} trigger={timeTrigger} disabled={saving} onPress={() => setChoosing('time')} />
                <SwitchRow label="用闹铃提醒" value={settings.alarm} disabled={saving} onChange={(on) => void apply({ alarm: on })}>
                  <Text variant="meta">{alarmsSupported ? `到时间${ALARM_DETAIL}。` : `到时间${ALARM_DETAIL}。只在 Android 手机上响。`}</Text>
                </SwitchRow>
              </SettingsRows>
            </SettingsSection>

            <SettingsSection title="家庭" icon={sectionIcon(House)} detail="关闭后，这个家庭的任务和日程都不再提醒你。">
              <SettingsRows>
                {settings.households.map(household => (
                  <SwitchRow
                    key={household.id}
                    label={household.name}
                    name={`接收${household.name}的提醒`}
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
            ? '提醒由这台手机按时弹出。家人刚分给你的任务，要等你打开 App 后才会排上提醒。'
            : '网页不会弹出提醒，这里的设置在手机 App 上生效。'}
        </Text>
      </Stack>

      {choosing !== null && settings !== null ? (
        <AppDialog
          title={choosing === 'task' ? '分给我的任务' : choosing === 'event' ? '日程' : '只有日期时'}
          busy={saving}
          onClose={() => setChoosing(null)}
          trigger={triggers[choosing]}
        >
          {choosing === 'task' ? minuteOptions('task', settings.taskMinutesBefore) : null}
          {choosing === 'event' ? minuteOptions('event', settings.eventMinutesBefore) : null}
          {choosing === 'time' ? (
            <Stack gap={2}>
              <Text variant="bodySm">没写时间的任务和全天日程，在这个时间提醒。</Text>
              <View accessibilityRole="radiogroup" accessibilityLabel="只有日期时的提醒时间">
                {(DATE_ONLY_TIMES.includes(settings.dateOnlyTime) ? DATE_ONLY_TIMES : [...DATE_ONLY_TIMES, settings.dateOnlyTime].sort()).map(time => (
                  <OptionRow key={time} label={`当天 ${time}`} checked={time === settings.dateOnlyTime} disabled={saving} onPress={() => void apply({ dateOnlyTime: time })} />
                ))}
              </View>
            </Stack>
          ) : null}
        </AppDialog>
      ) : null}
    </AccountScreen>
  );
}
