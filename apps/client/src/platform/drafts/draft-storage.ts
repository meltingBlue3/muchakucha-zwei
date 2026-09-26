export interface DraftStorage {
  read(accountId: string): string | null;
  write(accountId: string, value: string): void;
  remove(accountId: string): void;
}

// Web/TypeScript fallback; Metro selects draft-storage.native.ts on devices.
export function createDraftStorage(): DraftStorage {
  const key = (id: string) => `muchakucha:drafts:v1:${encodeURIComponent(id)}`;
  return {
    read: (id) => localStorage.getItem(key(id)),
    write: (id, value) => localStorage.setItem(key(id), value),
    remove: (id) => localStorage.removeItem(key(id)),
  };
}
