import { File, Paths } from 'expo-file-system';
import type { DraftStorage } from './draft-storage';

export function createDraftStorage(): DraftStorage {
  const file = (id: string) => new File(Paths.document, `drafts-v1-${encodeURIComponent(id)}.json`);
  return {
    read(id) { const target = file(id); return target.exists ? target.textSync() : null; },
    write(id, value) {
      const target = file(id);
      if (!target.exists) target.create();
      target.write(value);
    },
    remove(id) { const target = file(id); if (target.exists) target.delete(); },
  };
}
