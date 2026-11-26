import { ApiClientError, type LabelListItemDto } from '@muchakucha/api-client';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useState } from 'react';
import { sessionApiClient } from '../../auth/session-runtime';
import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import { WindowStepContext } from '../../../ui/window-step';
import { LabelPicker } from '../label-picker';

const mockRole = { current: 'MEMBER' as 'OWNER' | 'ADMIN' | 'MEMBER' };

jest.mock('../../auth/session-runtime', () => ({
  sessionTransport: { getAccessToken: jest.fn(async () => 'token') },
  sessionApiClient: { listLabels: jest.fn(), createLabel: jest.fn() },
}));

jest.mock('../../households/household-context', () => ({
  useHouseholdContext: () => ({ households: [{ id: 'family', name: '家', role: mockRole.current }] }),
}));

const label = (id: string, name: string): LabelListItemDto => ({ id, householdId: 'family', name, color: '#2C716C', systemKey: null, localizedNames: null, createdBy: 'owner', createdAt: '2026-11-01T00:00:00.000Z', usage: { events: 0, tasks: 0, notes: 0 } });

beforeEach(() => {
  jest.mocked(sessionApiClient.listLabels).mockReset();
  jest.mocked(sessionApiClient.createLabel).mockReset();
  mockRole.current = 'MEMBER';
});

/** A form that owns the selection, as the event and task forms do. */
function Form({ initial = [], initialLabels, onChange, onLabelsLoaded }: { initial?: string[]; initialLabels?: LabelListItemDto[] | null; onChange?: (ids: string[]) => void; onLabelsLoaded?: (labels: LabelListItemDto[]) => void }) {
  const [selected, setSelected] = useState(initial);
  return <LabelPicker householdId="family" initialLabels={initialLabels} selectedLabelIds={selected} onChange={(ids) => { onChange?.(ids); setSelected(ids); }} {...(onLabelsLoaded === undefined ? {} : { onLabelsLoaded: (items) => onLabelsLoaded(items as LabelListItemDto[]) })} />;
}

const renderForm = (props: Parameters<typeof Form>[0] = {}) => render(<MuchakuchaThemeProvider><Form {...props} /></MuchakuchaThemeProvider>);

test('a chosen label that has since been deleted is dropped once the list loads', async () => {
  jest.mocked(sessionApiClient.listLabels).mockResolvedValue({ labels: [label('kept', '家务')], total: 1 });
  const onChange = jest.fn();
  const view = await renderForm({ initial: ['deleted', 'kept'], onChange });

  await view.findByLabelText('取消选择标签 家务');
  expect(onChange).toHaveBeenCalledWith(['kept']);
});

test('a list that failed to load drops nothing', async () => {
  jest.mocked(sessionApiClient.listLabels).mockRejectedValue(new Error('offline'));
  const onChange = jest.fn();
  const view = await renderForm({ initial: ['kept'], onChange });

  await view.findByText('标签没有加载成功。');
  expect(onChange).not.toHaveBeenCalled();
});

test('a member with no labels is told who can add them, and offered nothing they cannot do', async () => {
  jest.mocked(sessionApiClient.listLabels).mockResolvedValue({ labels: [], total: 0 });
  const view = await renderForm();

  expect(await view.findByText('还没有标签，所有者或管理员创建后即可使用。')).toBeTruthy();
  expect(view.queryByRole('button', { name: '新建标签' })).toBeNull();
});

test('an owner with no labels is offered to create one here', async () => {
  mockRole.current = 'OWNER';
  jest.mocked(sessionApiClient.listLabels).mockResolvedValue({ labels: [], total: 0 });
  const view = await renderForm();

  expect(await view.findByText('还没有标签，可以直接新建一个。')).toBeTruthy();
  expect(view.getByRole('button', { name: '新建标签' })).toBeTruthy();
});

test('an admin creates a label without leaving the form, and it is chosen at once', async () => {
  mockRole.current = 'ADMIN';
  jest.mocked(sessionApiClient.listLabels).mockResolvedValue({ labels: [label('chores', '家务')], total: 1 });
  jest.mocked(sessionApiClient.createLabel).mockResolvedValue({ id: 'checkup', householdId: 'family', name: '体检', color: '#3B7DD8', systemKey: null, localizedNames: null, createdBy: 'admin', createdAt: '2026-11-22T00:00:00.000Z' });
  const onChange = jest.fn();
  const onLabelsLoaded = jest.fn();
  const view = await renderForm({ initial: ['chores'], onChange, onLabelsLoaded });

  await fireEvent.press(await view.findByRole('button', { name: '新建标签' }));
  await fireEvent.changeText(view.getByLabelText('标签名称'), ' 体检 ');
  await fireEvent.press(view.getByRole('radio', { name: '选择颜色 #3B7DD8' }));
  await fireEvent.press(view.getByRole('button', { name: '创建并选中' }));

  expect(await view.findByLabelText('取消选择标签 体检')).toBeTruthy();
  expect(sessionApiClient.createLabel).toHaveBeenCalledWith('token', 'family', { name: '体检', color: '#3B7DD8' });
  expect(onChange).toHaveBeenLastCalledWith(['chores', 'checkup']);
  // Whoever names the chosen labels, such as a note before its save returns, knows the new one too.
  expect(onLabelsLoaded).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'chores' }), expect.objectContaining({ id: 'checkup', name: '体检' })]);
  expect(view.queryByLabelText('标签名称')).toBeNull();
});

