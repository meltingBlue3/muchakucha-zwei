import type { DraftStorage } from '../platform/drafts/draft-storage';

function isDraft(key: string): boolean { return /^draft:[^:]+:[^:]+:[^:]+:/.test(key); }

export function createWorkspaceState(storage?: DraftStorage) {
  const values = new Map<string, unknown>();
  const dirtyDrafts = new Set<string>();
  const listeners = new Set<() => void>();
  let accountId: string | null = null;
  let allowedHouseholds: Set<string> | null = null;
  let persistenceError = false;
  const emit = () => listeners.forEach((listener) => listener());
  const persist = () => {
    if (storage === undefined || accountId === null) return;
    try {
      const drafts = Object.fromEntries([...values].filter(([key]) => dirtyDrafts.has(key)));
      if (Object.keys(drafts).length === 0) storage.remove(accountId);
      else storage.write(accountId, JSON.stringify({ version: 1, drafts }));
      persistenceError = false;
    } catch { persistenceError = true; }
  };
  return {
    activateAccount(id: string) {
      if (accountId === id) return;
      values.clear(); dirtyDrafts.clear(); allowedHouseholds = null; accountId = id;
      persistenceError = false;
      try {
        const raw = storage?.read(id);
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          if (typeof parsed !== 'object' || parsed === null || !('version' in parsed) || parsed.version !== 1 || !('drafts' in parsed) || typeof parsed.drafts !== 'object' || parsed.drafts === null || Array.isArray(parsed.drafts)) throw new Error('Invalid draft data');
          for (const [key, value] of Object.entries(parsed.drafts)) {
            if (isDraft(key)) { values.set(key, value); dirtyDrafts.add(key); }
          }
        }
      } catch { persistenceError = true; }
      emit();
    },
    endSession() {
      values.clear(); dirtyDrafts.clear();
      persist();
      accountId = null; allowedHouseholds = null;
      emit();
    },
    retainHouseholds(ids: string[]) {
      allowedHouseholds = new Set(ids);
      for (const key of values.keys()) {
        if (isDraft(key) && !allowedHouseholds.has(key.split(':')[1]!)) { values.delete(key); dirtyDrafts.delete(key); }
      }
      persist(); emit();
    },
    clearHousehold(id: string) {
      allowedHouseholds?.delete(id);
      for (const key of values.keys()) {
        if (key.startsWith(`draft:${id}:`) || key.startsWith(`view:${id}:`)) { values.delete(key); dirtyDrafts.delete(key); }
      }
      persist(); emit();
    },
    has: (key: string) => values.has(key),
    seed(key: string, value: unknown) { if (!values.has(key)) { values.set(key, value); emit(); } },
    get: (key: string) => values.get(key),
    set(key: string, value: unknown) {
      if (storage !== undefined && accountId === null) return;
      if (isDraft(key) && allowedHouseholds !== null && !allowedHouseholds.has(key.split(':')[1]!)) return;
      values.set(key, value);
      if (isDraft(key)) { dirtyDrafts.add(key); persist(); }
      emit();
    },
    clear(prefix: string) {
      for (const key of values.keys()) if (key.startsWith(prefix)) { values.delete(key); dirtyDrafts.delete(key); }
      persist(); emit();
    },
    hasDrafts: (prefix = 'draft:') => [...dirtyDrafts].some((key) => key.startsWith(prefix)),
    persistenceFailed: () => persistenceError,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

/** Reject malformed persisted field types before handing a draft to a form. */
export function compatibleDraft(value: unknown, initial: unknown): boolean {
  if (initial === null) {
    if (value === null) return true;
    if (typeof value !== 'object' || Array.isArray(value)) return false;
    if ('id' in value) return typeof value.id === 'string' && 'labelIds' in value && Array.isArray(value.labelIds) && value.labelIds.every((id) => typeof id === 'string');
    return 'freq' in value && ['daily', 'weekly', 'monthly', 'yearly'].includes(String(value.freq)) &&
      'startsOn' in value && typeof value.startsOn === 'string' && 'timezone' in value && typeof value.timezone === 'string' &&
      (!('byWeekday' in value) || (Array.isArray(value.byWeekday) && value.byWeekday.every((day) => typeof day === 'number'))) &&
      ['interval', 'count', 'durationMinutes'].every((key) => !(key in value) || typeof (value as Record<string, unknown>)[key] === 'number') &&
      ['endsOn', 'startTimeLocal'].every((key) => !(key in value) || typeof (value as Record<string, unknown>)[key] === 'string');
  }
  if (Array.isArray(initial)) return Array.isArray(value) && value.every((item) => typeof item === 'string' || typeof item === 'number');
  if (typeof initial === 'object' && initial !== null) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    return Object.entries(initial).every(([key, example]) => key in value && compatibleDraft((value as Record<string, unknown>)[key], key === 'recurrence' ? null : example));
  }
  return typeof value === typeof initial;
}
