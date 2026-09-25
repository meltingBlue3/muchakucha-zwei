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
  let labelAttempts = 0;
  let invitationAttempts = 0;
  const task = { id: taskId, householdId: a, title: '检查任务', status: 'pending', priority: 'medium', dueDate: null, description: null, assigneeIds: [], labels: [], createdBy: 'user', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), recurrenceRuleId: null, recurrence: null, occurrenceDate: null };
  await page.addInitScript((id) => localStorage.setItem('muchakucha:currentHouseholdId', id), b);
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    requests.push({ path, method, data: route.request().postData() });
    let body: unknown = {};
    let status = 200;
    if (path.endsWith('/auth/refresh')) body = { accessToken: 'mock-only' };
    else if (path.endsWith('/users/me')) body = { id: 'user', username: 'review', displayName: '检查用户', hasHousehold: true };
    else if (path === '/api/v1/households') body = [household(a), household(b)];
    else if (path.endsWith('/invitations/preview')) {
      invitationAttempts++;
      const token = new URL(route.request().url()).searchParams.get('token');
      if (token === 'retry' && invitationAttempts === 1) status = 503;
      body = token === 'invalid' ? { kind: 'invalid' } : { kind: 'valid', householdName: '家庭 A', inviterDisplayName: '家人', expiresAt: '2099-01-01T00:00:00Z' };
    } else if (/\/(tasks|events)\/.+\/labels$/.test(path) && method === 'POST') {
      labelAttempts++;
      status = labelAttempts === 1 ? 503 : 200;
    } else if (path.endsWith('/labels')) body = { labels: [{ id: 'label', name: '家务', color: '#277A72' }] };
    else if (path.endsWith('/tasks/' + taskId) && method === 'PUT') { status = 403; body = { error: { code: 'FORBIDDEN' } }; }
    else if (path.endsWith('/tasks')) body = method === 'POST' ? task : { tasks: [task] };
    else if (path.endsWith('/events')) body = method === 'POST' ? { id: taskId } : { events: [] };
    else if (path.endsWith('/notes')) body = method === 'POST' ? { id: taskId } : { notes: [] };
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
      { membershipId: 'member', userId: 'user', displayName: '小林', username: 'lin', email: '', role: 'OWNER', isCurrentUser: true },
      { membershipId: 'second', userId: 'second', displayName: '名字比较长的家庭成员', username: 'family_member', email: '', role: 'MEMBER', isCurrentUser: false },
    ];
    await page.route(`**/api/v1/households/${a}`, async (route) => {
      const name = route.request().method() === 'PATCH' ? route.request().postDataJSON().name : '家庭 A';
      await route.fulfill({ json: { ...household(a), name, members } });
    });
    await page.route(`**/api/v1/households/${a}/invitations`, async (route) => {
      await route.fulfill({ json: { invitations: [{ id: 'invite', username: 'another_family_member', emailCanonical: '', role: 'MEMBER', status: 'pending', createdAt: '2026-09-15T00:00:00Z', expiresAt: '2099-09-20T00:00:00Z' }] } });
    });
    await page.goto(`/households/${a}/settings`);
    await expect(page.getByRole('heading', { name: '基本信息', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '提升 名字比较长的家庭成员', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '撤销邀请 another_family_member', exact: true })).toBeVisible();
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
    await expect(page.getByRole('dialog', { name: '个人资料' })).toBeVisible();
    const appearance = await dialogAppearance(page);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '个人中心', exact: true }).click();
    await page.getByRole('menuitem', { name: '退出登录' }).click();
    await expect(page.getByRole('dialog', { name: '退出登录' })).toBeVisible();
    expect(await dialogAppearance(page)).toEqual(appearance);
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
    const revoke = page.getByRole('button', { name: '撤销邀请 another_family_member', exact: true });
    await revoke.click();
    await expect(page.getByRole('dialog', { name: '撤销邀请？' })).toBeVisible();
    expect(await dialogAppearance(page)).toEqual(appearance);
    await page.screenshot({ path: `test-results/settings-revoke-dialog-${width}.png` });
    await page.getByRole('button', { name: '保留邀请' }).click();
    expect(revokeAttempts).toBe(0);
    await expect(revoke).toBeFocused();
    await revoke.click();
    await page.getByRole('button', { name: '撤销邀请', exact: true }).click();
    await expect(page.getByText('撤销失败，家庭邀请状态未改变。请重试。')).toBeVisible();
    await page.getByRole('button', { name: '撤销邀请', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '撤销邀请？' })).toHaveCount(0);
    await expect(page.getByText('已撤销', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '邀请家人', exact: true })).toBeFocused();
    await expect(page).toHaveURL(new RegExp(`/households/${a}/settings$`));
  });
}

