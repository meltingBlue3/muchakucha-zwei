import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const taskId = '33333333-3333-4333-8333-333333333333';
const household = (id: string) => ({ id, name: id === a ? '家庭 A' : '家庭 B', role: 'OWNER', memberCount: 1, ownerMembershipId: 'member' });

async function dialogAppearance(page: Page) {
  return page.getByRole('dialog', { name: /^(个人资料|退出登录|编辑家庭名称|邀请家人|撤销邀请？)$/ }).getByTestId('app-dialog-panel').evaluate((panel) => {
    const read = (element: Element, properties: string[]) => {
      const style = getComputedStyle(element);
      return properties.map((property) => style.getPropertyValue(property));
    };
    return {
      panel: read(panel, ['width', 'max-width', 'padding', 'gap', 'border-radius', 'border', 'background-color']),
      title: read(panel.querySelector('[role="heading"]')!, ['font-family', 'font-size', 'font-weight', 'line-height', 'color']),
      close: read(panel.querySelector('[role="button"]')!, ['width', 'height', 'border-radius', 'background-color']),
      blur: read(document.querySelector('[data-testid="app-dialog-blur"]')!, ['backdrop-filter']),
    };
  });
}

async function setup(page: Page) {
  const requests: { path: string; method: string; data: unknown }[] = [];
  const task = { id: taskId, householdId: a, title: '检查任务', status: 'pending', priority: 'medium', dueDate: null, description: null, assigneeIds: [], labels: [], createdBy: 'user', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), recurrenceRuleId: null, recurrence: null, occurrenceDate: null };
  await page.addInitScript((id) => localStorage.setItem('muchakucha:currentHouseholdId', id), b);
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    requests.push({ path, method, data: route.request().postData() });
    let body: unknown = {};
    let status = 200;
    if (path.endsWith('/auth/refresh')) body = { accessToken: 'mock-only' };
    else if (path.endsWith('/users/me')) body = { id: 'user', username: 'review', displayName: '检查用户' };
    else if (path.endsWith('/users/me/reminder-settings')) body = { taskMinutesBefore: 0, eventMinutesBefore: 15, dateOnlyTime: '09:00', alarm: false, households: [] };
    else if (path === '/api/v1/households') body = [household(a), household(b)];
    else if (path.endsWith('/invitations/inbox')) body = { invitations: [{ id: 'invite', householdName: '家庭 A', inviterDisplayName: '家人', expiresAt: '2099-01-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z' }] };
    else if (path.endsWith('/labels')) body = { labels: [{ id: 'label', name: '家务', color: '#277A72' }] };
    else if (path.endsWith('/tasks/' + taskId) && method === 'PUT') { status = 403; body = { error: { code: 'FORBIDDEN' } }; }
    else if (path.endsWith('/tasks')) body = method === 'POST' ? task : { tasks: [task] };
    else if (path.endsWith('/events')) body = method === 'POST' ? { id: taskId } : { events: [] };
    else if (path.endsWith('/notes')) body = method === 'POST' ? { id: taskId, householdId: a, ...JSON.parse(route.request().postData() ?? '{}'), createdBy: 'user', updatedBy: 'user', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), pinnedAt: null, labels: [] } : { notes: [] };
    else if (path.endsWith('/' + a) || path.endsWith('/' + b)) body = { ...household(path.endsWith(a) ? a : b), members: [] };
    else status = 404;
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return requests;
}

test('deep links use the route household and preserve operation failures', async ({ page }) => {
  const requests = await setup(page);
  await page.goto(`/households/${a}/today`);
  await expect(page.getByRole('button', { name: '当前家庭：家庭 A，切换家庭' })).toBeVisible();
  // The linked household replaces the remembered one, so /households and the next launch return here.
  await expect.poll(() => page.evaluate(() => localStorage.getItem('muchakucha:currentHouseholdId'))).toBe(a);
  await page.getByRole('button', { name: '完成任务', exact: true }).click();
  // The refusal is reported on the card that was tapped, not in a page banner.
  await expect(page.getByText('你没有权限修改这个任务。')).toBeVisible();
  await expect(page.getByRole('button', { name: '重试：检查任务' })).toBeVisible();
  await expect(page.getByText('检查任务', { exact: true })).toBeVisible();
  expect(requests.some((r) => r.method === 'PUT' && r.path === `/api/v1/households/${a}/tasks/${taskId}`)).toBe(true);
});

