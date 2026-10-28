import AlarmClock from 'lucide-react-native/icons/alarm-clock';
import Bell from 'lucide-react-native/icons/bell';
import type { ReminderChoiceDto } from '@muchakucha/api-client';
import { View } from 'react-native';
import { alarmsSupported } from '../../platform/reminders/reminder-alarm';
import { ChoiceField, rowIcon } from '../../ui/compose-rows';
import { Text } from '../../ui/primitives';
import { theme } from '../../ui/theme';
import { NotificationPermissionNotice } from './notification-permission';
import {
  alarmOptions,
  alarmSummary,
  alarmValue,
  choiceFromValue,
  choiceValue,
  defaultMinutes,
  fitChoice,
  reminderOptions,
  reminderSummary,
  type ReminderKind,
} from './reminder-rules';
import { useReminderSettings } from './reminder-settings';

/**
 * 提醒我, and under it 闹铃: the person's own reminder for the task or event
 * in the form, and whether it rings. Both belong only to them, and on a
 * recurring item to the whole series.
 */
export function ReminderField({ kind, own, dateOnly, recurring, value, disabled = false, onChange }: {
  kind: ReminderKind;
  /** For a task: whether the defaults apply to this person (assigned, or unassigned and theirs). */
  own: boolean;
  dateOnly: boolean;
  recurring: boolean;
  value: ReminderChoiceDto;
  disabled?: boolean;
  onChange(choice: ReminderChoiceDto): void;
}) {
  const { settings } = useReminderSettings();
  const context = { kind, own, dateOnly, defaults: settings };
  const choice = fitChoice(value, dateOnly);
  // Without a reminder there is nothing to ring; while the defaults load, there may be one.
  const reminds = choice.mode === 'before' || (choice.mode === 'default' && (settings === null || defaultMinutes(kind, own, dateOnly, settings) !== null));
  const personal = recurring ? '只改你自己的提醒，家人不受影响。对这个重复安排的每一次都生效。' : '只改你自己的提醒，家人不受影响。';
  return (
    <>
      <ChoiceField
        name="提醒我"
        title="提醒我"
        icon={rowIcon(Bell)}
        summary={reminderSummary(choice, context)}
        muted={choice.mode === 'default'}
        options={reminderOptions(context)}
        value={[choiceValue(choice)]}
        disabled={disabled}
        onChange={([next]) => { if (next !== undefined) onChange(choiceFromValue(next, alarmValue(choice))); }}
      >
        <View style={{ paddingHorizontal: theme.spacing[2], gap: theme.spacing[3] }}>
          <Text variant="bodySm">{personal}</Text>
          <NotificationPermissionNotice />
        </View>
      </ChoiceField>
      {reminds ? (
        <ChoiceField
          name="闹铃"
          title="闹铃"
          icon={rowIcon(AlarmClock)}
          summary={alarmSummary(choice, settings)}
          muted={alarmValue(choice) === 'default'}
          options={alarmOptions(settings)}
          value={[alarmValue(choice)]}
          disabled={disabled}
          onChange={([next]) => { if (next !== undefined) onChange(choiceFromValue(choiceValue(choice), next)); }}
        >
          <View style={{ paddingHorizontal: theme.spacing[2] }}>
            <Text variant="bodySm">{alarmsSupported ? personal : `${personal}闹铃只在 Android 手机上响，这台设备上仍是普通提醒。`}</Text>
          </View>
        </ChoiceField>
      ) : null}
    </>
  );
}