for (const width of [390, 1440]) {
  test(`household settings only offer rename and leave to the owner at ${width}px`, async ({ page }) => {
    await setup(page);
    await page.setViewportSize({ width, height: 900 });
    let ownerMembershipId = 'other';
    const members = [
      { membershipId: 'member', userId: 'user', displayName: '小林', username: 'lin', email: '', role: 'MEMBER', isCurrentUser: true },
      { membershipId: 'other', userId: 'other', displayName: '妈妈', username: 'mama', email: '', role: 'OWNER', isCurrentUser: false },
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
    await expect(page.getByRole('button', { name: '离开家庭' })).toHaveCount(0);

    ownerMembershipId = 'member';
    members[0]!.role = 'OWNER';
    members[1] = { ...members[1]!, role: 'MEMBER' };
    members.push({ membershipId: 'third', userId: 'third', displayName: '爸爸', username: 'papa', email: '', role: 'MEMBER', isCurrentUser: false });
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
    await expect(page).toHaveURL(new RegExp(`/households/${a}/ownership/leave\\?successorMembershipId=third`));
  });
}

test('family management is a restorable destination', async ({ page }) => {
  await setup(page);
  await page.goto(`/households/${a}/more`);
  await expect(page.getByRole('tab', { name: '家庭', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(new RegExp(`/households/${a}/more$`));
});

test('task filters and calendar month survive tab switches', async ({ page }) => {
  await setup(page);
  await page.goto(`/households/${a}/tasks`);
  await page.getByRole('button', { name: '筛选任务', exact: true }).click();
  await page.getByLabel('筛选：待办', { exact: true }).click();
  await page.getByRole('tab', { name: '日历', exact: true }).click();
  await page.getByLabel('下一个月').click();
  const nextMonth = await page.getByText(/^\d{4}年\s*\d{1,2}月$/).innerText();
  await page.getByRole('tab', { name: '任务', exact: true }).click();
  await expect(page.getByRole('button', { name: '筛选任务，已选择 1 项' })).toBeVisible();
  await page.getByRole('tab', { name: '日历', exact: true }).click();
  await expect(page.getByText(nextMonth, { exact: true })).toBeVisible();
});

for (const kind of ['tasks', 'events'] as const) {
  test(`${kind} creation retries labels without creating duplicates`, async ({ page }) => {
    const requests = await setup(page);
    await page.goto(`/households/${a}/${kind}`);
    await page.getByLabel(kind === 'tasks' ? '创建任务' : '创建事件', { exact: true }).click();
    await page.getByLabel(kind === 'tasks' ? '任务标题' : '事件标题', { exact: true }).fill('只创建一次');
    if (kind === 'tasks') {
      await expect(page.getByText('保存到：家庭 A', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: /当前家庭/ })).toHaveCount(0);
    }
    await page.getByLabel('选择标签 家务', { exact: true }).click();
    await page.getByLabel(kind === 'tasks' ? '创建任务' : '创建', { exact: true }).filter({ visible: true }).last().click();
    await expect(page.getByText('内容已创建，但标签未保存。重试只会保存标签，不会重复创建。')).toBeVisible();
    await page.getByRole('button', { name: '重试保存标签' }).click();
    await expect(page).toHaveURL(new RegExp(`/households/${a}/${kind}$`));
    expect(requests.filter((r) => r.method === 'POST' && r.path.endsWith('/' + kind))).toHaveLength(1);
    expect(requests.filter((r) => r.method === 'POST' && r.path.endsWith('/labels'))).toHaveLength(2);
  });
}

test('a note draft survives cancel and is cleared only after successful save', async ({ page }) => {
  await setup(page);
  await page.goto(`/households/${a}/notes`);
  await page.getByLabel('创建笔记', { exact: true }).click();
  await page.getByLabel('笔记标题').fill('还没写完');
  await page.getByLabel('笔记内容').fill('第一行内容');
  await page.getByLabel('取消', { exact: true }).click();
  await page.getByLabel('创建笔记', { exact: true }).click();
  await expect(page.getByLabel('笔记标题')).toHaveValue('还没写完');
  await expect(page.getByLabel('笔记内容')).toHaveValue('第一行内容');
  await page.getByLabel('创建', { exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/households/${a}/notes$`));
  await page.getByRole('main', { name: '家庭笔记', exact: true }).getByLabel('创建笔记', { exact: true }).click();
  await expect(page.getByLabel('笔记标题')).toHaveValue('');
});

test('invalid invitations can be replaced and temporary failures retried', async ({ page }) => {
  await setup(page);
  await page.goto('/invite');
  await page.getByLabel('邀请链接或邀请码').fill('invalid');
  await page.getByRole('button', { name: '查看邀请' }).click();
  await page.getByRole('button', { name: '重新输入邀请链接' }).click();
  await expect(page.getByLabel('邀请链接或邀请码')).toHaveValue('');
  await page.getByLabel('邀请链接或邀请码').fill('valid');
  await page.getByRole('button', { name: '查看邀请' }).click();
  await expect(page.getByRole('button', { name: '接受邀请', exact: true })).toBeVisible();
});

test('a failed invitation preview has a working retry action', async ({ page }) => {
  await setup(page);
  await page.goto('/invite');
  await page.getByLabel('邀请链接或邀请码').fill('retry');
  await page.getByRole('button', { name: '查看邀请' }).click();
  await page.getByRole('button', { name: '重试加载邀请' }).click();
  await expect(page.getByRole('button', { name: '接受邀请', exact: true })).toBeVisible();
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
        : path.endsWith('/notes') ? { notes: [{ ...common, id: 'note-preview', title: '这周想一起做的事', body: '周末试试新的番茄意面。\n买一束鲜花，给阳台的植物浇水。' }] }
        : { tasks: [{ ...common, id: taskId, title: '补充家里的水果、牛奶和周末早餐食材', status: 'pending', priority: 'medium', dueDate: null, description: '冰箱里还有鸡蛋，购物前先看一眼清单。', assigneeIds: [] }] };
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    });
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    for (const [route, title] of [['today', '今天'], ['events', '日历'], ['tasks', '任务'], ['notes', '笔记'], ['more', '家庭']]) {
      if (route === 'today') await page.goto(`/households/${a}/today`);
      else await page.getByRole('tab', { name: title, exact: true }).click();
      await expect(page.getByRole('heading', { name: route === 'today' ? /^\d{4}年\d{1,2}月\d{1,2}日 星期/ : title, exact: true })).toBeVisible();
      const navigation = page.getByRole('tablist', { name: '家庭主导航' });
      await expect(navigation.getByRole('tab')).toHaveCount(5);
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
