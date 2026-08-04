import type { ListMyHouseholdsItemDto } from '@muchakucha/api-client';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import type { HouseholdApi } from './household-api';
import { fetchHouseholds } from './household-api';
import type { CurrentHouseholdStore } from '../../platform/household/current-household';
import { createNativeCurrentHouseholdStore } from '../../platform/household/current-household.native';
import { createWebCurrentHouseholdStore } from '../../platform/household/current-household.web';

export type HouseholdViewState =
  | 'resolving'
  | 'ready'
  | 'noHousehold'
  | 'offlineRetained'
  | 'accessChanged';

export interface HouseholdContextValue {
  viewState: HouseholdViewState;
  households: ListMyHouseholdsItemDto[];
  currentHouseholdId: string | null;
  accessChangedHouseholdName: string | undefined;
  switchHousehold: (householdId: string) => Promise<boolean>;
  refreshHouseholds: () => Promise<boolean>;
  enterAccessChanged: (lostHouseholdName?: string) => void;
  resolve: () => Promise<void>;
}

const HouseholdContext = createContext<HouseholdContextValue | null>(null);

export function useHouseholdContext(): HouseholdContextValue {
  const context = useContext(HouseholdContext);
  if (context === null) {
    throw new Error('useHouseholdContext must be used within a HouseholdProvider.');
  }
  return context;
}

function createCurrentHouseholdStore(): CurrentHouseholdStore {
  return Platform.OS === 'web'
    ? createWebCurrentHouseholdStore()
    : createNativeCurrentHouseholdStore();
}

function sortHouseholds(
  items: ListMyHouseholdsItemDto[],
  currentId: string | null,
  timestamps: Record<string, number>,
): ListMyHouseholdsItemDto[] {
  const sorted = [...items];
  sorted.sort((a, b) => {
    // Current household first.
    const aCurrent = a.id === currentId ? 0 : 1;
    const bCurrent = b.id === currentId ? 0 : 1;
    if (aCurrent !== bCurrent) return aCurrent - bCurrent;

    // Then descending successful access UTC epoch ms.
    const aTs = timestamps[a.id] ?? 0;
    const bTs = timestamps[b.id] ?? 0;
    if (aTs !== bTs) return bTs - aTs;

    // Then NFC locale/name ascending.
    const nameCompare = a.name.localeCompare(b.name, 'zh-CN-u-co-phonebk', {
      sensitivity: 'base',
    });
    if (nameCompare !== 0) return nameCompare;

    // Then stable household UUID code-point ascending.
    return a.id.localeCompare(b.id);
  });
  return sorted;
}

