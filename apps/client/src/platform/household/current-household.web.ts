import type { CurrentHouseholdStore } from './current-household';

const CURRENT_ID_KEY = 'muchakucha:currentHouseholdId';
const ACCESS_TIMESTAMPS_KEY = 'muchakucha:householdAccessTimestamps';

function readStorage(key: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage quota or unavailable — degrade gracefully.
  }
}

function removeStorage(key: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}

export function createWebCurrentHouseholdStore(): CurrentHouseholdStore {
  return {
    async hydrate(): Promise<void> {},

    getCurrentId(): string | null {
      return readStorage(CURRENT_ID_KEY);
    },

    async setCurrentId(id: string): Promise<void> {
      writeStorage(CURRENT_ID_KEY, id);
    },

    getAccessTimestamps(): Record<string, number> {
      const raw = readStorage(ACCESS_TIMESTAMPS_KEY);
      if (raw === null) return {};
      try {
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          const record: Record<string, number> = {};
          for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
            if (typeof value === 'number') record[key] = value;
          }
          return record;
        }
        return {};
      } catch {
        return {};
      }
    },

    async setAccessTimestamps(timestamps: Record<string, number>): Promise<void> {
      writeStorage(ACCESS_TIMESTAMPS_KEY, JSON.stringify(timestamps));
    },

    async clearCurrentId(): Promise<void> {
      removeStorage(CURRENT_ID_KEY);
    },

    async clearHouseholdData(householdId: string): Promise<void> {
      const timestamps = this.getAccessTimestamps();
      delete timestamps[householdId];
      await this.setAccessTimestamps(timestamps);
      if (this.getCurrentId() === householdId) {
        await this.clearCurrentId();
      }
    },

    async clearAll(): Promise<void> {
      removeStorage(CURRENT_ID_KEY);
      removeStorage(ACCESS_TIMESTAMPS_KEY);
    },
  };
}
