import { createWorkspaceState } from '../workspace-store';

test('a new item’s draft moves to another household, keeping only what the carry allows', () => {
  const store = createWorkspaceState();
  store.set('draft:home:tasks:new:form', { title: '买水果', assigneeIds: ['me'] });
  store.set('draft:home:tasks:new:labels', ['label-home']);
  store.set('draft:home:tasks:other:form', { title: '别的任务' });

  store.move('draft:home:tasks:new:', 'draft:parents:tasks:new:', (field, value) => field === 'labels' ? undefined : value);

  expect(store.get('draft:parents:tasks:new:form')).toEqual({ title: '买水果', assigneeIds: ['me'] });
  expect(store.has('draft:parents:tasks:new:labels')).toBe(false);
  expect(store.has('draft:home:tasks:new:form')).toBe(false);
  expect(store.has('draft:home:tasks:new:labels')).toBe(false);
  // Only the moved item is touched, and its edits still count as edits.
  expect(store.get('draft:home:tasks:other:form')).toEqual({ title: '别的任务' });
  expect(store.hasDrafts('draft:parents:tasks:new:')).toBe(true);
  expect(store.hasDrafts('draft:home:tasks:new:')).toBe(false);
});