for (const width of [320, 390, 1440]) {
  test(`household settings fit ${width}px with members and invitations`, async ({ page }) => {
    await setup(page);
    await page.setViewportSize({ width, height: 900 });
    const members = [
      { membershipId: 'member', userId: 'user', displayName: '小林', username: 'lin', role: 'OWNER', isCurrentUser: true },
      { membershipId: 'second', userId: 'second', displayName: '名字比较长的家庭成员', username: 'family_member', role: 'MEMBER', isCurrentUser: false },
    ];
    await page.route(`**/api/v1/households/${a}`, async (route) => {
      const name = route.request().method() === 'PATCH' ? route.request().postDataJSON().name : '家庭 A';
      await route.fulfill({ json: { ...household(a), name, members } });
    });
    await page.route(`**/api/v1/households/${a}/invitations`, async (route) => {
      await route.fulfill({ json: { invitations: [{ id: 'invite', username: 'another_family_member', role: 'MEMBER', status: 'pending', createdAt: '2026-09-15T00:00:00Z', expiresAt: '2099-09-20T00:00:00Z' }] } });
    });
    await page.goto(`/households/${a}/settings`);
    await expect(page.getByRole('heading', { name: '基本信息', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '更多操作：成员：名字比较长的家庭成员', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '更多操作：邀请：another_family_member', exact: true })).toBeVisible();
    // Your own row has no actions.
    await expect(page.getByRole('button', { name: '更多操作：成员：小林', exact: true })).toHaveCount(0);
    const overflow = await page.evaluate(() => [...document.querySelectorAll('input, [role="button"], [role="heading"]')].some((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1);
    }));
    expect(overflow).toBe(false);
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
    await page.screenshot({ path: `test-results/settings-${width}.png`, fullPage: true });
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await page.getByRole('button', { name: '个人中心', exact: true }).click();
    await page.getByRole('menuitem', { name: '个人资料' }).click();
    let appearance: Awaited<ReturnType<typeof dialogAppearance>> | undefined;
    if (width >= 1024) {
      await expect(page).toHaveURL(/profile$/);
      // A wide screen reads the nickname as text until 编辑 opens it in its row.
      await expect(page.getByRole('button', { name: '编辑昵称', exact: true })).toBeVisible();
      await page.getByRole('link', { name: '家庭设置', exact: true }).click();
    } else {
      await expect(page.getByRole('dialog', { name: '个人资料' })).toBeVisible();
      appearance = await dialogAppearance(page);
      await page.keyboard.press('Escape');
    }
    await page.getByRole('button', { name: '个人中心', exact: true }).click();
    await page.getByRole('menuitem', { name: '退出登录' }).click();
    await expect(page.getByRole('dialog', { name: '退出登录' })).toBeVisible();
    if (appearance) expect(await dialogAppearance(page)).toEqual(appearance);
    else appearance = await dialogAppearance(page);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '编辑家庭名称' }).click();
    await expect(page.getByRole('dialog', { name: '编辑家庭名称' })).toBeVisible();
    expect(await dialogAppearance(page)).toEqual(appearance);
    await expect(page.getByTestId('app-dialog-blur')).toHaveCSS('backdrop-filter', /blur/);
    await page.screenshot({ path: `test-results/settings-edit-dialog-${width}.png` });
    await page.getByLabel('家庭名称', { exact: true }).fill('新的家庭名称');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByText('家庭名称已更新。')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: '编辑家庭名称' })).toBeFocused();
    await page.getByRole('button', { name: '邀请家人', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '邀请家人' })).toBeVisible();
    expect(await dialogAppearance(page)).toEqual(appearance);
    await expect(page.getByTestId('app-dialog-blur')).toHaveCSS('backdrop-filter', /blur/);
    await page.screenshot({ path: `test-results/settings-invite-dialog-${width}.png` });
    await expect(page.getByLabel('用户名', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '关闭邀请家人' }).click();
    await expect(page.getByRole('button', { name: '邀请家人', exact: true })).toBeFocused();
    let revokeAttempts = 0;
    await page.route(`**/api/v1/households/${a}/invitations/invite/revoke`, async (route) => {
      revokeAttempts++;
      await route.fulfill({ status: revokeAttempts === 1 ? 503 : 200, json: {} });
    });
    const revoke = page.getByRole('button', { name: '更多操作：邀请：another_family_member', exact: true });
    const openRevoke = async () => {
      await revoke.click();
      await page.getByRole('menuitem', { name: '撤销邀请 another_family_member', exact: true }).click();
    };
    await openRevoke();
    await expect(page.getByRole('dialog', { name: '撤销邀请？' })).toBeVisible();
    expect(await dialogAppearance(page)).toEqual(appearance);
    await page.screenshot({ path: `test-results/settings-revoke-dialog-${width}.png` });
    await page.getByRole('button', { name: '保留邀请' }).click();
    expect(revokeAttempts).toBe(0);
    await expect(revoke).toBeFocused();
    await openRevoke();
    await page.getByRole('button', { name: '撤销邀请', exact: true }).click();
    await expect(page.getByText('撤销失败，家庭邀请状态未改变。请重试。')).toBeVisible();
    await page.getByRole('button', { name: '撤销邀请', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '撤销邀请？' })).toHaveCount(0);
    await expect(page.getByText('已撤销', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '邀请家人', exact: true })).toBeFocused();
    await expect(page).toHaveURL(new RegExp(`/households/${a}/settings$`));
  });
}

