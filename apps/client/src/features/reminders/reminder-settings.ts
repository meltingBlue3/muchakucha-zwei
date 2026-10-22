import type { ReminderSettingsDto, UpdateReminderSettingsDto } from '@muchakucha/api-client';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { sessionApiClient, sessionTransport } from '../auth/session-runtime';
import { useCurrentUser } from '../auth/use-current-user';

type Status = 'loading' | 'ready' | 'failed';

interface Snapshot {
  /** Whose settings these are; another account on this device starts over. */
  userId: string | null;
  settings: ReminderSettingsDto | null;
  status: Status;
}

let snapshot: Snapshot = { userId: null, settings: null, status: 'loading' };
const listeners = new Set<() => void>();

function publish(next: Snapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

async function accessToken(): Promise<string> {
  const token = await sessionTransport.getAccessToken();
  if (token === null) throw new Error('Session expired');
  return token;
}

async function load(userId: string): Promise<void> {
  // Settings already shown stay visible while they refresh.
  publish({ userId, settings: snapshot.userId === userId ? snapshot.settings : null, status: 'loading' });
  try {
    const settings = await sessionApiClient.getReminderSettings(await accessToken());
    if (snapshot.userId === userId) publish({ userId, settings, status: 'ready' });
  } catch {
    if (snapshot.userId === userId) publish({ ...snapshot, status: 'failed' });
  }
}

/**
 * The signed-in person's reminder settings, shared by the 提醒 page and every
 * form that shows what "默认" means. Loaded once per account and on `reload`.
 */
export function useReminderSettings(): {
  settings: ReminderSettingsDto | null;
  status: Status;
  reload(): void;
  save(next: UpdateReminderSettingsDto): Promise<void>;
} {
  const userId = useCurrentUser()?.id ?? null;
  const current = useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
  const mine = current.userId === userId;

  useEffect(() => {
    if (userId !== null && snapshot.userId !== userId) void load(userId);
  }, [userId]);

  const reload = useCallback(() => { if (userId !== null) void load(userId); }, [userId]);
  const save = useCallback(async (next: UpdateReminderSettingsDto) => {
    if (userId === null) throw new Error('Session expired');
    const settings = await sessionApiClient.updateReminderSettings(await accessToken(), next);
    publish({ userId, settings, status: 'ready' });
  }, [userId]);

  return { settings: mine ? current.settings : null, status: mine ? current.status : 'loading', reload, save };
}