export function createHouseholdProvider(
  householdApi: HouseholdApi,
  getAccessToken: () => string | null,
  store: CurrentHouseholdStore = createCurrentHouseholdStore(),
) {
  return function HouseholdProvider({ children }: { children: React.ReactNode }) {
    const [viewState, setViewState] = useState<HouseholdViewState>('resolving');
    const [households, setHouseholds] = useState<ListMyHouseholdsItemDto[]>([]);
    const [currentHouseholdId, setCurrentHouseholdId] = useState<string | null>(null);
    const [accessChangedHouseholdName, setAccessChangedHouseholdName] = useState<string | undefined>(undefined);
    const resolvePromise = useRef<Promise<void> | null>(null);
    const mountedRef = useRef(true);

    const doResolve = useCallback(async (): Promise<void> => {
      await store.hydrate();
      const accessToken = getAccessToken();
      if (accessToken === null) {
        if (mountedRef.current) {
          setViewState('noHousehold');
          setHouseholds([]);
          setCurrentHouseholdId(null);
        }
        return;
      }

      try {
        const result = await fetchHouseholds(householdApi, accessToken);
        const items = result.items;

        if (!mountedRef.current) return;

        if (items.length === 0) {
          await store.clearAll();
          setHouseholds([]);
          setCurrentHouseholdId(null);
          setViewState('noHousehold');
          return;
        }

        // Restore device-local preference.
        const persistedId = store.getCurrentId();
        const timestamps = store.getAccessTimestamps();
        const validPersistedId = persistedId !== null && items.some((h) => h.id === persistedId)
          ? persistedId
          : null;

        const sorted = sortHouseholds(items, validPersistedId, timestamps);
        const activeId = validPersistedId ?? sorted[0]!.id;

        setHouseholds(sorted);
        setCurrentHouseholdId(activeId);

        if (validPersistedId === null) {
          await store.setCurrentId(activeId);
        }

        // Update the access timestamp for the current household.
        const now = Date.now();
        const updatedTimestamps = { ...timestamps, [activeId]: now };
        // Prune entries for households no longer joined.
        const joinedIds = new Set(items.map((h) => h.id));
        for (const id of Object.keys(updatedTimestamps)) {
          if (!joinedIds.has(id)) delete updatedTimestamps[id];
        }
        await store.setAccessTimestamps(updatedTimestamps);

        setViewState('ready');
      } catch {
        if (!mountedRef.current) return;

        // If we have cached data, retain it as offline.
        const cachedId = store.getCurrentId();
        if (cachedId !== null) {
          setViewState('offlineRetained');
        } else {
          setViewState('noHousehold');
        }
      }
    }, [getAccessToken, householdApi, store]);

    const resolve = useCallback(async (): Promise<void> => {
      if (resolvePromise.current !== null) return resolvePromise.current;
      const promise = doResolve().finally(() => {
        resolvePromise.current = null;
      });
      resolvePromise.current = promise;
      return promise;
    }, [doResolve]);

    const refreshHouseholds = useCallback(async (): Promise<boolean> => {
      setViewState('resolving');
      // Persist current selection during refresh.
      const priorId = currentHouseholdId;
      const accessToken = getAccessToken();
      if (accessToken === null) {
        setViewState('noHousehold');
        return false;
      }
      try {
        const result = await fetchHouseholds(householdApi, accessToken);
        if (!mountedRef.current) return false;

        if (result.items.length === 0) {
          await store.clearAll();
          setHouseholds([]);
          setCurrentHouseholdId(null);
          setViewState('noHousehold');
          return true;
        }

        const timestamps = store.getAccessTimestamps();
        const validId = priorId !== null && result.items.some((h) => h.id === priorId)
          ? priorId
          : result.items[0]!.id;
        const sorted = sortHouseholds(result.items, validId, timestamps);
        setHouseholds(sorted);
        setCurrentHouseholdId(validId);
        setViewState('ready');

        const now = Date.now();
        const updatedTimestamps = { ...timestamps, [validId]: now };
        const joinedIds = new Set(result.items.map((h) => h.id));
        for (const id of Object.keys(updatedTimestamps)) {
          if (!joinedIds.has(id)) delete updatedTimestamps[id];
        }
        await store.setAccessTimestamps(updatedTimestamps);
        setAccessChangedHouseholdName(undefined);
        return true;
      } catch {
        if (mountedRef.current) {
          setViewState(priorId !== null ? 'offlineRetained' : 'noHousehold');
        }
        return false;
      }
    }, [currentHouseholdId, getAccessToken, householdApi, store]);

    const switchHousehold = useCallback(async (householdId: string): Promise<boolean> => {
      const membership = households.find((h) => h.id === householdId);
      if (membership === undefined) return false;

      setViewState('resolving');

      // Attempt authoritative membership query.
      const accessToken = getAccessToken();
      if (accessToken === null) {
        setViewState('ready');
        return false;
      }

      try {
        const result = await fetchHouseholds(householdApi, accessToken);
        if (!mountedRef.current) return false;

        const confirmed = result.items.find((h) => h.id === householdId);
        if (confirmed === undefined) {
          await store.clearHouseholdData(householdId);
          setHouseholds(sortHouseholds(result.items, null, store.getAccessTimestamps()));
          setCurrentHouseholdId(null);
          setAccessChangedHouseholdName(membership.name);
          setViewState('accessChanged');
          return false;
        }

        // Update timestamps and current selection.
        const timestamps = store.getAccessTimestamps();
        const now = Date.now();
        const updatedTimestamps = { ...timestamps, [householdId]: now };
        await store.setAccessTimestamps(updatedTimestamps);
        await store.setCurrentId(householdId);

        const sorted = sortHouseholds(result.items, householdId, updatedTimestamps);
        setHouseholds(sorted);
        setCurrentHouseholdId(householdId);
        setAccessChangedHouseholdName(undefined);
        setViewState('ready');
        return true;
      } catch {
        if (mountedRef.current) {
          // Switch failure — retain prior household.
          setViewState('ready');
        }
        return false;
      }
    }, [households, getAccessToken, householdApi, store]);

    const enterAccessChanged = useCallback((lostHouseholdName?: string) => {
      setAccessChangedHouseholdName(lostHouseholdName);
      // Freeze actions by setting to accessChanged.
      // Clear lost household cache and persistence.
      if (currentHouseholdId !== null) {
        store.clearHouseholdData(currentHouseholdId).catch(() => undefined);
      }
      setCurrentHouseholdId(null);
      setViewState('accessChanged');
    }, [currentHouseholdId, store]);

    useEffect(() => {
      mountedRef.current = true;
      void resolve();
      return () => {
        mountedRef.current = false;
      };
    }, [resolve]);

    const value: HouseholdContextValue = {
      viewState,
      households,
      currentHouseholdId,
      accessChangedHouseholdName,
      switchHousehold,
      refreshHouseholds,
      enterAccessChanged,
      resolve,
    };

    return React.createElement(
      HouseholdContext.Provider,
      { value },
      children,
    );
  };
}