test('Japanese household invitations use localized form and confirmation text', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 320, height: 844 } });
  try {
    const page = await context.newPage();
    await setup(page);
    await page.route(`**/api/v1/households/${a}`, route => route.fulfill({
      json: { ...household(a), members: [{ membershipId: 'member', userId: 'user', displayName: '小林', username: 'lin', role: 'OWNER', isCurrentUser: true }] },
    }));
    await page.route(`**/api/v1/households/${a}/invitations`, route => route.fulfill({
      json: route.request().method() === 'POST'
        ? { code: 'INVITATION_SENT', invitationId: 'invite', message: '邀请已发送到对方的收件箱。' }
        : { invitations: [] },
    }));
    await page.goto(`/households/${a}/settings`);
    await page.getByRole('button', { name: '家族を招待', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '家族を招待', exact: true });
    await dialog.getByRole('textbox', { name: 'ユーザー名', exact: true }).fill('another_member');
    await dialog.getByRole('button', { name: '招待を送信', exact: true }).click();
    await expect(dialog.getByText('相手の受信箱に招待を送りました。')).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  } finally {
    await context.close();
  }
});

for (const width of [390, 1440]) {
  test(`household settings allow members to leave and require owner transfer at ${width}px`, async ({ page }) => {
    await setup(page);
    await page.setViewportSize({ width, height: 900 });
    let ownerMembershipId = 'other';
    const members = [
      { membershipId: 'member', userId: 'user', displayName: '小林', username: 'lin', role: 'MEMBER', isCurrentUser: true },
      { membershipId: 'other', userId: 'other', displayName: '妈妈', username: 'mama', role: 'OWNER', isCurrentUser: false },
    ];
    await page.route(`**/api/v1/households/${a}`, async (route) => {
      await route.fulfill({ json: { ...household(a), ownerMembershipId, members } });
    });
    await page.route(`**/api/v1/households/${a}/invitations`, async (route) => {
      await route.fulfill({ json: { invitations: [] } });
    });
    await page.goto(`/households/${a}/settings`);
    await expect(page.getByRole('heading', { name: '基本信息', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '编辑家庭名称' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '离开家庭' })).toBeVisible();

    ownerMembershipId = 'member';
    members[0]!.role = 'OWNER';
    members[1] = { ...members[1]!, role: 'MEMBER' };
    members.push({ membershipId: 'third', userId: 'third', displayName: '爸爸', username: 'papa', role: 'MEMBER', isCurrentUser: false });
    await page.reload();
    await expect(page.getByRole('button', { name: '编辑家庭名称' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^离开家庭/ })).toHaveCount(1);
    await page.getByRole('button', { name: '离开家庭' }).click();
    const dialog = page.getByRole('dialog', { name: '离开家庭' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: '下一步' })).toBeDisabled();
    await dialog.getByRole('radio', { name: '爸爸' }).click();
    await expect(dialog.getByRole('radio', { name: '爸爸' })).toHaveAttribute('aria-checked', 'true');
    await page.screenshot({ path: `test-results/settings-leave-dialog-${width}.png` });
    await dialog.getByRole('button', { name: '下一步' }).click();
    await expect(page).toHaveURL(new RegExp(`/households/${a}/ownership/transfer\\?successorMembershipId=third`));
  });
}

