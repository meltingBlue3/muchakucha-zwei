import { draftWorkspace } from '../../ui/workspace-runtime';
import { ApiClient } from '@muchakucha/api-client';
import { Platform } from 'react-native';

import { createSessionStateStore } from './session-state';
import { createNativeSessionTransport } from '../../platform/session/session-transport.native';
import { createWebSessionTransport } from '../../platform/session/session-transport.web';

const apiOrigin = process.env.EXPO_PUBLIC_API_ORIGIN ?? 'http://localhost:3000';

export const sessionApiClient = new ApiClient(apiOrigin);
export const sessionStateStore = createSessionStateStore();
export const sessionTransport =
  Platform.OS === 'web'
    ? createWebSessionTransport(sessionApiClient)
    : createNativeSessionTransport(sessionApiClient);

// Session changes are synchronous: account drafts are loaded before protected
// forms mount, and sign-out clears them even when navigating outside that tree.
sessionStateStore.subscribe((state) => {
  if (state.kind === 'authenticated' && state.session.currentUser !== undefined) {
    draftWorkspace.activateAccount(state.session.currentUser.id);
  } else if (state.kind === 'unauthenticated' || state.kind === 'reauthRequired') {
    draftWorkspace.endSession();
  }
});
