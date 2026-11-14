export interface CurrentHouseholdStore {
  hydrate(): Promise<void>;
  getCurrentId(): string | null;
  setCurrentId(id: string): Promise<void>;
  getAccessTimestamps(): Record<string, number>;
  setAccessTimestamps(timestamps: Record<string, number>): Promise<void>;
  clearCurrentId(): Promise<void>;
  clearHouseholdData(householdId: string): Promise<void>;
  clearAll(): Promise<void>;
}

/**
 * This platform's store. Metro bundles only `.native.ts` (SecureStore) or
 * `.web.ts` (localStorage); both export it, and this declaration is what
 * TypeScript checks callers against.
 */
export declare const createCurrentHouseholdStore: () => CurrentHouseholdStore;