test('family management is a restorable destination', async ({ page }) => {
  await setup(page);
  await page.goto(`/households/${a}/more`);
  await expect(page.getByRole('heading', { name: '家庭', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '打开家庭设置', exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/households/${a}/more$`));
  // A row in a grouped list draws its ring inside, where the group cannot clip it.
  const settingsRow = page.getByRole('button', { name: '打开家庭设置', exact: true });
  await page.keyboard.press('Shift');
  await settingsRow.focus();
  await expect(settingsRow).toHaveCSS('outline-color', 'rgb(194, 56, 28)');
  await expect(settingsRow).toHaveCSS('outline-offset', '-2px');
});

test('the household menu reaches the family pages on a phone', async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/households/${a}/today`);
  await page.getByRole('button', { name: '当前家庭：家庭 A，切换家庭' }).click();
  await page.getByRole('button', { name: '标签管理', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/households/${a}/labels$`));
  await expect(page.getByRole('tablist', { name: '家庭主导航' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '返回', exact: true })).toBeVisible();
});

test('task filters and calendar month survive tab switches', async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/households/${a}/tasks`);
  // Status sits on the page itself; the 筛选 window holds the rest.
  await page.getByRole('radio', { name: '筛选：进行中', exact: true }).click();
  await page.getByRole('tab', { name: '日历', exact: true }).click();
  // Phones open on one week; the month is one tap away and stays open.
  await page.getByRole('button', { name: '展开月历', exact: true }).click();
  await page.getByLabel('下一个月').click();
  const nextMonth = await page.getByText(/^\d{4}年\s*\d{1,2}月$/).innerText();
  await page.getByRole('tab', { name: '任务', exact: true }).click();
  await expect(page.getByRole('radio', { name: '筛选：进行中', exact: true })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('tab', { name: '日历', exact: true }).click();
  await expect(page.getByText(nextMonth, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '收起月历', exact: true })).toBeVisible();
});

for (const kind of ['tasks', 'events'] as const) {
  test(`${kind} creation sends its labels in the one create request`, async ({ page }) => {
    const requests = await setup(page);
    await page.goto(`/households/${a}/${kind}`);
    await page.getByLabel(kind === 'tasks' ? '创建任务' : '创建日程', { exact: true }).click();
    await page.getByLabel(kind === 'tasks' ? '任务标题' : '日程标题', { exact: true }).fill('只创建一次');
    await expect(page.getByText('保存到：家庭 A', { exact: true })).toBeVisible();
    // The create window names its household and offers no switcher of its own; the wide sidebar keeps the global one outside it.
    const createWindow = (page.viewportSize()?.width ?? 0) >= 1024 ? page.getByRole('region', { name: kind === 'tasks' ? '创建任务' : '创建日程', exact: true }) : page;
    await expect(createWindow.getByRole('button', { name: /当前家庭/ })).toHaveCount(0);
    await page.getByLabel('选择标签 家务', { exact: true }).click();
    await page.getByLabel('创建', { exact: true }).filter({ visible: true }).last().click();
    await expect(page).toHaveURL(new RegExp(`/households/${a}/${kind}$`));
    const creates = requests.filter((r) => r.method === 'POST' && r.path.endsWith('/' + kind));
    expect(creates.map((r) => JSON.parse(String(r.data)).labelIds)).toEqual([['label']]);
    expect(requests.filter((r) => r.method === 'POST' && r.path.endsWith('/labels'))).toHaveLength(0);
  });
}

const noteEditor = (page: Page) => page.getByRole('textbox', { name: '笔记内容', exact: true });
const noteTitleLine = (page: Page) => noteEditor(page).locator('h1.note-title');
const noteWindow = (page: Page, name = '笔记') => page.getByRole((page.viewportSize()?.width ?? 0) >= 1024 ? 'region' : 'dialog', { name, exact: true });
/** The note as the API would return it after a save. */
const savedNote = (input: { title: string; body?: string }, id = taskId) => ({ id, householdId: a, title: input.title, body: input.body ?? null, createdBy: 'user', updatedBy: 'user', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: new Date().toISOString(), pinnedAt: null, labels: [] });
async function writeNote(page: Page, title: string, body: string) {
  await noteTitleLine(page).click();
  await page.keyboard.type(title);
  await page.keyboard.press('Enter');
  await page.keyboard.type(body);
}

test('a new note keeps its draft while saves fail, and is not drafted again once saved', async ({ page }) => {
  await setup(page);
  let online = false;
  await page.route(`**/api/v1/households/${a}/notes`, route => {
    if (route.request().method() !== 'POST') return route.fallback();
    return online ? route.fulfill({ json: savedNote(route.request().postDataJSON()) }) : route.fulfill({ status: 503, json: {} });
  });
  await page.goto(`/households/${a}/notes`);
  await page.getByLabel('创建笔记', { exact: true }).click();
  await writeNote(page, '还没写完', '第一行内容');
  await expect(page.getByText('保存失败。内容已存在这台设备，稍后会再试。', { exact: true })).toBeVisible();
  await expect(page.getByTestId('note-save-state')).toHaveText('未保存');
  await page.getByRole('button', { name: '关闭笔记', exact: true }).click();
  await page.getByLabel('创建笔记', { exact: true }).click();
  await expect(noteTitleLine(page)).toHaveText('还没写完');
  await expect(noteEditor(page)).toContainText('第一行内容');
  await expect(page.getByTestId('note-save-state')).toHaveText('未保存');
  online = true;
  await noteEditor(page).getByText('第一行内容').click();
  await page.keyboard.press('Control+Enter');
  await expect(page.getByTestId('note-save-state')).toHaveText('已保存');
  await expect(page).toHaveURL(new RegExp(`/households/${a}/notes/${taskId}$`));
  await page.getByRole('button', { name: '关闭笔记', exact: true }).click();
  await page.getByRole('main', { name: '家庭笔记', exact: true }).getByLabel('创建笔记', { exact: true }).click();
  await expect(noteTitleLine(page)).toHaveText('');
  await expect(page.getByTestId('note-save-state')).toHaveCount(0);
});

test('a failed inbox has a working retry action', async ({ page }) => {
  await setup(page);
  // The inbox stays unreachable until the person retries. Failing only the first request is not enough:
  // a wide screen also asks for the inbox count from the sidebar and the account navigation, which may go first.
  let inboxDown = true;
  await page.route('**/api/v1/households/invitations/inbox', (route) => inboxDown ? route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }) : route.fallback());
  await page.goto('/inbox');
  await expect(page.getByText('暂时无法加载收件箱，请检查网络后重试。')).toBeVisible();
  inboxDown = false;
  await page.getByRole('button', { name: '重试' }).click();
  await expect(page.getByRole('button', { name: '接受「家庭 A」的邀请' })).toBeVisible();
});

for (const width of [320, 390, 1440]) {
  test(`redesigned destinations fit ${width}px and keep navigation reachable`, async ({ page }) => {
    test.setTimeout(90_000);
    await setup(page);
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 16, 30).toISOString();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 30).toISOString();
    await page.route(/\/api\/v1\/households\/[^/]+\/(tasks|events|notes)(?:\?.*)?$/, async (route) => {
      const path = new URL(route.request().url()).pathname;
      const common = { householdId: a, createdBy: 'user', createdAt: start, updatedAt: start, labels: [], recurrenceRuleId: null, recurrence: null };
      const body = path.endsWith('/events') ? { events: [{ ...common, id: 'event-preview', title: '接孩子放学，一起去公园散步', startTime: start, endTime: end, allDay: false, location: '学校南门 · 记得带水杯', description: null }] }
        : path.endsWith('/notes') ? { notes: [{ ...common, pinnedAt: null, id: 'note-preview', title: '这周想一起做的事', body: '周末试试新的番茄意面。\n买一束鲜花，给阳台的植物浇水。' }] }
        : { tasks: [{ ...common, id: taskId, title: '补充家里的水果、牛奶和周末早餐食材', status: 'pending', priority: 'medium', dueDate: null, description: '冰箱里还有鸡蛋，购物前先看一眼清单。', assigneeIds: [] }] };
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    });
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    // On a phone Today is titled with the date; on a wide screen the header says 今日 and the date leads its summary.
    // 家庭 has no tab and is reached through the household menu.
    const destinations: Array<[string, string | RegExp, string?]> = [['today', width >= 1024 ? '今日' : /^\d{1,2}月\d{1,2}日$/], ['events', '日历', '日历'], ['tasks', '任务', '任务'], ['notes', '笔记', '笔记'], ['more', '家庭']];
    for (const [route, title, tab] of destinations) {
      if (tab) await page.getByRole('tab', { name: tab, exact: true }).click();
      else await page.goto(`/households/${a}/${route}`);
      await expect(page.getByRole('heading', { name: title, exact: true, level: 1 })).toBeVisible();
      const navigation = page.getByRole('tablist', { name: '家庭主导航' });
      await expect(navigation.getByRole('tab')).toHaveCount(5);
      await expect(navigation.getByRole('tab', { name: '助手', exact: true })).toBeVisible();
      const navBounds = await navigation.boundingBox();
      expect(navBounds).not.toBeNull();
      expect(navBounds!.y + navBounds!.height).toBeLessThanOrEqual(901);
      const overflow = await page.evaluate(() => [...document.querySelectorAll('input, button, [role="button"], [role="heading"], [role="tab"]')]
        .filter((el) => el.getBoundingClientRect().width > 0)
        .some((el) => { const r = el.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; }));
      expect(overflow).toBe(false);
      if (width === 390) {
        const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
      }
      await page.screenshot({ path: `test-results/redesign-${route}-${width}.png`, fullPage: true });
    }
    expect(pageErrors).toEqual([]);
  });
}

