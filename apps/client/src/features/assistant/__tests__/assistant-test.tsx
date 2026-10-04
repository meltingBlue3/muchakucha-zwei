import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { AssistantConversationResponseDto, AssistantProviderResponseDto } from '@muchakucha/api-client';
import { MuchakuchaThemeProvider, Text } from '../../../ui/primitives';
import { AssistantProviderForm } from '../provider-form';
import { AssistantConversationPanel } from '../conversation-panel';
import { AssistantActionPreview, assistantActionDetails } from '../action-preview';
import { useAssistantQuery } from '../assistant-runtime';
import { assistantConversationRecords } from '../conversation-records';
import { sessionApiClient } from '../../auth/session-runtime';

jest.mock('expo-router', () => ({ useFocusEffect: (effect: () => void | (() => void)) => {
  const React = jest.requireActual<typeof import('react')>('react'); React.useEffect(effect, [effect]);
} }));
jest.mock('../../auth/session-runtime', () => ({ sessionTransport: { getAccessToken: jest.fn(() => 'token') }, sessionApiClient: { getNote: jest.fn(), getEvent: jest.fn(), getTask: jest.fn(), listLabels: jest.fn(), getHousehold: jest.fn() } }));

const provider: AssistantProviderResponseDto = { id: 'provider', name: '我的模型', protocol: 'openai-compatible', baseUrl: 'https://api.example.com/v1', model: 'family-model', visibility: 'private', ownedByMe: true, hasCredential: true, updatedAt: '2026-10-04T00:00:00.000Z' };
const conversation: AssistantConversationResponseDto = { id: 'chat', title: '家庭安排', providerId: 'provider', version: 1, state: 'idle', messages: [], pendingAction: null, updatedAt: '2026-10-04T00:00:00.000Z' };

test('query evidence uses saved tool data, marks partial content and excludes model claims and write results', () => {
  const records = assistantConversationRecords([
    { role: 'assistant', content: '声称读过但没有查询过的笔记' },
    { role: 'tool', content: JSON.stringify({ ok: true, tool: 'list_notes', data: { items: [{ title: '已查询的笔记', body: '查询时的原文', truncatedFields: ['body'] }], total: 1, nextOffset: null } }) },
    { role: 'tool', content: JSON.stringify({ ok: true, tool: 'get_note', data: { id: 'note', title: '分段读取', body: '第二段', contentTruncated: true } }) },
    { role: 'tool', content: JSON.stringify({ ok: true, tool: 'create_note', data: { id: 'created', title: '刚创建的笔记', body: '不是查询依据' } }) },
  ]);
  expect(records[0]?.sources).toBeUndefined();
  expect(records[1]?.sources).toEqual([{ title: '已查询的笔记', excerpt: '查询时的原文…（节选）' }]);
  expect(records[2]?.sources).toEqual([{ title: '分段读取', excerpt: '第二段…（节选）' }]);
  expect(records[3]?.sources).toBeUndefined();
});

test('editing a provider retains its secret by omitting a blank credential', async () => {
  const submit = jest.fn().mockResolvedValue(undefined);
  const view = await render(<MuchakuchaThemeProvider><AssistantProviderForm initial={provider} busy={false} onSubmit={submit} onCancel={jest.fn()} /></MuchakuchaThemeProvider>);
  expect(view.getByLabelText('API 密钥').props.value).toBe('');
  await fireEvent.changeText(view.getByLabelText('配置名称'), '新的名称');
  await fireEvent.press(view.getByRole('button', { name: '保存' }));
  expect(submit).toHaveBeenCalledWith({ name: '新的名称', protocol: 'openai-compatible', baseUrl: 'https://api.example.com/v1', model: 'family-model', visibility: 'private' });
  expect(submit.mock.calls[0]?.[0]).not.toHaveProperty('apiKey');
});

test('creating a household provider requires an explicit credential and explains who pays', async () => {
  const submit = jest.fn().mockResolvedValue(undefined);
  const view = await render(<MuchakuchaThemeProvider><AssistantProviderForm busy={false} onSubmit={submit} onCancel={jest.fn()} /></MuchakuchaThemeProvider>);
  await fireEvent.changeText(view.getByLabelText('配置名称'), '家庭模型');
  await fireEvent.changeText(view.getByLabelText('模型名称'), 'tool-model');
  await fireEvent.press(view.getByRole('radio', { name: '家庭可用' }));
  expect(view.getByText(/费用由此密钥承担/)).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: '创建' }));
  expect(submit).not.toHaveBeenCalled();
  expect(view.getByText('请输入 API 密钥。')).toBeTruthy();
  await fireEvent.changeText(view.getByLabelText('API 密钥'), 'example-key');
  await fireEvent.press(view.getByRole('button', { name: '创建' }));
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'example-key', visibility: 'household' }));
});

