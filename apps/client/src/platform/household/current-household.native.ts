import * as SecureStore from 'expo-secure-store';
import type { CurrentHouseholdStore } from './current-household';

const CURRENT_ID_KEY = 'muchakucha:currentHouseholdId';
const ACCESS_TIMESTAMPS_KEY = 'muchakucha:householdAccessTimestamps';

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

  return {
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
      const timestamps = cachedTimestamps ?? {};
      delete timestamps[householdId];
      await this.setAccessTimestamps(timestamps);
      if (cachedId === householdId) {
        await this.clearCurrentId();
      }
    },

    async clearAll(): Promise<void> {
      cachedId = null;
      cachedTimestamps = null;
      await removeStore(CURRENT_ID_KEY);
      await removeStore(ACCESS_TIMESTAMPS_KEY);
    },
  };
}
