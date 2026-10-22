/**
 * Client calls whose success can change which reminders this person should
 * get: content with a time, personal reminder choices, and household
 * membership. The assistant's approved actions may be any of these.
 */
export const REMINDER_INPUT_CALLS: ReadonlySet<string> = new Set([
  'createTask', 'updateTask', 'deleteTask', 'updateTaskSeries', 'deleteTaskSeries',
  'createEvent', 'updateEvent', 'deleteEvent', 'updateEventSeries', 'deleteEventSeries',
  'updateRecurrenceRule', 'endRecurrenceRule',
  'setTaskReminder', 'setEventReminder', 'updateReminderSettings',
  'createHousehold', 'acceptInvitation', 'leaveHousehold', 'leaveHouseholdMembership',
  'decideAssistantAction',
]);

const listeners = new Set<() => void>();

export function remindersMayHaveChanged(): void {
  for (const listener of listeners) listener();
}

export function onRemindersMayHaveChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
