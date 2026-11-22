import { currentLanguage, i18n } from '../../i18n';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import * as device from '../../platform/reminders/reminder-notifications';
import { getReminderPushToken, pushRegistrationEnabled, reminderPushProvider } from '../../platform/reminders/reminder-push';
import { sessionApiClient, sessionTransport } from '../auth/session-runtime';
import { useHouseholdContext } from '../households/household-context';
import { reminderChanges, reminderNotification } from './reminder-plan';
import { onRemindersMayHaveChanged } from './reminder-signal';

let showHousehold = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let running: Promise<void> | null = null;
let again = false;

async function syncOnce(): Promise<void> {
  const permission = await device.notificationPermission();
  const pushToken = permission === 'granted' ? await getReminderPushToken(requestReminderSync) : null;
  const token = await sessionTransport.getAccessToken();
  if (token === null) return;
  if (permission !== 'granted') {
    if (pushRegistrationEnabled) await sessionApiClient.unregisterReminderPush(token);
    return;
  }
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  // A failed channel rename should not prevent alarms from being reconciled.
  await device.refreshReminderChannels().catch(() => undefined);
  if (pushRegistrationEnabled && pushToken === null) await sessionApiClient.unregisterReminderPush(token);
  const push = pushToken === null ? false : (await sessionApiClient.registerReminderPush(token, {
    ...pushToken,
    provider: reminderPushProvider,
    timeZone,
    language: currentLanguage(),
    localAlarms: device.localAlarmsSupported,
  })).active;
  if (push) {
    await device.cancelLocalReminderNotifications();
    if (!device.localAlarmsSupported) return;
  }
  const { reminders } = await sessionApiClient.listUpcomingReminders(token, timeZone);
  const wanted = reminders.map(reminder => reminderNotification(reminder, { showHousehold }));
  const local = push ? wanted.filter(reminder => reminder.alarm) : wanted;
  const { cancel, schedule } = reminderChanges(await device.scheduledReminderIds(), local);
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
    const syncLanguage = () => requestReminderSync(0);
    i18n.on('languageChanged', syncLanguage);
    const appState = AppState.addEventListener('change', state => { if (state === 'active') requestReminderSync(); });
    return () => { stopChanges(); i18n.off('languageChanged', syncLanguage); appState.remove(); };
  }, []);

  useEffect(() => {
    if (!device.remindersSupported) return undefined;
    const open = (url: string) => router.push(url as Href);
    return device.onReminderOpened(open);
  }, [router]);

  return null;
}
