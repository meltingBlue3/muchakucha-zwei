/**
 * Whether 今日, 日历 and 任务 last showed the 总览 or one household. Unset
 * means the person has not chosen yet, which opens the 总览 when they have
 * more than one household.
 */
export type TimeScope = 'overview' | 'household';

export interface CurrentHouseholdStore {
  hydrate(): Promise<void>;
  getScope(): TimeScope | null;
  setScope(scope: TimeScope): Promise<void>;
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
