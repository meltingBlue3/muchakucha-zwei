import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ApiClientError, type AssistantConversationResponseDto, type AssistantProviderResponseDto } from '@muchakucha/api-client';
import { MuchakuchaThemeProvider, Text } from '../../../ui/primitives';
import { AssistantProviderForm } from '../provider-form';
import { AssistantConversationPanel } from '../conversation-panel';
import { AssistantActionsPreview, assistantActionDetails } from '../action-preview';
import { changedLines, suspiciousShrink } from '../action-changes';
import { UsageSummary, formatTokens } from '../assistant-providers-screen';
import { useAssistantQuery } from '../assistant-runtime';
import { assistantConversationRecords } from '../conversation-records';
import { sessionApiClient } from '../../auth/session-runtime';
import { formatDate, formatDateTime } from '../../../ui/date-values';

jest.mock('expo-router', () => ({ useFocusEffect: (effect: () => void | (() => void)) => {
  const React = jest.requireActual<typeof import('react')>('react'); React.useEffect(effect, [effect]);
} }));
jest.mock('../../auth/session-runtime', () => ({ sessionTransport: { getAccessToken: jest.fn(() => 'token') }, sessionApiClient: { getNote: jest.fn(), getEvent: jest.fn(), getTask: jest.fn(), listLabels: jest.fn(), getHousehold: jest.fn() } }));

const provider: AssistantProviderResponseDto = { id: 'provider', name: '我的模型', protocol: 'openai-compatible', baseUrl: 'https://api.example.com/v1', model: 'family-model', visibility: 'private', ownedByMe: true, hasCredential: true, updatedAt: '2026-10-04T00:00:00.000Z', usage: null };
const conversation: AssistantConversationResponseDto = { id: 'chat', title: '家庭安排', providerId: 'provider', version: 1, state: 'idle', messages: [], pendingActions: [], updatedAt: '2026-10-04T00:00:00.000Z' };

