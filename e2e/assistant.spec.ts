import { expect, test, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const householdId = '11111111-1111-4111-8111-111111111111';
const secondHouseholdId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const noteId = '44444444-4444-4444-8444-444444444444';
const providerId = '55555555-5555-4555-8555-555555555555';
const conversationId = '66666666-6666-4666-8666-666666666666';
const version = '2030-06-15T04:00:00.000Z';
const base = `/households/${householdId}`;

interface Provider {
  id: string; name: string; protocol: 'openai-compatible' | 'anthropic'; baseUrl: string; model: string;
  visibility: 'private' | 'household'; ownedByMe: boolean; hasCredential: boolean; updatedAt: string;
}
interface Conversation {
  id: string; title: string; updatedAt: string; providerId: string; version: number; state: 'idle' | 'running';
  messages: Array<{ role: 'user' | 'assistant' | 'tool'; content: string }>;
  pendingActions: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
}
interface RequestRecord { householdId: string | undefined; path: string; method: string; body: Record<string, unknown> }

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

async function mockAssistant(page: Page, options: { empty?: boolean } = {}) {
  let serial = 10;
  const id = () => `77777777-7777-4777-8777-${String(serial++).padStart(12, '0')}`;
  const provider = (name: string): Provider => ({
    id: providerId, name, protocol: 'openai-compatible', baseUrl: 'https://model.example.com/v1', model: 'family-model',
    visibility: 'private', ownedByMe: true, hasCredential: true, updatedAt: version,
  });
  const conversation = (title: string, content: string): Conversation => ({
    id: conversationId, title, updatedAt: version, providerId, version: 2, state: 'idle',
    messages: [{ role: 'user', content: title }, { role: 'assistant', content }], pendingActions: [],
  });
  const families = new Map([
    [householdId, {
      name: '周末的家', providers: options.empty ? [] : [provider('我的日常助手')],
      conversations: options.empty ? [] : [conversation('周末准备清单', '根据家庭旅行清单，记得带野餐垫和水。')],
      notes: [{ id: noteId, householdId, title: '家庭旅行清单', body: '野餐垫、水和水果。', createdBy: userId, createdAt: version, updatedAt: version }],
      tasks: [] as Array<Record<string, unknown>>,
    }],
    [secondHouseholdId, {
      name: '父母的家', providers: [{ ...provider('父母共享模型'), visibility: 'household' as const, ownedByMe: false }],
      conversations: [conversation('探望安排', '周日一起去公园散步。')], notes: [], tasks: [] as Array<Record<string, unknown>>,
    }],
  ]);
  const state = {
    families, requests: [] as RequestRecord[], providerSubmissions: [] as Array<Record<string, unknown>>,
    decisions: [] as Array<{ approve: boolean; expectedVersion: number }>, businessWrites: 0,
    providerGate: null as Promise<void> | null, failProviderLoad: false,
    nextSend: 'normal' as 'normal' | 'fail' | 'lost-response',
    decisionGate: null as Promise<void> | null,
  };
  await page.clock.setFixedTime(new Date(version));
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const input = (route.request().postData() ? route.request().postDataJSON() : {}) as Record<string, unknown>;
    const parts = path.split('/').filter(Boolean);
    const targetHouseholdId = parts[2] === 'households' ? parts[3] : undefined;
    state.requests.push({ householdId: targetHouseholdId, path, method, body: input });
    const family = targetHouseholdId ? families.get(targetHouseholdId) : undefined;
    const household = (householdKey: string) => ({
      id: householdKey, name: families.get(householdKey)!.name, role: 'OWNER', memberCount: 1,
      ownerMembershipId: 'membership', createdAt: version,
      members: [{ membershipId: 'membership', userId, displayName: '小林', username: 'xiaolin', role: 'OWNER', isCurrentUser: true }],
    });
    const fail = (status: number, code: string) => route.fulfill({ status, json: { error: { code, message: '模拟请求失败' }, requestId: 'ui-test' } });
    let body: unknown;
    let status = 200;
    if (path.endsWith('/auth/refresh')) body = { accessToken: 'ui-only-token' };
    else if (path.endsWith('/users/me')) body = { id: userId, username: 'xiaolin', displayName: '小林', hasHousehold: true };
    else if (path.endsWith('/invitations/inbox')) body = { invitations: [] };
    else if (path === '/api/v1/households') body = [...families.keys()].map(household);
    else if (family && parts.length === 4) body = household(targetHouseholdId!);
    else if (family && parts[4] === 'assistant' && parts[5] === 'providers') {
      if (method === 'GET') {
        if (state.providerGate) await state.providerGate;
        if (state.failProviderLoad) { state.failProviderLoad = false; await fail(503, 'ASSISTANT_PROVIDER_UNAVAILABLE'); return; }
        body = { providers: family.providers };
      } else if (method === 'POST' || method === 'PUT') {
        state.providerSubmissions.push(input);
        const previous = method === 'PUT' ? family.providers.find(item => item.id === parts[6]) : undefined;
        const result: Provider = {
          id: previous?.id ?? id(), name: String(input.name), protocol: input.protocol as Provider['protocol'],
          baseUrl: String(input.baseUrl), model: String(input.model), visibility: input.visibility as Provider['visibility'],
          ownedByMe: true, hasCredential: true, updatedAt: version,
        };
        family.providers = [...family.providers.filter(item => item.id !== result.id), result];
        // The API's response projection intentionally contains no credential fields.
        body = result;
        status = method === 'POST' ? 201 : 200;
      } else throw new Error(`Unexpected provider request ${method} ${path}`);
    } else if (family && parts[4] === 'assistant' && parts[5] === 'conversations') {
      const selected = family.conversations.find(item => item.id === parts[6]);
      if (parts.length === 6 && method === 'GET') body = { conversations: family.conversations.map(({ id: key, title, updatedAt }) => ({ id: key, title, updatedAt })) };
      else if (parts.length === 6 && method === 'POST') {
        const created: Conversation = { id: id(), title: '新对话', providerId: String(input.providerId), version: 0, updatedAt: version, state: 'idle', messages: [], pendingActions: [] };
        family.conversations.push(created);
        body = created;
        status = 201;
      } else if (!selected) { await fail(404, 'ASSISTANT_CONVERSATION_NOT_FOUND'); return; }
      else if (parts.length === 7 && method === 'GET') body = selected;
      else if (parts[7] === 'messages' && method === 'POST') {
        if (input.expectedVersion !== selected.version) { await fail(409, 'EDIT_CONFLICT'); return; }
        if (state.nextSend === 'fail') { state.nextSend = 'normal'; await fail(502, 'ASSISTANT_PROVIDER_UNAVAILABLE'); return; }
        const message = String(input.message);
        selected.messages.push({ role: 'user', content: message });
        selected.title = message.slice(0, 40);
        selected.version++;
        if (state.nextSend === 'lost-response') {
          state.nextSend = 'normal';
          selected.state = 'running';
          await fail(503, 'ASSISTANT_PROVIDER_UNAVAILABLE');
          return;
        }
        if (message.includes('删除')) {
          selected.pendingActions = [{ id: 'call_delete_note', name: 'delete_note', arguments: { id: noteId, expectedUpdatedAt: version } }];
          selected.messages.push({ role: 'assistant', content: '已找到笔记，请核对删除内容。' });
        } else if (message.includes('新增')) {
          selected.pendingActions = [{ id: 'call_create_task', name: 'create_task', arguments: { title: '准备周末野餐', description: '带水、野餐垫和水果', priority: 'high', assigneeIds: [userId], dueDate: '2030-06-16T04:00:00.000Z' } }];
          selected.messages.push({ role: 'assistant', content: '已整理好任务，请确认后保存。' });
        } else {
          selected.messages.push({ role: 'tool', content: JSON.stringify({ tool: 'list_notes', ok: true, data: { items: family.notes, total: family.notes.length, nextOffset: null, truncated: false } }) });
          selected.messages.push({ role: 'assistant', content: '结合任务与《家庭旅行清单》，建议周六出发前准备野餐垫、水和水果。' });
        }
        body = selected;
      } else if (parts[7] === 'decision' && method === 'POST') {
        if (state.decisionGate) await state.decisionGate;
        if (input.expectedVersion !== selected.version) { await fail(409, 'EDIT_CONFLICT'); return; }
        const approvedIds = Array.isArray(input.approvedIds) ? input.approvedIds as string[] : [];
        const approved = selected.pendingActions.filter(action => approvedIds.includes(action.id));
        state.decisions.push({ approve: approved.length > 0, expectedVersion: Number(input.expectedVersion) });
        const proposal = approved[0];
        if (proposal) {
          state.businessWrites++;
          if (proposal.name === 'create_task') family.tasks.push({
            id: id(), householdId: targetHouseholdId, ...proposal.arguments,
            status: 'pending', labels: [], createdBy: userId, createdAt: version, updatedAt: version, recurrenceRuleId: null, recurrence: null,
          });
          selected.messages.push({ role: 'tool', content: JSON.stringify({ tool: proposal.name, ok: true, data: family.tasks.at(-1) }) });
          selected.messages.push({ role: 'assistant', content: '已创建任务“准备周末野餐”。' });
        } else selected.messages.push({ role: 'assistant', content: '已取消这次操作，家庭内容没有改变。' });
        selected.pendingActions = [];
        selected.version++;
        body = selected;
      } else throw new Error(`Unexpected conversation request ${method} ${path}`);
    } else if (family && parts[4] === 'notes') {
      body = parts[5] ? family.notes.find(item => item.id === parts[5]) : { notes: family.notes, total: family.notes.length };
    } else if (family && parts[4] === 'tasks') body = { tasks: family.tasks, total: family.tasks.length, materializedThrough: null };
    else if (family && parts[4] === 'events') body = { events: [], total: 0, materializedThrough: null };
    else if (family && parts[4] === 'labels') body = { labels: [], total: 0 };
    else throw new Error(`Unexpected API request ${method} ${path}`);
    await route.fulfill({ status, json: body });
  });
  return state;
}

