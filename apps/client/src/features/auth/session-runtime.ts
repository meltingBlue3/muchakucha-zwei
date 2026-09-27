import { draftWorkspace } from '../../ui/workspace-runtime';
import { ApiClient } from '@muchakucha/api-client';
import { Platform } from 'react-native';

import { withSessionRetry } from '../../api/session-retry';
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

export const sessionApiClient = withSessionRetry(rawApiClient, {
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
});

// Session changes are synchronous: account drafts are loaded before protected
// forms mount, and sign-out clears them even when navigating outside that tree.
sessionStateStore.subscribe((state) => {
  if (state.kind === 'authenticated' && state.session.currentUser !== undefined) {
    draftWorkspace.activateAccount(state.session.currentUser.id);
  } else if (state.kind === 'unauthenticated' || state.kind === 'reauthRequired') {
    draftWorkspace.endSession();
  }
});
