import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import * as device from '../../platform/reminders/reminder-notifications';
import { sessionApiClient, sessionTransport } from '../auth/session-runtime';
import { useHouseholdContext } from '../households/household-context';
import { reminderChanges, reminderNotification } from './reminder-plan';
import { onRemindersMayHaveChanged } from './reminder-signal';

let showHousehold = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let running: Promise<void> | null = null;
let again = false;

async function syncOnce(): Promise<void> {
  if (await device.notificationPermission() !== 'granted') return;
  const token = await sessionTransport.getAccessToken();
  if (token === null) return;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const { reminders } = await sessionApiClient.listUpcomingReminders(token, timeZone);
  const wanted = reminders.map(reminder => reminderNotification(reminder, { showHousehold }));
  const { cancel, schedule } = reminderChanges(await device.scheduledReminderIds(), wanted);
  for (const id of cancel) await device.cancelReminder(id);
  for (const notification of schedule) await device.scheduleReminder(notification);
}

/**
 * Makes this phone hold exactly the reminders the server lists now. One run
 * at a time; a request during a run starts one more afterwards. Without a
 * connection the reminders already scheduled stay as they are.
 */
export function syncReminders(): Promise<void> {
  if (!device.remindersSupported) return Promise.resolve();
  if (running !== null) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      try { await syncOnce(); } catch { /* Kept as scheduled; the next request retries. */ }
    } while (again);
  })().finally(() => { running = null; });
  return running;
}

/** Several saves in a row cost one sync. */
export function requestReminderSync(delayMs = 800): void {
  if (!device.remindersSupported) return;
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void syncReminders();
  }, delayMs);
}

/**
 * Keeps reminders current while signed in — on start, on return to the
 * foreground, after any change that can move one, when households change —
 * and opens the content of a tapped reminder.
 */
export function ReminderSync(): null {
  const { households } = useHouseholdContext();
  const router = useRouter();
  const householdKey = households.map(household => household.id).sort().join(',');

  useEffect(() => {
    showHousehold = householdKey.includes(',');
    requestReminderSync();
  }, [householdKey]);

  useEffect(() => {
    if (!device.remindersSupported) return undefined;
    const stopChanges = onRemindersMayHaveChanged(() => requestReminderSync());
    const appState = AppState.addEventListener('change', state => { if (state === 'active') requestReminderSync(); });
    return () => { stopChanges(); appState.remove(); };
  }, []);

  useEffect(() => {
    if (!device.remindersSupported) return undefined;
    const open = (url: string) => router.push(url as Href);
    const stop = device.onReminderOpened(open);
    void device.takeLaunchReminderUrl().then(url => { if (url !== null) open(url); }, () => undefined);
    return stop;
  }, [router]);

  return null;
}