async function enterAssistant(page: Page) {
  await page.goto(`${base}/today`);
  await page.getByRole('tab', { name: '助手', exact: true }).click();
  await expect(page).toHaveURL(`${base}/assistant`);
}

async function openExistingConversation(page: Page) {
  await enterAssistant(page);
  await openHistory(page);
  await page.getByRole('button', { name: '打开对话：周末准备清单', exact: true }).click();
  await expect(page.getByRole('main', { name: '助手对话', exact: true })).toBeVisible();
  await expect(page.getByText('根据家庭旅行清单，记得带野餐垫和水。', { exact: true })).toBeVisible();
}

async function openHistory(page: Page) {
  if ((page.viewportSize()?.width ?? 390) < 1024) await page.getByRole('button', { name: '我的对话', exact: true }).click();
}

async function openModelSettings(page: Page) {
  await page.getByRole('button', { name: '助手选项', exact: true }).click();
  await page.getByRole('button', { name: '模型配置', exact: true }).click();
}

async function openProposal(page: Page) {
  if ((page.viewportSize()?.width ?? 390) < 1280) await page.getByRole('button', { name: '查看待确认操作', exact: true }).click();
}

async function send(page: Page, message: string) {
  const screen = page.getByRole('main', { name: '助手对话', exact: true });
  await screen.getByLabel('发送给助手', { exact: true }).fill(message);
  await screen.getByRole('button', { name: '发送', exact: true }).click();
}

