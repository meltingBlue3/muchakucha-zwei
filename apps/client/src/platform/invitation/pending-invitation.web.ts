import type { PendingInvitationStore } from './pending-invitation';

const KEY = 'muchakucha:pendingInvitationToken';

export function createWebPendingInvitationStore(): PendingInvitationStore {
  return {
    async get() {
      try {
        return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(KEY);
      } catch {
        return null;
      }
    },
    async set(token) {
      try {
        sessionStorage.setItem(KEY, token);
      } catch {}
    },
    async clear() {
      try {
        sessionStorage.removeItem(KEY);
      } catch {}
    },
  };
}
