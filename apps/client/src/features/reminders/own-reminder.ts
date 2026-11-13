import type { ReminderChoiceDto } from '@muchakucha/api-client';
import { sessionApiClient, sessionTransport } from '../auth/session-runtime';
import { DEFAULT_REMINDER, sameChoice } from './reminder-rules';

/**
 * Saves an edit form's 提醒我 when it changed. It is personal, so it goes on
 * its own request: it is no edit of the shared content, needs no version and
 * applies to a whole series without asking which occurrences. Saving it again
 * is harmless, so a later failure of the content save can simply be retried.
 * Returns the translation key to show, or null.
 */
export async function saveOwnReminder(
  kind: 'task' | 'event',
  householdId: string,
  itemId: string,
  next: ReminderChoiceDto | undefined,
  saved: ReminderChoiceDto | undefined,
): Promise<'auth:errors.sessionExpired' | 'reminders:saveFailed' | null> {
  // Content without a stored choice follows the defaults.
  if (next === undefined || sameChoice(next, saved ?? DEFAULT_REMINDER)) return null;
  const token = await sessionTransport.getAccessToken();
  if (token === null) return 'auth:errors.sessionExpired';
  try {
    if (kind === 'task') await sessionApiClient.setTaskReminder(token, householdId, itemId, next);
    else await sessionApiClient.setEventReminder(token, householdId, itemId, next);
    return null;
  } catch {
    return 'reminders:saveFailed';
  }
}

export function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && [...left].sort().join(',') === [...right].sort().join(',');
}