async function checkLayout(page: Page, region: Locator) {
  const overflow = await region.evaluate(root => [...root.querySelectorAll('input, textarea, button, [role="button"], [role="radio"], [role="heading"]')]
    .filter(element => element.getBoundingClientRect().width > 0)
    .some(element => { const rect = element.getBoundingClientRect(); return rect.left < -1 || rect.right > innerWidth + 1; }));
  expect(overflow).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(violations).toEqual([]);
}

for (const width of [320, 390, 1440]) {
  test(`assistant workspace keeps the composer visible and uses contextual confirmation at ${width}px`, async ({ page }) => {
    const state = await mockAssistant(page);
    await page.setViewportSize({ width, height: 900 });
    await openExistingConversation(page);
    await send(page, '看看家庭旅行清单');
    const source = page.getByRole('button', { name: /^查看查询依据：/ });
    await source.click();
    const evidence = page.getByRole('dialog', { name: '查询依据', exact: true });
    await expect(evidence.getByText('家庭旅行清单', { exact: true })).toBeVisible();
    await expect(evidence.getByText('野餐垫、水和水果。', { exact: true })).toBeVisible();
    await checkLayout(page, evidence);
    await page.keyboard.press('Escape');
    await expect(evidence).toHaveCount(0);
    await expect(source).toBeFocused();
    await send(page, '新增一个准备周末野餐的任务');
    expect(state.businessWrites).toBe(0);
    await openProposal(page);
    const preview = width >= 1280 ? page.getByTestId('assistant-inspector') : page.getByRole('dialog', { name: '操作预览', exact: true });
    await expect(preview.getByRole('button', { name: '确认执行', exact: true })).toBeEnabled();
    await checkLayout(page, preview);
    if (width < 600) {
      const bounds = await preview.getByTestId('app-dialog-panel').boundingBox();
      expect(bounds).not.toBeNull();
      expect(Math.abs(bounds!.y + bounds!.height - 900)).toBeLessThan(2);
    } else {
      await expect(page.getByRole('tab', { name: '助手', exact: true })).toHaveAttribute('aria-selected', 'true');
      const transcript = await page.getByTestId('assistant-transcript').boundingBox();
      const pane = await preview.boundingBox();
      expect(pane!.x).toBeGreaterThanOrEqual(transcript!.x + transcript!.width - 1);
    }
    await page.screenshot({ path: `test-results/assistant-preview-${width}.png`, fullPage: true });
    await preview.getByRole('button', { name: '调整方案', exact: true }).click();
    await expect(page.getByLabel('发送给助手', { exact: true })).toHaveValue('请调整刚才的建议：');
    expect(state.decisions).toMatchObject([{ approve: false }]);
    expect(state.businessWrites).toBe(0);
    const selected = state.families.get(householdId)!.conversations[0]!;
    selected.messages.push({ role: 'assistant', content: '# 出行准备\n\n' + Array.from({ length: 35 }, (_, index) => `${index + 1}. 核对第 ${index + 1} 项家庭出行安排`).join('\n') });
    await page.getByRole('button', { name: '助手选项', exact: true }).click();
    await page.getByRole('button', { name: '刷新对话列表和状态', exact: true }).click();
    await expect(page.getByRole('heading', { name: '出行准备', exact: true })).toHaveCount(1);
    const sendButton = page.getByRole('button', { name: '发送', exact: true });
    await expect(sendButton).toBeInViewport();
    await page.getByTestId('assistant-transcript').evaluate(element => { element.scrollTop = 0; });
    await expect(sendButton).toBeInViewport();
    await checkLayout(page, page.getByRole('main', { name: '助手对话', exact: true }));
    state.nextSend = 'fail';
    await send(page, '重新检查出行安排');
    const failure = page.getByRole('alert').filter({ hasText: '已尝试同步对话' });
    await expect(failure).toBeInViewport();
    await expect(page.getByLabel('发送给助手', { exact: true })).toHaveValue('重新检查出行安排');
  });
}

