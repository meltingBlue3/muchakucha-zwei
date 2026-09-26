import { fireEvent, render } from '@testing-library/react-native';
import { ApiClientError } from '@muchakucha/api-client';
import { captureEditBaseline, useEditConflict } from '../edit-conflict';
import { Button, MuchakuchaThemeProvider, Text } from '../primitives';
import { createWorkspaceState, WorkspaceStateProvider } from '../workspace-state';

const prefix = 'draft:family:notes:note:';
const initial = { updatedAt: '2030-01-01T00:00:00.000Z', title: '原文' };
const latest = { updatedAt: '2030-01-02T00:00:00.000Z', title: '他人的修改' };

test('restored drafts keep their original baseline, and unversioned drafts require review', () => {
  let saved: string | null = null;
  const storage = { read: () => saved, write: (_id: string, value: string) => { saved = value; }, remove: () => { saved = null; } };
  const first = createWorkspaceState(storage);
  first.activateAccount('account');
  captureEditBaseline(first, prefix, initial);
  first.set(prefix + 'form', { title: '草稿' });
  const restored = createWorkspaceState(storage);
  restored.activateAccount('account');
  captureEditBaseline(restored, prefix, latest);
  expect(restored.get(prefix + 'baseVersion')).toBe(initial.updatedAt);
  expect(restored.get(prefix + 'form')).toEqual({ title: '草稿' });
  const legacy = createWorkspaceState();
  legacy.set(prefix + 'form', { title: '旧稿' });
  captureEditBaseline(legacy, prefix, latest);
  expect(legacy.get(prefix + 'baseVersion')).not.toBe(latest.updatedAt);
});

test('reading latest content does not authorize retry until the user acknowledges it', async () => {
  const store = createWorkspaceState();
  const reviewed = jest.fn();
  function Demo() {
    const conflict = useEditConflict(prefix, initial, async () => latest, reviewed);
    return <>
      <Text>{conflict.precondition.expectedUpdatedAt}</Text>
      <Button label="模拟冲突" onPress={() => conflict.handle(new ApiClientError(409, { error: { code: 'EDIT_CONFLICT' } }))} />
      {conflict.panel}
    </>;
  }
  const view = await render(<MuchakuchaThemeProvider><WorkspaceStateProvider store={store}><Demo /></WorkspaceStateProvider></MuchakuchaThemeProvider>);
  await fireEvent.press(view.getByRole('button', { name: '模拟冲突' }));
  await fireEvent.press(view.getByRole('button', { name: '查看最新内容' }));
  expect(view.getByText('标题：他人的修改')).toBeTruthy();
  expect(store.get(prefix + 'baseVersion')).toBe(initial.updatedAt);
  expect(reviewed).not.toHaveBeenCalled();
  await fireEvent.press(view.getByRole('button', { name: '已查看，继续整理草稿' }));
  expect(store.get(prefix + 'baseVersion')).toBe(latest.updatedAt);
  expect(reviewed).toHaveBeenCalledWith(latest);
});
