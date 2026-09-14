import * as SecureStore from 'expo-secure-store';

import type { PendingInvitationStore } from './pending-invitation';

const KEY = 'muchakucha.pendingInvitationToken';

export function createNativePendingInvitationStore(): PendingInvitationStore {
  return {
    async get() {
      try {
        return await SecureStore.getItemAsync(KEY);
      } catch {
        return null;
      }
    },
    async set(token) {
      try {
        await SecureStore.setItemAsync(KEY, token);
      } catch {
        // Invitation recovery is best-effort when secure storage is unavailable.
      }
    },
    async clear() {
      try {
        await SecureStore.deleteItemAsync(KEY);
      } catch {
        // Clearing an already unavailable store is idempotent.
      }
    },
  };
}
