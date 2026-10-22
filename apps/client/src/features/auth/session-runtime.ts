import { draftWorkspace } from '../../ui/workspace-runtime';
import { ApiClient } from '@muchakucha/api-client';
import { Platform } from 'react-native';

import { notifyAfterSuccess } from '../../api/notify-after-success';
import { withSessionRetry } from '../../api/session-retry';
import { cancelAllReminders } from '../../platform/reminders/reminder-notifications';
import { REMINDER_INPUT_CALLS, remindersMayHaveChanged } from '../reminders/reminder-signal';
import { createSessionStateStore } from './session-state';
import { createNativeSessionTransport } from '../../platform/session/session-transport.native';
import { createWebSessionTransport } from '../../platform/session/session-transport.web';

const apiOrigin = process.env.EXPO_PUBLIC_API_ORIGIN ?? 'http://localhost:3000';

// The transport refreshes through the raw client; screens use the retrying one.
const rawApiClient = new ApiClient(apiOrigin);
export const sessionStateStore = createSessionStateStore();
export const sessionTransport =
  Platform.OS === 'web'
    ? createWebSessionTransport(rawApiClient)
    : createNativeSessionTransport(rawApiClient);

let sessionLostHandler: (() => void) | null = null;
/** The root layout routes to sign-in when a refresh finds the session gone. */
export function setSessionLostHandler(handler: (() => void) | null): void {
  sessionLostHandler = handler;
}

// Successful writes that can move a reminder mark this phone's reminders stale.
export const sessionApiClient = notifyAfterSuccess(withSessionRetry(rawApiClient, {
  getAccessToken: () => sessionTransport.getAccessToken(),
  refresh: async () => {
    const outcome = await sessionTransport.refresh();
    if (outcome.kind === 'authenticated') sessionStateStore.enterAuthenticated(outcome.session);
    return outcome;
  },
  onSessionLost: (outcome) => {
    void sessionTransport.clear();
    sessionStateStore.enterReauthenticationRequired(outcome.kind === 'reauthRequired' ? outcome.reason : 'expired');
    sessionLostHandler?.();
  },
}), REMINDER_INPUT_CALLS, remindersMayHaveChanged);

// Session changes are synchronous: account drafts are loaded before protected
// forms mount, and sign-out clears them even when navigating outside that tree.
// Expiry keeps them for the same account's next sign-in; revocation and replay
// are treated like sign-out.
sessionStateStore.subscribe((state) => {
  if (state.kind === 'authenticated' && state.session.currentUser !== undefined) {
    draftWorkspace.activateAccount(state.session.currentUser.id);
  } else if (state.kind === 'reauthRequired' && state.reason === 'expired') {
    draftWorkspace.suspendSession();
  } else if (state.kind === 'unauthenticated' || state.kind === 'reauthRequired') {
    draftWorkspace.endSession();
    // A signed-out phone shows no family content on its lock screen.
    void cancelAllReminders().catch(() => undefined);
  }
});