test('changing models creates a separate conversation and preserves the old history', async ({ page }) => {
  const state = await mockAssistant(page);
  const family = state.families.get(householdId)!;
  const secondId = '77777777-7777-4777-8777-777777777777';
  family.providers.push({ ...family.providers[0]!, id: secondId, name: '个人备用模型' });
  await openExistingConversation(page);
  await page.getByRole('button', { name: '选择模型：我的日常助手', exact: true }).click();
  await expect(page.getByText('切换模型会开启新对话，当前记录保留。', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '选择 个人备用模型', exact: true }).click();
  await expect(page.getByRole('button', { name: '选择模型：个人备用模型', exact: true })).toBeVisible();
  await expect(page.getByRole('main', { name: '助手对话', exact: true }).getByLabel('发送给助手', { exact: true })).toHaveValue('');
  expect(family.conversations).toHaveLength(2);
  expect(family.conversations[1]!.providerId).toBe(secondId);
  expect(family.conversations[1]!.messages).toEqual([]);
  expect(family.conversations[0]!.messages).toHaveLength(2);
});

for (const width of [320, 390, 1440]) {
  test(`assistant model setup and a continued conversation fit ${width}px without exposing saved credentials`, async ({ page }) => {
    const state = await mockAssistant(page, { empty: true });
    await page.setViewportSize({ width, height: 900 });
    await enterAssistant(page);
    await page.getByRole('button', { name: '添加模型配置', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '添加模型配置', exact: true });
    await dialog.getByLabel('配置名称', { exact: true }).fill('我的私人模型');
    await dialog.getByLabel('模型名称', { exact: true }).fill('personal-model');
    const credential = dialog.getByLabel('API 密钥', { exact: true });
    await credential.fill('ui-private-secret-do-not-persist');
    await expect(credential).toHaveAttribute('type', 'password');
    await expect(dialog.getByRole('radio', { name: '仅自己', exact: true })).toHaveAttribute('aria-checked', 'true');
    await checkLayout(page, dialog);
    await dialog.getByRole('button', { name: '创建', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await openModelSettings(page);
    const providers = page.getByRole('main', { name: '助手模型配置', exact: true });
    await expect(providers.getByText('仅自己可用 · 已配置密钥', { exact: true })).toBeVisible();
    await providers.getByRole('button', { name: '添加模型配置', exact: true }).click();
    await dialog.getByLabel('配置名称', { exact: true }).fill('家人共用模型');
    await dialog.getByRole('radio', { name: 'Anthropic', exact: true }).click();
    await expect(dialog.getByLabel('服务地址', { exact: true })).toHaveValue('https://api.anthropic.com/v1');
    await dialog.getByLabel('模型名称', { exact: true }).fill('shared-model');
    await dialog.getByLabel('API 密钥', { exact: true }).fill('ui-household-secret-do-not-persist');
    await dialog.getByRole('radio', { name: '家庭可用', exact: true }).click();
    await expect(dialog.getByRole('radio', { name: '家庭可用', exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect(dialog.getByText(/费用由此密钥承担/)).toBeVisible();
    await dialog.getByRole('button', { name: '创建', exact: true }).click();
    await expect(providers.getByText('本家庭成员可用 · 已配置密钥', { exact: true })).toBeVisible();
    expect(state.providerSubmissions.map(item => ({ visibility: item.visibility, protocol: item.protocol }))).toEqual([
      { visibility: 'private', protocol: 'openai-compatible' }, { visibility: 'household', protocol: 'anthropic' },
    ]);
    await providers.getByRole('button', { name: '更多操作：模型配置：家人共用模型', exact: true }).click();
    await page.getByRole('menuitem', { name: '编辑模型配置：家人共用模型', exact: true }).click();
    const edit = page.getByRole('dialog', { name: '编辑模型配置', exact: true });
    await expect(edit.getByLabel('API 密钥', { exact: true })).toHaveValue('');
    await expect(edit.getByText('已保存的密钥不会显示。留空保留原密钥，填写后替换。', { exact: true })).toBeVisible();
    await edit.getByRole('button', { name: '关闭编辑模型配置', exact: true }).click();
    const browserStorage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    expect(browserStorage).not.toContain('ui-private-secret');
    expect(browserStorage).not.toContain('ui-household-secret');
    await expect(page.getByText(/ui-(?:private|household)-secret/)).toHaveCount(0);
    await providers.getByRole('button', { name: '返回', exact: true }).click();
    // The first message is typed on the assistant home; the conversation is created for it and sends it.
    const home = page.getByRole('main', { name: '家庭助手', exact: true });
    await home.getByLabel('开始新对话', { exact: true }).fill('这周出门前需要准备什么？');
    await home.getByRole('button', { name: '发送', exact: true }).click();
    await expect(page.getByRole('main', { name: '助手对话', exact: true })).toBeVisible();
    const answer = page.getByText('结合任务与《家庭旅行清单》，建议周六出发前准备野餐垫、水和水果。', { exact: true });
    await expect(answer).toBeVisible();
    const conversationUrl = page.url();
    await page.reload();
    await expect(answer).toBeVisible();
    await expect(page).toHaveURL(conversationUrl);
    const screen = page.getByRole('main', { name: '助手对话', exact: true });
    await screen.getByLabel('发送给助手', { exact: true }).fill('继续整理周日的安排');
    await screen.getByRole('button', { name: '发送', exact: true }).scrollIntoViewIfNeeded();
    await expect(screen.getByRole('button', { name: '发送', exact: true })).toBeInViewport();
    await expect(screen.getByRole('button', { name: '发送', exact: true })).toBeEnabled();
    await checkLayout(page, screen);
    await page.screenshot({ path: `test-results/assistant-${width}.png`, fullPage: true });
    await screen.getByRole('button', { name: '发送', exact: true }).click();
    await expect(screen.getByLabel('发送给助手', { exact: true })).toHaveValue('');
    expect(state.families.get(householdId)!.conversations[0]!.messages.filter(item => item.role === 'user').map(item => item.content)).toEqual(['这周出门前需要准备什么？', '继续整理周日的安排']);
  });
}

test('assistant proposals show readable targets and only explicit confirmation changes family content', async ({ page }) => {
  const state = await mockAssistant(page);
  // A phone shows the proposal in the 操作预览 window; the wide inspector is covered by the width loop above.
  await page.setViewportSize({ width: 390, height: 844 });
  await openExistingConversation(page);
  await send(page, '新增一个准备周末野餐的任务，交给小林');
  await openProposal(page);
  await expect(page.getByRole('heading', { name: '请确认：创建任务', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: '操作预览', exact: true }).getByText('准备周末野餐', { exact: true })).toBeVisible();
  await expect(page.getByText('小林', { exact: true })).toBeVisible();
  await expect(page.getByLabel('发送给助手', { exact: true })).toHaveAttribute('readonly', '');
  await expect(page.getByRole('button', { name: '发送', exact: true })).toBeDisabled();
  expect(state.businessWrites).toBe(0);
  await page.getByRole('button', { name: '取消操作', exact: true }).click();
  await expect(page.getByText('已取消这次操作，家庭内容没有改变。', { exact: true })).toBeVisible();
  expect(state.businessWrites).toBe(0);
  await send(page, '新增一个准备周末野餐的任务');
  await openProposal(page);
  await expect(page.getByRole('button', { name: '确认执行', exact: true })).toBeEnabled();
  const gate = deferred();
  state.decisionGate = gate.promise;
  await page.getByRole('button', { name: '确认执行', exact: true }).click();
  await expect(page.getByRole('button', { name: '确认执行', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '取消操作', exact: true })).toBeDisabled();
  expect(state.businessWrites).toBe(0);
  gate.release();
  state.decisionGate = null;
  await expect(page.getByText('已创建任务“准备周末野餐”。', { exact: true })).toBeVisible();
  await expect(page.getByText('创建任务成功：准备周末野餐。', { exact: true })).toBeVisible();
  expect(state.businessWrites).toBe(1);
  expect(state.families.get(householdId)!.tasks).toMatchObject([{ title: '准备周末野餐', assigneeIds: [userId] }]);
  await send(page, '删除家庭旅行清单笔记');
  await openProposal(page);
  await expect(page.getByRole('heading', { name: '请确认：删除笔记', exact: true })).toBeVisible();
  await expect(page.getByText('家庭旅行清单', { exact: true })).toBeVisible();
  await expect(page.getByText('野餐垫、水和水果。', { exact: true })).toBeVisible();
  await expect(page.getByText(noteId, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '确认删除', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '取消操作', exact: true }).click();
  await expect(page.getByRole('heading', { name: '请确认：删除笔记', exact: true })).toHaveCount(0);
  expect(state.businessWrites).toBe(1);
  expect(state.families.get(householdId)!.notes).toMatchObject([{ id: noteId, body: '野餐垫、水和水果。' }]);
  expect(state.decisions.map(item => item.approve)).toEqual([false, true, false]);
});

test('assistant loading and provider failures recover persisted work without sending a duplicate request', async ({ page }) => {
  const state = await mockAssistant(page);
  const gate = deferred();
  state.providerGate = gate.promise;
  state.failProviderLoad = true;
  await enterAssistant(page);
  await expect(page.getByRole('progressbar', { name: '正在加载助手', exact: true })).toBeVisible();
  gate.release();
  state.providerGate = null;
  await expect(page.getByRole('alert')).toContainText('模型服务暂时不可用');
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await openHistory(page);
  await page.getByRole('button', { name: '打开对话：周末准备清单', exact: true }).click();
  state.nextSend = 'fail';
  await send(page, '检查本周出行安排');
  await expect(page.getByRole('alert')).toContainText('已尝试同步对话');
  await expect(page.getByLabel('发送给助手', { exact: true })).toHaveValue('检查本周出行安排');
  expect(state.families.get(householdId)!.conversations[0]!.messages.filter(item => item.role === 'user')).toHaveLength(1);
  state.nextSend = 'lost-response';
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByRole('button', { name: '刷新处理结果', exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: '助手正在处理', exact: true })).toBeVisible();
  await expect(page.getByLabel('发送给助手', { exact: true })).toHaveAttribute('readonly', '');
  await expect(page.getByRole('button', { name: '发送', exact: true })).toBeDisabled();
  const saved = state.families.get(householdId)!.conversations[0]!;
  saved.state = 'idle';
  saved.version++;
  saved.messages.push({ role: 'assistant', content: '处理已完成：周六上午出发，提前准备饮水。' });
  // The screen keeps polling the saved conversation while it runs, so the result arrives without a manual refresh.
  await expect(page.getByText('处理已完成：周六上午出发，提前准备饮水。', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '刷新处理结果', exact: true })).toBeHidden();
  await expect(page.getByLabel('发送给助手', { exact: true })).toBeEditable();
  expect(saved.messages.filter(item => item.content === '检查本周出行安排')).toHaveLength(1);
  expect(state.requests.filter(item => item.method === 'POST' && item.path.endsWith('/messages'))).toHaveLength(2);
});

test('switching households separates private history, composer state and shared-model management', async ({ page }) => {
  const state = await mockAssistant(page);
  // Leaving a conversation through 返回 and reading history from its window are the phone paths.
  await page.setViewportSize({ width: 390, height: 844 });
  await openExistingConversation(page);
  await page.getByLabel('发送给助手', { exact: true }).fill('只属于周末的家的未发送内容');
  await page.getByRole('main', { name: '助手对话', exact: true }).getByRole('button', { name: '返回', exact: true }).click();
  // The assistant home is a tab; households switch from any destination's header.
  await expect(page.getByRole('main', { name: '家庭助手', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '今日', exact: true }).click();
  await page.getByRole('button', { name: '当前家庭：周末的家，切换家庭', exact: true }).click();
  await page.getByRole('button', { name: /^父母的家，/ }).click();
  await expect(page).toHaveURL(`/households/${secondHouseholdId}/today`);
  const requestsBeforeSecondHousehold = state.requests.length;
  await page.getByRole('tab', { name: '助手', exact: true }).click();
  await openHistory(page);
  await expect(page.getByRole('button', { name: '打开对话：探望安排', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '打开对话：周末准备清单', exact: true })).toHaveCount(0);
  await expect(page.getByText('我的日常助手', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '关闭我的对话', exact: true }).click();
  await openModelSettings(page);
  const providers = page.getByRole('main', { name: '助手模型配置', exact: true });
  await expect(providers.getByText('父母共享模型', { exact: true })).toBeVisible();
  await expect(providers.getByRole('button', { name: /^更多操作：模型配置：|^编辑模型配置：|^删除模型配置：/ })).toHaveCount(0);
  await providers.getByRole('button', { name: '返回', exact: true }).click();
  await openHistory(page);
  await page.getByRole('button', { name: '打开对话：探望安排', exact: true }).click();
  await expect(page.getByText('周日一起去公园散步。', { exact: true })).toBeVisible();
  await expect(page.getByLabel('发送给助手', { exact: true })).toHaveValue('');
  await expect(page.getByText('根据家庭旅行清单，记得带野餐垫和水。', { exact: true })).toHaveCount(0);
  const assistantRequests = state.requests.slice(requestsBeforeSecondHousehold).filter(item => item.path.includes('/assistant/'));
  expect(assistantRequests.length).toBeGreaterThan(0);
  expect(assistantRequests.every(item => item.householdId === secondHouseholdId)).toBe(true);
});