test('query evidence uses saved tool data, marks partial content and excludes model claims and write results', () => {
  const records = assistantConversationRecords([
    { role: 'assistant', content: '声称读过但没有查询过的笔记' },
    { role: 'tool', content: JSON.stringify({ ok: true, tool: 'list_notes', data: { items: [{ title: '已查询的笔记', body: '查询时的原文', truncatedFields: ['body'] }], total: 1, nextOffset: null } }) },
    { role: 'tool', content: JSON.stringify({ ok: true, tool: 'get_note', data: { id: 'note', title: '分段读取', body: '第二段', contentTruncated: true } }) },
    { role: 'tool', content: JSON.stringify({ ok: true, tool: 'create_note', data: { id: 'created', title: '刚创建的笔记', body: '不是查询依据' } }) },
  ]);
  expect(records[0]?.sources).toBeUndefined();
  expect(records[1]?.sources).toEqual([{ title: '已查询的笔记', excerpt: '查询时的原文…（节选）' }]);
  // A record with an ID links to the live note; the one without stays an excerpt only.
  expect(records[2]?.sources).toEqual([{ title: '分段读取', excerpt: '第二段…（节选）', link: { section: 'notes', id: 'note' } }]);
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

test('a connection check uses the form values, needs no name, and its result belongs to the values it checked', async () => {
  const check = jest.fn()
    .mockResolvedValueOnce({ toolCalling: true })
    .mockRejectedValueOnce(new ApiClientError(502, { error: { code: 'ASSISTANT_PROVIDER_AUTH_FAILED' } }))
    .mockRejectedValueOnce(new ApiClientError(502, { error: { code: 'ASSISTANT_PROVIDER_FOLLOW_UP_REJECTED' } }));
  const view = await render(<MuchakuchaThemeProvider><AssistantProviderForm busy={false} onSubmit={jest.fn()} onCancel={jest.fn()} onCheck={check} /></MuchakuchaThemeProvider>);
  await fireEvent.changeText(view.getByLabelText('模型名称'), 'tool-model');
  await fireEvent.press(view.getByRole('button', { name: '测试连接' }));
  expect(check).not.toHaveBeenCalled();
  expect(view.getByText('请输入 API 密钥。')).toBeTruthy();
  expect(view.queryByText('请输入配置名称。')).toBeNull();
  await fireEvent.changeText(view.getByLabelText('API 密钥'), 'example-key');
  await fireEvent.press(view.getByRole('button', { name: '测试连接' }));
  expect(check).toHaveBeenCalledWith(expect.objectContaining({ protocol: 'openai-compatible', baseUrl: 'https://api.openai.com/v1', model: 'tool-model', apiKey: 'example-key' }));
  await view.findByText('连接正常，模型可以调用工具并读取结果。');
  await fireEvent.changeText(view.getByLabelText('API 密钥'), 'another-key');
  expect(view.queryByText('连接正常，模型可以调用工具并读取结果。')).toBeNull();
  await fireEvent.press(view.getByRole('button', { name: '测试连接' }));
  await view.findByText('模型服务拒绝了 API 密钥，请检查或更新密钥。');
  // The check also sends the tool result back, so a service that refuses that step fails here, not mid-conversation.
  await fireEvent.changeText(view.getByLabelText('模型名称'), 'thinking-model');
  await fireEvent.press(view.getByRole('button', { name: '测试连接' }));
  await view.findByText(/^模型调用了工具，但模型服务拒绝了带回工具结果的后续请求。/);
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

test('a sent message shows at once and the composer clears while the reply is pending', async () => {
  let finish!: (sent: boolean) => void;
  const send = jest.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
  const panel = (outgoing: string | null) => <MuchakuchaThemeProvider><AssistantConversationPanel conversation={conversation} busy={false} disabled={false} onSend={send} outgoing={outgoing} /></MuchakuchaThemeProvider>;
  const view = await render(panel(null));
  await fireEvent.changeText(view.getByLabelText('发送给助手'), '明天有什么安排？');
  await fireEvent.press(view.getByRole('button', { name: '发送' }));
  expect(view.getByLabelText('发送给助手').props.value).toBe('');
  await view.rerender(panel('明天有什么安排？'));
  expect(view.getByText('明天有什么安排？')).toBeTruthy();
  expect(view.queryByText('今天，想一起安排什么？')).toBeNull();
  await act(async () => { finish(true); });
  expect(view.getByLabelText('发送给助手').props.value).toBe('');
});

test('pending actions and running conversations block new messages and keep raw tool payloads out of the chat', async () => {
  const pending = { ...conversation, pendingActions: [{ id: 'call_delete', name: 'delete_note', arguments: { id: 'note', expectedUpdatedAt: provider.updatedAt } }], messages: [{ role: 'assistant' as const, content: '请核对要删除的笔记。' }, { role: 'tool' as const, content: 'internal structured payload' }] };
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
  const view = await render(<MuchakuchaThemeProvider><AssistantActionsPreview householdId="home" actions={[{ id: 'call_delete', name: 'delete_note', arguments: { id: 'note', expectedUpdatedAt: provider.updatedAt } }]} busy={false} onDecide={decide} /></MuchakuchaThemeProvider>);
  expect(await view.findByText('开学清单')).toBeTruthy();
  expect(view.getByText('买书包')).toBeTruthy();
  expect(decide).not.toHaveBeenCalled();
  await fireEvent.press(view.getByRole('button', { name: '取消操作' }));
  expect(decide).toHaveBeenCalledWith([]);
  await fireEvent.press(view.getByRole('button', { name: '确认删除' }));
  expect(decide).toHaveBeenCalledWith(['call_delete']);
});

test('a batch runs only the checked items that still match their targets', async () => {
  jest.mocked(sessionApiClient.getNote).mockImplementation(async (_token, _household, noteId) => ({
    id: noteId, householdId: 'home', title: noteId === 'changed' ? '已被家人修改' : '旧清单', body: '', createdBy: 'owner', createdAt: provider.updatedAt,
    updatedAt: noteId === 'changed' ? '2026-10-04T01:00:00.000Z' : provider.updatedAt,
  }));
  const decide = jest.fn();
  const actions = [
    { id: 'call_a', name: 'create_note', arguments: { title: '周一买菜' } },
    { id: 'call_b', name: 'create_note', arguments: { title: '周二倒垃圾' } },
    { id: 'call_c', name: 'delete_note', arguments: { id: 'changed', expectedUpdatedAt: provider.updatedAt } },
  ];
  const view = await render(<MuchakuchaThemeProvider><AssistantActionsPreview householdId="home" actions={actions} busy={false} onDecide={decide} /></MuchakuchaThemeProvider>);
  expect(view.getByText('待确认的操作（3）')).toBeTruthy();
  await view.findByText('操作对象已有变化。请取消这次操作，让助手重新查询并生成建议。');
  // The changed target cannot be checked, so it is left out instead of blocking the others.
  expect(view.getByRole('checkbox', { name: '3. 删除笔记：已被家人修改' })).toBeDisabled();
  await fireEvent.press(view.getByRole('checkbox', { name: '2. 创建笔记：周二倒垃圾' }));
  await fireEvent.press(view.getByRole('button', { name: '确认执行（1）' }));
  expect(decide).toHaveBeenCalledWith(['call_a']);
  await fireEvent.press(view.getByRole('button', { name: '全部取消' }));
  expect(decide).toHaveBeenLastCalledWith([]);
});

test('a changed target cannot be approved under an old proposal', async () => {
  jest.mocked(sessionApiClient.getNote).mockResolvedValue({ id: 'note', householdId: 'home', title: '已经修改', body: '', createdBy: 'owner', createdAt: provider.updatedAt, updatedAt: '2026-10-04T01:00:00.000Z' });
  const view = await render(<MuchakuchaThemeProvider><AssistantActionsPreview householdId="home" actions={[{ id: 'call_delete', name: 'delete_note', arguments: { id: 'note', expectedUpdatedAt: provider.updatedAt } }]} busy={false} onDecide={jest.fn()} /></MuchakuchaThemeProvider>);
  await view.findByText('操作对象已有变化。请取消这次操作，让助手重新查询并生成建议。');
  expect(view.getByRole('button', { name: '确认删除' })).toBeDisabled();
  expect(view.getByRole('button', { name: '取消操作' })).toBeEnabled();
});

test('confirmation translates structured recurrence fields while preserving user content exactly', () => {
  const result = assistantActionDetails({ id: 'call', name: 'create_task', arguments: { title: 'pending', description: '2026-10-04', status: 'pending', recurrence: { freq: 'weekly', byWeekday: [1, 5], timezone: 'Asia/Shanghai', startsOn: '2026-10-04' } } }, { target: null, members: {}, labels: {} });
  expect(result.fields).toContainEqual({ label: '标题', value: 'pending' });
  expect(result.fields).toContainEqual({ label: '说明', value: '2026-10-04' });
  expect(result.fields).toContainEqual({ label: '状态', value: '待办' });
  expect(result.fields.find(field => field.label === '重复规则')?.value).toContain('频率：每周\n星期：周一、周五\n时区：Asia/Shanghai');
});

test('an edit shows what it replaces, and a note body edit lists removed lines and warns about lost content', () => {
  const kept = '保留的第一段';
  const lost = '会被删掉的长段落'.repeat(40);
  const note = { title: '旅行清单', body: `${kept}\n${lost}\n结尾`, updatedAt: provider.updatedAt };
  const edit = assistantActionDetails({ id: 'call', name: 'update_note', arguments: { id: 'note', expectedUpdatedAt: provider.updatedAt, title: '旅行清单', body: `${kept}\n新增的一行` } }, { target: note, labels: {}, members: {} });
  expect(edit.fields.find(field => field.label === '标题')).toEqual({ label: '标题', value: '旅行清单' });
  const body = edit.fields.find(field => field.label === '正文');
  expect(body?.changes).toEqual([{ kind: 'removed', text: lost }, { kind: 'removed', text: '结尾' }, { kind: 'added', text: '新增的一行' }]);
  expect(body?.shrunk).toBeGreaterThan(300);

  const task = { title: '买牛奶', status: 'pending', assigneeIds: ['member-1'], labels: [{ id: 'label-1', name: '家务' }], updatedAt: provider.updatedAt };
  const status = assistantActionDetails({ id: 'call', name: 'update_task', arguments: { id: 'task', expectedUpdatedAt: provider.updatedAt, status: 'completed', assigneeIds: [], labelIds: [] } },
    { target: task, labels: {}, members: { 'member-1': '小林' } });
  expect(status.fields).toEqual([
    { label: '状态', value: '已完成', before: '待办' },
    { label: '负责人', value: '无', before: '小林' },
    { label: '标签', value: '无', before: '家务' },
  ]);
  expect(status.unresolved).toBe(false);
});

test('line changes keep document order and give up on texts too long to compare', () => {
  expect(changedLines('a\nb\nc', 'a\nc\nd')).toEqual([{ kind: 'removed', text: 'b' }, { kind: 'added', text: 'd' }]);
  expect(changedLines('same', 'same')).toEqual([]);
  expect(changedLines('x\n'.repeat(600), 'y\n'.repeat(600))).toBeNull();
  expect(suspiciousShrink('x'.repeat(1000), 'x'.repeat(900))).toBeNull();
  expect(suspiciousShrink('x'.repeat(1000), 'x'.repeat(300))).toBe(700);
});

test('a configuration owner reads the usage of this month by member in readable units', async () => {
  expect([formatTokens(8500), formatTokens(32_000), formatTokens(20_000)]).toEqual(['8500', '3.2 万', '2 万']);
  const usage = { month: '2026-10', requests: 3, inputTokens: 30_000, outputTokens: 1_500, members: [
    { userId: 'u1', displayName: '小林', requests: 2, inputTokens: 20_000, outputTokens: 1_000 },
    { userId: 'u2', displayName: '小周', requests: 1, inputTokens: 10_000, outputTokens: 500 },
  ] };
  const view = await render(<MuchakuchaThemeProvider><UsageSummary usage={usage} /></MuchakuchaThemeProvider>);
  expect(view.getByText('本月（UTC）：3 次请求，输入 3 万、输出 1500 tokens')).toBeTruthy();
  expect(view.getByText('小林：2 次，2.1 万 tokens')).toBeTruthy();
  const unused = await render(<MuchakuchaThemeProvider><UsageSummary usage={{ ...usage, requests: 0, members: [] }} /></MuchakuchaThemeProvider>);
  expect(unused.getByText('本月（UTC）还没有使用。')).toBeTruthy();
});

test('a due date at local midnight is confirmed as a date, the way the task list shows it', () => {
  const midnight = new Date(2026, 9, 7).toISOString();
  const timed = new Date(2026, 9, 7, 7, 30).toISOString();
  const details = (dueDate: string) => assistantActionDetails({ id: 'call', name: 'create_task', arguments: { title: '交水费', dueDate } }, { target: null, members: {}, labels: {} });
  expect(details(midnight).fields).toContainEqual({ label: '截止时间', value: formatDate(new Date(2026, 9, 7)) });
  expect(details(timed).fields).toContainEqual({ label: '截止时间', value: formatDateTime(new Date(2026, 9, 7, 7, 30)) });
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