for (const width of [390, 800, 1700]) {
  test(`the note editor fills the writing area at ${width}px and scrolls inside it`, async ({ page }) => {
    await setup(page);
    await page.setViewportSize({ width, height: 720 });
    await page.goto(`/households/${a}/notes/new`);
    const window = noteWindow(page);
    const panel = window.getByTestId('app-dialog-panel');
    const scroller = page.locator('.note-editor');
    await noteTitleLine(page).click();
    await page.keyboard.type('给家人的笔记');
    for (let line = 0; line < 40; line++) { await page.keyboard.press('Enter'); await page.keyboard.type(`第 ${line + 1} 行`); }
    // The page is the editing surface: no field border or outline around the text.
    await expect(noteEditor(page)).toHaveCSS('outline-style', 'none');
    const smaller = (await scroller.boundingBox())!;
    await page.setViewportSize({ width, height: 960 });
    await expect.poll(async () => (await scroller.boundingBox())!.height).toBeGreaterThan(smaller.height + 200);
    const body = (await scroller.boundingBox())!;
    const frame = (await panel.boundingBox())!;
    expect(body.width).toBeGreaterThan(frame.width * 0.85);
    // Down to the window's bottom, or to the formatting bar above the keyboard on a phone.
    const below = width < 1024 ? await window.getByRole('toolbar', { name: '笔记格式' }).boundingBox() : null;
    expect((below?.y ?? frame.y + frame.height) - (body.y + body.height)).toBeLessThan(48);
    expect(await scroller.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  });
}

for (const width of [320, 390, 1440]) {
  test(`the note editor formats from its toolbar or the / menu and fits ${width}px`, async ({ page }, testInfo) => {
    const requests = await setup(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/households/${a}/notes/new`);
    const window = noteWindow(page);
    const wide = width >= 1024;
    // The header carries the way out, the save state and the note's menu on one line.
    const closeBox = (await window.getByRole('button', { name: '关闭笔记', exact: true }).boundingBox())!;
    const menuBox = (await window.getByRole('button', { name: '更多操作：笔记：笔记', exact: true }).boundingBox())!;
    expect(Math.abs((closeBox.y + closeBox.height / 2) - (menuBox.y + menuBox.height / 2))).toBeLessThan(2);
    expect(wide ? menuBox.x < closeBox.x : closeBox.x < menuBox.x).toBe(true);

    await writeNote(page, '日语学习', '词语');
    await page.keyboard.press('Shift+Home');
    const toolbar = window.getByRole('toolbar', { name: '笔记格式' });
    if (wide) {
      // A wide screen keeps no standing toolbar; Markdown and the / menu do the formatting.
      await expect(toolbar).toHaveCount(0);
      await page.keyboard.press('Control+b');
    } else {
      expect(await toolbar.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await toolbar.getByRole('button', { name: '粗体', exact: true }).click();
      await expect(toolbar.getByRole('button', { name: '粗体', exact: true })).toHaveAttribute('aria-pressed', 'true');
    }
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    if (wide) { await page.keyboard.type('/小标'); await page.keyboard.press('Enter'); } else await toolbar.getByRole('button', { name: '小标题', exact: true }).click();
    await page.keyboard.type('资料');
    await page.keyboard.press('Enter');
    if (wide) { await page.keyboard.type('/链接'); await page.keyboard.press('Enter'); } else await toolbar.getByRole('button', { name: '链接', exact: true }).click();
    const link = noteWindow(page, '插入链接');
    await expect(noteEditor(page)).toBeHidden();
    await link.getByLabel('显示文字', { exact: true }).fill('学习资料');
    await link.getByLabel('网址', { exact: true }).fill('https://example.com');
    expect((await new AxeBuilder({ page }).include(wide ? '[role="region"]' : '[role="dialog"]').analyze()).violations).toEqual([]);
    await link.getByRole('button', { name: '插入链接', exact: true }).click();
    await expect(noteEditor(page).getByRole('link', { name: '学习资料' })).toBeVisible();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/表格');
    await page.keyboard.press('Enter');
    await noteWindow(page, '插入表格').getByRole('button', { name: '插入表格', exact: true }).click();
    await expect(noteEditor(page).getByRole('table')).toBeVisible();
    await expect(page.getByTestId('note-save-state')).toHaveText('已保存');
    const writes = requests.filter(request => /\/notes(\/[^/]+)?$/.test(request.path) && (request.method === 'POST' || request.method === 'PUT'));
    const saved = JSON.parse(String(writes[writes.length - 1]!.data)) as { title: string; body: string };
    expect(saved.title).toBe('日语学习');
    expect(saved.body).toContain('**词语**');
    expect(saved.body).toContain('## 资料');
    expect(saved.body).toContain('[学习资料](https://example.com)');
    expect(saved.body).toMatch(/\| --- \| --- \|/);
    expect(await window.getByTestId('app-dialog-panel').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include(wide ? '[role="region"]' : '[role="dialog"]').analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`note-formats-${width}.png`) });
  });
}

test('the Japanese note editor names its tools, menu and states in Japanese', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 320, height: 900 } });
  try {
    const page = await context.newPage();
    const requests = await setup(page);
    await page.goto(`/households/${a}/notes/new`);
    const editor = page.getByRole('textbox', { name: 'ノートの本文', exact: true });
    await expect(editor.locator('h1.note-title')).toHaveAttribute('data-placeholder', 'タイトル');
    await editor.locator('h1.note-title').click();
    await page.keyboard.type('旅行の計画');
    await page.keyboard.press('Enter');
    const toolbar = page.getByRole('dialog', { name: 'ノート', exact: true }).getByRole('toolbar', { name: 'ノートの書式' });
    for (const name of ['チェックリスト', '箇条書き', '見出し', '太字', 'リンク', 'キーボードを閉じる']) await expect(toolbar.getByRole('button', { name, exact: true })).toBeVisible();
    await toolbar.getByRole('button', { name: 'チェックリスト', exact: true }).click();
    await page.keyboard.type('パスポート');
    await expect(editor.getByRole('checkbox', { name: '未チェック：パスポート', exact: true })).toBeVisible();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/');
    await expect(page.getByRole('listbox', { name: '挿入', exact: true }).getByRole('option')).toHaveText(['チェックリスト- [ ]', '箇条書き-', '番号付きリスト1.', '見出し##', '引用>', '区切り線---', '表| |', 'コードブロック```', 'リンク[ ]( )']);
    await page.keyboard.press('Backspace');
    await expect(page.getByTestId('note-save-state')).toHaveText('保存済み');
    expect(requests.find(request => request.method === 'POST' && request.path.endsWith('/notes'))?.data).toContain('- [ ] パスポート');
    await editor.getByRole('checkbox', { name: '未チェック：パスポート', exact: true }).click();
    await expect(editor.getByRole('checkbox', { name: 'チェック済み：パスポート', exact: true })).toBeChecked();
  } finally {
    await context.close();
  }
});

test('the link and table steps close back to the text without losing it, and old edit links open the note', async ({ page }) => {
  await setup(page);
  // The formatting toolbar belongs to a phone.
  await page.setViewportSize({ width: 390, height: 844 });
  let note = savedNote({ title: '日语学习', body: '词语练习' });
  await page.route(`**/api/v1/households/${a}/notes/${taskId}`, route => {
    if (route.request().method() === 'PUT') note = { ...note, ...route.request().postDataJSON(), updatedAt: new Date().toISOString() };
    return route.fulfill({ json: note });
  });
  await page.goto(`/households/${a}/notes/${taskId}/edit`);
  await expect(page).toHaveURL(new RegExp(`/notes/${taskId}$`));
  const window = noteWindow(page);
  await expect(noteTitleLine(page)).toHaveText('日语学习');
  await noteEditor(page).getByText('词语练习').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+Home');
  await window.getByRole('toolbar', { name: '笔记格式' }).getByRole('button', { name: '链接', exact: true }).click();
  const link = noteWindow(page, '插入链接');
  await expect(link.getByLabel('显示文字')).toHaveValue('词语练习');
  await link.getByLabel('网址', { exact: true }).fill('https://example.com');
  await link.getByRole('button', { name: '关闭插入链接', exact: true }).click();
  await expect(noteEditor(page)).toBeFocused();
  await expect(noteEditor(page)).toContainText('词语练习');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/表格');
  await page.keyboard.press('Enter');
  const table = noteWindow(page, '插入表格');
  await expect(table).toBeVisible();
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(table).toBeHidden();
  await expect(noteEditor(page)).toContainText('词语练习');
  await expect(noteEditor(page).getByRole('table')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page).toHaveURL(new RegExp(`/notes/${taskId}$`));
});

for (const width of [320, 390, 1440]) {
  test(`module actions and unified filters remain reachable at ${width}px`, async ({ page }, testInfo) => {
    await setup(page);
    await page.setViewportSize({ width, height: 844 });
    const task = { id: taskId, householdId: a, title: '待办样例', status: 'pending', priority: 'medium', dueDate: null, description: null, assigneeIds: [], labels: [], createdBy: 'user', createdAt: '2026-09-27T00:00:00Z', updatedAt: '2026-09-27T00:00:00Z', recurrenceRuleId: null, recurrence: null, occurrenceDate: null };
    await page.route(`**/api/v1/households/${a}/tasks`, route => route.fulfill({ json: { tasks: [task, { ...task, id: 'progress', title: '进行中样例', status: 'in_progress' }, { ...task, id: 'done', title: '已完成样例', status: 'completed' }] } }));
    for (const [route, title, createLabel] of [
      ['today', '今日', '创建新内容'], ['events', '日历', '创建日程'], ['tasks', '任务', '创建任务'], ['notes', '笔记', '创建笔记'],
    ] as const) {
      await page.goto(`/households/${a}/${route}`);
      const create = page.getByRole('button', { name: createLabel, exact: true });
      await expect(create).toBeInViewport();
      // On a phone Today's title is the date itself; a wide screen titles it 今日.
      const heading = await page.getByRole('heading', route === 'today' && width < 1024 ? { name: /^\d{1,2}月\d{1,2}日$/ } : { name: title, exact: true }).boundingBox();
      const button = await create.boundingBox();
      if (width === 1440) {
        expect(Math.abs(button!.y + button!.height / 2 - heading!.y - heading!.height / 2)).toBeLessThan(2);
        await expect(page.getByTestId('floating-create')).toHaveCount(0);
      } else {
        expect(button!.y).toBeGreaterThan(844 / 2);
        expect(button!.x).toBeGreaterThan(width / 2);
        await expect(page.getByTestId('header-create')).toHaveCount(0);
      }
      await page.screenshot({ path: testInfo.outputPath(`${route}-toolbar-${width}.png`) });
      if (route === 'today') {
        await create.click();
        const menu = page.getByRole('menu', { name: '创建内容', exact: true });
        await expect(menu).toBeInViewport();
        if (width === 1440) expect((await menu.boundingBox())!.y).toBeGreaterThan(button!.y + button!.height);
        await page.getByRole('menuitem', { name: '创建任务', exact: true }).click();
      } else await create.click();
      // A new note opens as the note itself, so its window is named 笔记.
      const windowName = route === 'today' ? '创建任务' : route === 'notes' ? '笔记' : createLabel;
      const editor = page.getByRole(width >= 1024 ? 'region' : 'dialog', { name: windowName, exact: true });
      await expect(editor).toBeVisible();
      if (width >= 1024) await editor.getByRole('heading', { name: windowName, exact: true }).focus();
      await page.keyboard.press('Escape');
      await expect(create).toBeFocused();
      if (route !== 'tasks' && route !== 'events') continue;
      const filter = page.getByRole('button', { name: route === 'tasks' ? /^筛选任务/ : /^筛选日程/ });
      const filterBox = await filter.boundingBox();
      expect(Math.abs(filterBox!.y + filterBox!.height / 2 - heading!.y - heading!.height / 2)).toBeLessThan(2);
      expect(filterBox!.x).toBeGreaterThan(heading!.x);
      // Only the task status chips sit on the page; everything else waits in 筛选.
      await expect(page.getByRole('radio')).toHaveCount(route === 'tasks' ? 4 : 0);
      if (route === 'tasks') {
        await expect(page.getByRole('button', { name: /^任务：/ })).toHaveCount(1);
        await expect(page.getByRole('button', { name: '任务：待办样例', exact: true })).toBeVisible();
        await expect(page.getByRole('radio', { name: '筛选：待办', exact: true })).toHaveAttribute('aria-checked', 'true');
        await page.getByRole('radio', { name: '筛选：已完成', exact: true }).click();
        await expect(page.getByRole('button', { name: /^任务：/ })).toHaveCount(1);
        await expect(page.getByRole('button', { name: '任务：已完成样例', exact: true })).toBeVisible();
        await page.getByRole('radio', { name: '筛选：全部', exact: true }).click();
        await expect(page.getByRole('button', { name: /^任务：/ })).toHaveCount(3);
      }
      await filter.click();
      const dialog = page.getByRole('dialog', { name: route === 'tasks' ? '筛选任务' : '筛选日程', exact: true });
      const clear = dialog.getByRole('button', { name: '清除', exact: true });
      const done = dialog.getByRole('button', { name: '完成', exact: true });
      const clearBox = await clear.boundingBox(), doneBox = await done.boundingBox();
      expect(clearBox!.x + clearBox!.width).toBeLessThan(doneBox!.x);
      expect(Math.abs(clearBox!.y - doneBox!.y)).toBeLessThan(1);
      expect(Math.abs(doneBox!.width - clearBox!.width * 2)).toBeLessThan(2);
      await expect(clear).toBeInViewport();
      await expect(done).toBeInViewport();
      if (route === 'tasks') await dialog.getByRole('radio', { name: '优先级筛选：高', exact: true }).click();
      else await dialog.getByRole('radio', { name: '重复筛选：仅看重复', exact: true }).click();
      await page.screenshot({ path: testInfo.outputPath(`${route}-filters-${width}.png`) });
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await clear.click();
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('radio', { name: route === 'tasks' ? '优先级筛选：全部优先级' : '重复筛选：全部', exact: true })).toHaveAttribute('aria-checked', 'true');
      await done.click();
      await expect(filter).toBeFocused();
      if (route === 'tasks') await expect(page.getByRole('button', { name: /^任务：/ })).toHaveCount(3);
    }
  });
}
