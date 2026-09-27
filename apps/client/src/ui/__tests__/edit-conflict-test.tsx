import { fireEvent, render } from '@testing-library/react-native';
import { ApiClientError } from '@muchakucha/api-client';
import { captureEditBaseline, summarizeLatest, useEditConflict } from '../edit-conflict';
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

test('the latest version is described in everyday words, not raw values', () => {
  jest.useFakeTimers({ now: new Date(2030, 5, 15, 12) });
  try {
    const rows = Object.fromEntries(summarizeLatest({
      updatedAt: '2030-06-15T00:00:00.000Z',
      title: '接孩子',
      startTime: new Date(2030, 5, 20, 16).toISOString(),
      endTime: new Date(2030, 5, 20, 17).toISOString(),
      allDay: false,
      status: 'in_progress',
      recurrence: { freq: 'weekly', interval: 1, byWeekday: [2], startsOn: '2030-06-18', timezone: 'Asia/Shanghai', endsOn: null, count: null, updatedAt: '2030-06-01T00:00:00.000Z' },
    } as never));
    expect(rows['开始']).toBe('6月20日 16:00');
    expect(rows['结束']).toBe('6月20日 17:00');
    expect(rows['状态']).toBe('进行中');
    expect(rows['重复']).toMatch(/^每周/);
    expect(Object.values(rows).join()).not.toMatch(/T\d\d:|Asia\/|间隔/);
  } finally {
    jest.useRealTimers();
  }
});
