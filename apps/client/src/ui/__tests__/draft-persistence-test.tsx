import { createWorkspaceState, compatibleDraft } from '../workspace-store';
import type { DraftStorage } from '../../platform/drafts/draft-storage';

function disk() {
  const values = new Map<string, string>();
  const storage: DraftStorage = {
    read: (id) => values.get(id) ?? null,
    write: (id, value) => { values.set(id, value); },
    remove: (id) => { values.delete(id); },
  };
  const open = (id: string) => { const store = createWorkspaceState(storage); store.activateAccount(id); return store; };
  return { storage, values, open };
}
const a = 'draft:family-a:notes:new:form';
const b = 'draft:family-b:notes:new:form';

test('restores drafts after restart, isolated by account and household; excludes view state', () => {
  const { open, values } = disk();
  const store = open('alice');
  store.set(a, { title: '采购', body: '长笔记'.repeat(10000) });
  store.set(b, { title: '旅行', body: '' });
  store.set('view:family-a:filter', 'private-view-state');
  expect(open('bob').get(a)).toBeUndefined();
  const restarted = open('alice');
  expect(restarted.get(a)).toEqual(store.get(a));
  expect(restarted.get(b)).toEqual(store.get(b));
  expect(restarted.get('view:family-a:filter')).toBeUndefined();
  expect(values.get('alice')).not.toContain('private-view-state');
});

test('saving or discarding a form deletes all its persisted fields but retains other drafts', () => {
  const { open } = disk();
  const store = open('alice');
  store.set(a, { title: '草稿', body: '' });
  store.set('draft:family-a:notes:new:labels', ['label']);
  store.set(b, { title: '保留', body: '' });
  store.clear('draft:family-a:notes:new:');
  const restarted = open('alice');
  expect(restarted.get(a)).toBeUndefined();
  expect(restarted.get('draft:family-a:notes:new:labels')).toBeUndefined();
  expect(restarted.get(b)).toBeDefined();
});

test('logout removes persisted drafts and stale mounted editors cannot recreate them', () => {
  const { open, values } = disk();
  const store = open('alice');
  store.set(a, { title: '草稿', body: '' });
  store.endSession();
  store.set(a, { title: '迟到的更新', body: '' });
  expect(values.has('alice')).toBe(false);
  expect(open('alice').get(a)).toBeUndefined();
});

test('authoritative membership loss purges only that household, including after a restart', () => {
  const { open } = disk();
  const store = open('alice');
  store.set(a, { title: '丢失访问权', body: '' });
  store.set(b, { title: '仍可访问', body: '' });
  const restarted = open('alice');
  restarted.retainHouseholds(['family-b']);
  restarted.set(a, { title: '旧页面仍在编辑', body: '' });
  expect(open('alice').get(a)).toBeUndefined();
  expect(open('alice').get(b)).toBeDefined();
  restarted.clearHousehold('family-b');
  expect(open('alice').get(b)).toBeUndefined();
});

test('network uncertainty and account changes do not erase retained drafts', () => {
  const { open } = disk();
  const store = open('alice');
  store.set(a, 'alice');
  store.activateAccount('bob');
  store.set(a, 'bob');
  expect(open('alice').get(a)).toBe('alice');
  expect(open('bob').get(a)).toBe('bob');
});

test('a partially created resource and its labels survive restart for safe retry', () => {
  const { open } = disk();
  const key = 'draft:family-a:tasks:new:created';
  open('alice').set(key, { id: 'already-created', labelIds: ['label'] });
  expect(open('alice').get(key)).toEqual({ id: 'already-created', labelIds: ['label'] });
});

test('corrupt storage and quota failures preserve editable memory and surface persistence failure', () => {
  const { open, storage, values } = disk();
  values.set('alice', '{');
  const store = open('alice');
  expect(store.persistenceFailed()).toBe(true);
  storage.write = () => { throw new Error('full'); };
  store.set(a, { title: '仍可编辑', body: '' });
  expect(store.get(a)).toEqual({ title: '仍可编辑', body: '' });
  expect(store.persistenceFailed()).toBe(true);
  expect(compatibleDraft({ title: [], body: '' }, { title: '', body: '' })).toBe(false);
  expect(compatibleDraft(42, null)).toBe(false);
  expect(compatibleDraft({ nonsense: true }, null)).toBe(false);
});


test('recurring form drafts retain weekday numbers and allow turning an existing rule off', () => {
  const recurrence = { freq: 'weekly', startsOn: '2030-01-01', timezone: 'UTC', byWeekday: [1, 3] };
  const initial = { title: '会议', recurrence };
  expect(compatibleDraft({ title: '新标题', recurrence: { ...recurrence, byWeekday: [2, 4] } }, initial)).toBe(true);
  expect(compatibleDraft({ title: '不再重复', recurrence: null }, initial)).toBe(true);
  expect(compatibleDraft({ title: '错误', recurrence: { ...recurrence, byWeekday: 'Monday' } }, initial)).toBe(false);
});
