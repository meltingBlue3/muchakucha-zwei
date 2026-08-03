export interface CurrentHouseholdStore {
  getCurrentId(): string | null;
  setCurrentId(id: string): Promise<void>;
  getAccessTimestamps(): Record<string, number>;
  setAccessTimestamps(timestamps: Record<string, number>): Promise<void>;
  clearCurrentId(): Promise<void>;
  clearHouseholdData(householdId: string): Promise<void>;
  clearAll(): Promise<void>;
}