test('model protocol switches to the complete Anthropic API base path', async () => {
  const view = await render(<MuchakuchaThemeProvider><AssistantProviderForm busy={false} onSubmit={jest.fn()} onCancel={jest.fn()} /></MuchakuchaThemeProvider>);
  await fireEvent.press(view.getByRole('radio', { name: 'Anthropic' }));
  expect(view.getByLabelText('服务地址').props.value).toBe('https://api.anthropic.com/v1');
});

test('a failed message preserves the draft; a successful send clears it', async () => {
  const send = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const view = await render(<MuchakuchaThemeProvider><AssistantConversationPanel conversation={conversation} busy={false} disabled={false} onSend={send} /></MuchakuchaThemeProvider>);
  await fireEvent.changeText(view.getByLabelText('发送给助手'), '明天有什么安排？');
  await fireEvent.press(view.getByRole('button', { name: '发送' }));
  expect(view.getByLabelText('发送给助手').props.value).toBe('明天有什么安排？');
  await fireEvent.press(view.getByRole('button', { name: '发送' }));
  await waitFor(() => expect(view.getByLabelText('发送给助手').props.value).toBe(''));
});

test('pending actions and running conversations block new messages and keep raw tool payloads out of the chat', async () => {
  const pending = { ...conversation, pendingAction: { name: 'delete_note', arguments: { id: 'note', expectedUpdatedAt: provider.updatedAt } }, messages: [{ role: 'assistant' as const, content: '请核对要删除的笔记。' }, { role: 'tool' as const, content: 'internal structured payload' }] };
  const view = await render(<MuchakuchaThemeProvider><AssistantConversationPanel conversation={pending} busy={false} disabled={false} onSend={jest.fn()} /></MuchakuchaThemeProvider>);
  expect(view.getByRole('button', { name: '发送' })).toBeDisabled();
  expect(view.getByLabelText('发送给助手')).toHaveProp('editable', false);
  expect(view.queryByText('internal structured payload')).toBeNull();
  await view.rerender(<MuchakuchaThemeProvider><AssistantConversationPanel conversation={{ ...conversation, state: 'running' }} busy={false} disabled={false} onSend={jest.fn()} /></MuchakuchaThemeProvider>);
  expect(view.getByRole('button', { name: '发送' })).toBeDisabled();
});

test('successful writes remain visible when the model fails after execution', async () => {
  const view = await render(<MuchakuchaThemeProvider><AssistantConversationPanel conversation={{ ...conversation, messages: [
    { role: 'tool', content: JSON.stringify({ ok: true, tool: 'create_note', data: { id: 'note', title: '开学清单', body: '原始工具内容不展开' } }) },
    { role: 'assistant', content: '本轮处理未能完成，请检查模型配置。' },
  ] }} busy={false} disabled={false} onSend={jest.fn()} /></MuchakuchaThemeProvider>);
  expect(view.getByText('执行记录')).toBeTruthy();
  expect(view.getByText('创建笔记成功：开学清单。')).toBeTruthy();
  expect(view.getByText('本轮处理未能完成，请检查模型配置。')).toBeTruthy();
  expect(view.queryByText(/原始工具内容不展开/)).toBeNull();
});

test('tool results distinguish a successful delete from a conflict and summarize paginated queries', async () => {
  const view = await render(<MuchakuchaThemeProvider><AssistantConversationPanel conversation={{ ...conversation, messages: [
    { role: 'tool', content: JSON.stringify({ ok: true, tool: 'list_tasks', data: { items: [{ id: 'task', title: '买书包' }], total: 5, nextOffset: 1 } }) },
    { role: 'tool', content: JSON.stringify({ ok: true, tool: 'delete_task', data: { id: 'task', deleted: true, scope: 'this_only' } }) },
    { role: 'tool', content: JSON.stringify({ ok: false, tool: 'update_note', code: 'EDIT_CONFLICT' }) },
    { role: 'tool', content: JSON.stringify({ ok: false, tool: 'delete_label', code: 'FORBIDDEN' }) },
  ] }} busy={false} disabled={false} onSend={jest.fn()} /></MuchakuchaThemeProvider>);
  expect(view.getByText('查询任务：本次返回 1 项，共 5 项（结果仅含部分内容）。')).toBeTruthy();
  expect(view.getByText('删除任务成功：买书包（仅此次安排）。')).toBeTruthy();
  expect(view.getByText('编辑笔记未完成：内容已有变化，请重新查询并确认。')).toBeTruthy();
  expect(view.getByText('删除标签未完成：你没有权限执行这项操作。')).toBeTruthy();
  expect(view.queryByText(/EDIT_CONFLICT|FORBIDDEN/)).toBeNull();
});

