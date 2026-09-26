import { createDraftStorage } from '../../platform/drafts/draft-storage.native';

jest.mock('expo-file-system', () => {
  const files = new Map<string, string>();
  return {
    Paths: { document: 'private-documents' },
    File: class {
      private readonly path: string;
      constructor(...parts: string[]) { this.path = parts.join('/'); }
      get exists() { return files.has(this.path); }
      create() { files.set(this.path, ''); }
      write(value: string) { files.set(this.path, value); }
      textSync() { return files.get(this.path)!; }
      delete() { files.delete(this.path); }
    },
  };
});

test('native drafts persist large content across adapter instances and clear only the selected account', () => {
  const first = createDraftStorage();
  const content = JSON.stringify({ body: '家庭笔记'.repeat(20000) });
  first.write('account-a', content);
  first.write('account-b', 'another account');
  const restarted = createDraftStorage();
  expect(restarted.read('account-a')).toBe(content);
  restarted.remove('account-a');
  expect(createDraftStorage().read('account-a')).toBeNull();
  expect(createDraftStorage().read('account-b')).toBe('another account');
});
