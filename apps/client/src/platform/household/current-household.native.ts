import * as SecureStore from 'expo-secure-store';
import type { CurrentHouseholdStore, TimeScope } from './current-household';

// SecureStore keys allow only letters, digits, ".", "-" and "_"; any other
// character throws, and the store below swallows that as "unavailable".
const CURRENT_ID_KEY = 'muchakucha.household.current.v1';
const ACCESS_TIMESTAMPS_KEY = 'muchakucha.household.accessTimestamps.v1';
const SCOPE_KEY = 'muchakucha.household.timeScope.v1';

async function readStore(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function writeStore(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    // SecureStore unavailable — degrade gracefully.
  }
}

async function removeStore(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Ignore.
  }
}

export function createNativeCurrentHouseholdStore(): CurrentHouseholdStore {
  let cachedId: string | null = null;
  let cachedTimestamps: Record<string, number> | null = null;
  let cachedScope: TimeScope | null = null;
  let hydration: Promise<void> | null = null;

  return {
    async hydrate(): Promise<void> {
      hydration ??= Promise.all([
        readStore(CURRENT_ID_KEY),
        readStore(ACCESS_TIMESTAMPS_KEY),
        readStore(SCOPE_KEY),
      ]).then(([storedId, storedTimestamps, storedScope]) => {
        cachedId = storedId;
        cachedScope = storedScope === 'overview' || storedScope === 'household' ? storedScope : null;
        if (storedTimestamps === null) {
          cachedTimestamps = {};
          return;
        }
        try {
          const parsed: unknown = JSON.parse(storedTimestamps);
          const timestamps: Record<string, number> = {};
          if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
              if (typeof value === 'number' && Number.isFinite(value)) timestamps[id] = value;
            }
          }
          cachedTimestamps = timestamps;
        } catch {
          cachedTimestamps = {};
        }
      });
      await hydration;
    },

    getScope(): TimeScope | null {
      return cachedScope;
    },

    async setScope(scope: TimeScope): Promise<void> {
      cachedScope = scope;
      await writeStore(SCOPE_KEY, scope);
    },

    getCurrentId(): string | null {
      return cachedId;
    },

    async setCurrentId(id: string): Promise<void> {
      cachedId = id;
      await writeStore(CURRENT_ID_KEY, id);
    },

    getAccessTimestamps(): Record<string, number> {
      return cachedTimestamps ?? {};
    },

    async setAccessTimestamps(timestamps: Record<string, number>): Promise<void> {
      cachedTimestamps = timestamps;
      await writeStore(ACCESS_TIMESTAMPS_KEY, JSON.stringify(timestamps));
    },

    async clearCurrentId(): Promise<void> {
      cachedId = null;
      await removeStore(CURRENT_ID_KEY);
    },

    async clearHouseholdData(householdId: string): Promise<void> {
      const timestamps = { ...(cachedTimestamps ?? {}) };
      delete timestamps[householdId];
      await this.setAccessTimestamps(timestamps);
      if (cachedId === householdId) {
        await this.clearCurrentId();
      }
    },

    async clearAll(): Promise<void> {
      cachedId = null;
      cachedTimestamps = null;
      cachedScope = null;
      await removeStore(CURRENT_ID_KEY);
      await removeStore(ACCESS_TIMESTAMPS_KEY);
      await removeStore(SCOPE_KEY);
    },
  };
}

export const createCurrentHouseholdStore: () => CurrentHouseholdStore = createNativeCurrentHouseholdStore;