test('delete confirmation resolves the actual note and sends only the explicit human decision', async () => {
  jest.mocked(sessionApiClient.getNote).mockResolvedValue({ id: 'note', householdId: 'home', title: '开学清单', body: '买书包', createdBy: 'owner', createdAt: provider.updatedAt, updatedAt: provider.updatedAt });
  const decide = jest.fn();
  const view = await render(<MuchakuchaThemeProvider><AssistantActionPreview householdId="home" action={{ name: 'delete_note', arguments: { id: 'note', expectedUpdatedAt: provider.updatedAt } }} busy={false} onDecide={decide} /></MuchakuchaThemeProvider>);
  expect(await view.findByText('开学清单')).toBeTruthy();
  expect(view.getByText('买书包')).toBeTruthy();
  expect(decide).not.toHaveBeenCalled();
  await fireEvent.press(view.getByRole('button', { name: '取消操作' }));
  expect(decide).toHaveBeenCalledWith(false);
  await fireEvent.press(view.getByRole('button', { name: '确认删除' }));
  expect(decide).toHaveBeenCalledWith(true);
});

test('a changed target cannot be approved under an old proposal', async () => {
  jest.mocked(sessionApiClient.getNote).mockResolvedValue({ id: 'note', householdId: 'home', title: '已经修改', body: '', createdBy: 'owner', createdAt: provider.updatedAt, updatedAt: '2026-10-04T01:00:00.000Z' });
  const view = await render(<MuchakuchaThemeProvider><AssistantActionPreview householdId="home" action={{ name: 'delete_note', arguments: { id: 'note', expectedUpdatedAt: provider.updatedAt } }} busy={false} onDecide={jest.fn()} /></MuchakuchaThemeProvider>);
  await view.findByText('操作对象已有变化。请取消这次操作，让助手重新查询并生成建议。');
  expect(view.getByRole('button', { name: '确认删除' })).toBeDisabled();
  expect(view.getByRole('button', { name: '取消操作' })).toBeEnabled();
});

test('confirmation translates structured recurrence fields while preserving user content exactly', () => {
  const result = assistantActionDetails({ name: 'create_task', arguments: { title: 'pending', description: '2026-10-04', status: 'pending', recurrence: { freq: 'weekly', byWeekday: [1, 5], timezone: 'Asia/Shanghai', startsOn: '2026-10-04' } } }, { target: null, members: {}, labels: {} });
  expect(result.fields).toContainEqual({ label: '标题', value: 'pending' });
  expect(result.fields).toContainEqual({ label: '说明', value: '2026-10-04' });
  expect(result.fields).toContainEqual({ label: '状态', value: '待办' });
  expect(result.fields.find(field => field.label === '重复规则')?.value).toContain('频率：每周\n星期：周一、周五\n时区：Asia/Shanghai');
});

test('a late response from a previous household cannot replace the active household content', async () => {
  let resolveOld: ((value: string) => void) | undefined;
  const oldLoad = jest.fn(() => new Promise<string>(resolve => { resolveOld = resolve; }));
  const newLoad = jest.fn(async () => '当前家庭的对话');
  function Query({ load }: { load: (token: string) => Promise<string> }) {
    const result = useAssistantQuery(load);
    return <Text>{result.data ?? '加载中'}</Text>;
  }
  const view = await render(<MuchakuchaThemeProvider><Query key="old" load={oldLoad} /></MuchakuchaThemeProvider>);
  await waitFor(() => expect(oldLoad).toHaveBeenCalled());
  await view.rerender(<MuchakuchaThemeProvider><Query key="new" load={newLoad} /></MuchakuchaThemeProvider>);
  await view.findByText('当前家庭的对话');
  await act(async () => { resolveOld?.('旧家庭的私密对话'); });
  expect(view.getByText('当前家庭的对话')).toBeTruthy();
  expect(view.queryByText('旧家庭的私密对话')).toBeNull();
});
