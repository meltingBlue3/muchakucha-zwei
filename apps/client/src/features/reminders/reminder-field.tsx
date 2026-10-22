import Bell from 'lucide-react-native/icons/bell';
import type { ReminderChoiceDto } from '@muchakucha/api-client';
import { View } from 'react-native';
import { ChoiceField, rowIcon } from '../../ui/compose-rows';
import { Text } from '../../ui/primitives';
import { theme } from '../../ui/theme';
import { NotificationPermissionNotice } from './notification-permission';
import { choiceFromValue, choiceValue, fitChoice, reminderOptions, reminderSummary, type ReminderKind } from './reminder-rules';
import { useReminderSettings } from './reminder-settings';

/**
 * 提醒我: the person's own reminder for the task or event in the form. It
 * belongs only to them, and on a recurring item to the whole series.
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
  return (
    <ChoiceField
      name="提醒我"
      title="提醒我"
      icon={rowIcon(Bell)}
      summary={reminderSummary(choice, context)}
      muted={choice.mode === 'default'}
      options={reminderOptions(context)}
      value={[choiceValue(choice)]}
      disabled={disabled}
      onChange={([next]) => { if (next !== undefined) onChange(choiceFromValue(next)); }}
    >
      <View style={{ paddingHorizontal: theme.spacing[2], gap: theme.spacing[3] }}>
        <Text variant="bodySm">
          {recurring ? '只改你自己的提醒，家人不受影响。对这个重复安排的每一次都生效。' : '只改你自己的提醒，家人不受影响。'}
        </Text>
        <NotificationPermissionNotice />
      </View>
    </ChoiceField>
  );
}
