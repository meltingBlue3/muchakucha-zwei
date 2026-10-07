import type { CurrentUserDto } from '@muchakucha/api-client';
import { useSyncExternalStore } from 'react';
import { sessionStateStore } from './session-runtime';

/** The signed-in person, kept current when they rename themselves; null until known. */
export function useCurrentUser(): CurrentUserDto | null {
  const state = useSyncExternalStore(sessionStateStore.subscribe, sessionStateStore.get, sessionStateStore.get);
  return state.kind === 'authenticated' ? state.session.currentUser ?? null : null;
}
