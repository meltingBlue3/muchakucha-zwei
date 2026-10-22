import type { ReminderChoiceDto } from '@muchakucha/api-client';
import { DetailField } from '../../ui/detail-fields';
import { reminderDetail, type ReminderKind } from './reminder-rules';
import { useReminderSettings } from './reminder-settings';

/** 提醒我 in a task or event detail: when this person's reminder comes, not just its rule. */
export function ReminderDetailField({ kind, householdId, anchor, dateOnly, own, choice }: {
  kind: ReminderKind;
  householdId: string;
  /** The due or start time. */
  anchor: string;
  dateOnly: boolean;
  own: boolean;
  choice: ReminderChoiceDto;
}) {
  const { settings } = useReminderSettings();
  if (settings?.households.some(household => household.id === householdId && household.muted)) {
    return <DetailField label="提醒我" value="这个家庭的提醒已关闭" />;
  }
  return <DetailField label="提醒我" value={reminderDetail(new Date(anchor), choice, { kind, own, dateOnly, defaults: settings })} />;
}