test('a name already in use keeps what was typed and says why', async () => {
  mockRole.current = 'OWNER';
  jest.mocked(sessionApiClient.listLabels).mockResolvedValue({ labels: [label('chores', '家务')], total: 1 });
  jest.mocked(sessionApiClient.createLabel).mockRejectedValue(new ApiClientError(400, { error: { code: 'VALIDATION_FAILED', details: [{ field: 'name', codes: ['duplicate'] }] } }));
  const view = await renderForm();

  await fireEvent.press(await view.findByRole('button', { name: '新建标签' }));
  await fireEvent.changeText(view.getByLabelText('标签名称'), '家务');
  await fireEvent.press(view.getByRole('button', { name: '创建并选中' }));

  expect(await view.findByText('已经有同名的标签了。')).toBeTruthy();
  expect(view.getByLabelText('标签名称').props.value).toBe('家务');
});

test('an empty name is not sent', async () => {
  mockRole.current = 'OWNER';
  jest.mocked(sessionApiClient.listLabels).mockResolvedValue({ labels: [], total: 0 });
  const view = await renderForm();

  await fireEvent.press(await view.findByRole('button', { name: '新建标签' }));
  await fireEvent.press(view.getByRole('button', { name: '创建并选中' }));

  expect(await view.findByText('请输入标签名称。')).toBeTruthy();
  await waitFor(() => expect(sessionApiClient.createLabel).not.toHaveBeenCalled());
});

test('inside a window, 新建标签 opens as a step of the window rather than below the labels', async () => {
  mockRole.current = 'OWNER';
  jest.mocked(sessionApiClient.listLabels).mockResolvedValue({ labels: [label('chores', '家务')], total: 1 });
  const host = { show: jest.fn(), hide: jest.fn() };
  const view = await render(<MuchakuchaThemeProvider><WindowStepContext.Provider value={host}><Form /></WindowStepContext.Provider></MuchakuchaThemeProvider>);

  await fireEvent.press(await view.findByRole('button', { name: '新建标签' }));

  expect(view.queryByLabelText('标签名称')).toBeNull();
  expect(host.show).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ title: '新建标签' }));
});

test('reports loaded labels on success and stays quiet on load failure', async () => {
  const loaded = [label('bday', '生日')];
  jest.mocked(sessionApiClient.listLabels).mockResolvedValueOnce({ labels: loaded, total: 1 });
  const onLabelsLoaded = jest.fn();
  const ok = await renderForm({ onLabelsLoaded });
  await ok.findByLabelText('选择标签 生日');
  expect(onLabelsLoaded).toHaveBeenCalledWith(loaded);
  await ok.unmount();

  onLabelsLoaded.mockClear();
  jest.mocked(sessionApiClient.listLabels).mockRejectedValueOnce(new Error('offline'));
  const failed = await renderForm({ onLabelsLoaded });
  await failed.findByText('标签没有加载成功。');
  expect(onLabelsLoaded).not.toHaveBeenCalled();
});

test('shows cached labels immediately while refreshing in the background without dropping unverified selections', async () => {
  const cached = [label('chores', '家务')];
  const fresh = [...cached, label('health', '健康')];
  let resolveRefresh!: (value: { labels: LabelListItemDto[]; total: number }) => void;
  jest.mocked(sessionApiClient.listLabels).mockReturnValueOnce(new Promise(resolve => { resolveRefresh = resolve; }));
  const onChange = jest.fn();
  const onLabelsLoaded = jest.fn();

  const view = await renderForm({ initial: ['chores', 'health'], initialLabels: cached, onChange, onLabelsLoaded });

  expect(view.queryByText('加载标签中…')).toBeNull();
  expect(view.getByLabelText('取消选择标签 家务')).toBeTruthy();
  // Before the live refresh arrives, a selection not yet in the cache is kept.
  expect(onChange).not.toHaveBeenCalled();

  resolveRefresh({ labels: fresh, total: 2 });
  expect(await view.findByLabelText('取消选择标签 健康')).toBeTruthy();
  expect(onLabelsLoaded).toHaveBeenCalledWith(fresh);
  expect(onChange).not.toHaveBeenCalled();
});

test('keeps cached labels usable when a background refresh fails', async () => {
  const cached = [label('chores', '家务')];
  jest.mocked(sessionApiClient.listLabels).mockRejectedValueOnce(new Error('offline'));

  const view = await renderForm({ initial: ['chores'], initialLabels: cached });

  expect(view.getByLabelText('取消选择标签 家务')).toBeTruthy();
  await waitFor(() => expect(sessionApiClient.listLabels).toHaveBeenCalledTimes(1));
  expect(view.queryByText('标签没有加载成功。')).toBeNull();
  expect(view.getByLabelText('取消选择标签 家务')).toBeTruthy();
});
