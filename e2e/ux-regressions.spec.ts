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
    else if (path.endsWith('/invitations/inbox')) {
      invitationAttempts++;
      if (invitationAttempts === 1) status = 503;
      body = { invitations: [{ id: 'invite', householdName: '家庭 A', inviterDisplayName: '家人', expiresAt: '2099-01-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z' }] };
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
  await expect(page.getByRole('tab', { name: '家庭', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(new RegExp(`/households/${a}/more$`));
});

test('task filters and calendar month survive tab switches', async ({ page }) => {
  await setup(page);
  await page.goto(`/households/${a}/tasks`);
  await page.getByRole('button', { name: /^筛选任务/ }).click();
  await page.getByRole('radio', { name: '筛选：进行中', exact: true }).click();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await page.getByRole('tab', { name: '日历', exact: true }).click();
  await page.getByLabel('下一个月').click();
  const nextMonth = await page.getByText(/^\d{4}年\s*\d{1,2}月$/).innerText();
  await page.getByRole('tab', { name: '任务', exact: true }).click();
  await expect(page.getByRole('button', { name: '筛选任务，已选择 1 项' })).toBeVisible();
  await expect(page.getByText('进行中', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '日历', exact: true }).click();
  await expect(page.getByText(nextMonth, { exact: true })).toBeVisible();
});

for (const kind of ['tasks', 'events'] as const) {
  test(`${kind} creation retries labels without creating duplicates`, async ({ page }) => {
    const requests = await setup(page);
    await page.goto(`/households/${a}/${kind}`);
    await page.getByLabel(kind === 'tasks' ? '创建任务' : '创建日程', { exact: true }).click();
    await page.getByLabel(kind === 'tasks' ? '任务标题' : '日程标题', { exact: true }).fill('只创建一次');
    await expect(page.getByText('保存到：家庭 A', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /当前家庭/ })).toHaveCount(0);
    await page.getByLabel('选择标签 家务', { exact: true }).click();
    await page.getByLabel('创建', { exact: true }).filter({ visible: true }).last().click();
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
  await page.getByRole('button', { name: '关闭创建笔记', exact: true }).click();
  await page.getByLabel('创建笔记', { exact: true }).click();
  await expect(page.getByLabel('笔记标题')).toHaveValue('还没写完');
  await expect(page.getByLabel('笔记内容')).toHaveValue('第一行内容');
  await page.getByLabel('创建', { exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/households/${a}/notes$`));
  await page.getByRole('main', { name: '家庭笔记', exact: true }).getByLabel('创建笔记', { exact: true }).click();
  await expect(page.getByLabel('笔记标题')).toHaveValue('');
});

test('a failed inbox has a working retry action', async ({ page }) => {
  await setup(page);
  await page.goto('/inbox');
  await expect(page.getByText('暂时无法加载收件箱，请检查网络后重试。')).toBeVisible();
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
        : path.endsWith('/notes') ? { notes: [{ ...common, id: 'note-preview', title: '这周想一起做的事', body: '周末试试新的番茄意面。\n买一束鲜花，给阳台的植物浇水。' }] }
        : { tasks: [{ ...common, id: taskId, title: '补充家里的水果、牛奶和周末早餐食材', status: 'pending', priority: 'medium', dueDate: null, description: '冰箱里还有鸡蛋，购物前先看一眼清单。', assigneeIds: [] }] };
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    });
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    for (const [route, title] of [['today', '今日'], ['events', '日历'], ['tasks', '任务'], ['notes', '笔记'], ['more', '家庭']]) {
      if (route === 'today') await page.goto(`/households/${a}/today`);
      else await page.getByRole('tab', { name: title, exact: true }).click();
      await expect(page.getByRole('heading', { name: title, exact: true, level: 1 })).toBeVisible();
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

for (const width of [320, 390, 1440]) {
  test(`Markdown note editor preserves source and fits ${width}px`, async ({ page }) => {
    const requests = await setup(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/households/${a}/notes/new`);
    const dialog = page.getByRole('dialog', { name: '创建笔记', exact: true });
    await dialog.getByLabel('笔记标题').fill('日语学习');
    const input = dialog.getByLabel('笔记内容');
    const previewButton = dialog.getByRole('button', { name: '预览', exact: true });
    const closeButton = dialog.getByRole('button', { name: '关闭创建笔记', exact: true });
    const previewBox = await previewButton.boundingBox();
    const closeBox = await closeButton.boundingBox();
    expect(Math.abs(previewBox!.y - closeBox!.y)).toBeLessThan(2);
    // Compact editors are full-screen sheets: close leads the header, actions trail it.
    if (width < 600) {
      const submitBox = await dialog.getByRole('button', { name: '创建', exact: true }).boundingBox();
      expect(closeBox!.x + closeBox!.width).toBeLessThanOrEqual(previewBox!.x);
      expect(previewBox!.x + previewBox!.width).toBeLessThanOrEqual(submitBox!.x);
      expect(submitBox!.x + submitBox!.width).toBeLessThanOrEqual(width);
    } else {
      expect(previewBox!.x + previewBox!.width).toBeLessThanOrEqual(closeBox!.x);
    }
    await expect(previewButton).toHaveText('');

    await input.fill('日语学习');
    await input.selectText();
    await dialog.getByRole('button', { name: '粗体', exact: true }).click();
    await expect(input).toHaveValue('**日语学习**');
    await dialog.getByRole('button', { name: '标题格式' }).click();
    const headings = page.getByRole('dialog', { name: '标题格式', exact: true });
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(headings.getByRole('button', { name: 'H6', exact: true })).toBeVisible();
    await headings.getByRole('button', { name: 'H2', exact: true }).click();
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('## **日语学习**');
    await input.press('End');
    await input.press('Enter');
    await dialog.getByRole('button', { name: '链接', exact: true }).click();
    const linkWindow = page.getByRole('dialog', { name: '插入链接', exact: true });
    await expect(input).not.toBeVisible();
    await linkWindow.getByLabel('显示文字', { exact: true }).fill('学习资料');
    await linkWindow.getByLabel('网址', { exact: true }).fill('https://example.com');
    expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual([]);
    await page.screenshot({ path: `/tmp/muchakucha-markdown-link-window-${width}.png` });
    await linkWindow.getByRole('button', { name: '插入链接', exact: true }).click();
    await expect(input).toBeFocused();
    await expect(input).toHaveValue(/学习资料/);
    await dialog.getByRole('button', { name: '表格', exact: true }).click();
    const tableWindow = page.getByRole('dialog', { name: '插入表格', exact: true });
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await tableWindow.getByRole('button', { name: '插入表格', exact: true }).click();
    const source = await input.inputValue();
    await dialog.getByRole('button', { name: '预览', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: '日语学习', level: 2 })).toBeVisible();
    await expect(dialog.getByRole('link', { name: '学习资料' })).toBeVisible();
    await expect(dialog.getByRole('columnheader')).toHaveCount(2);
    const panel = dialog.getByTestId('app-dialog-panel');
    expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual([]);
    await page.screenshot({ path: `/tmp/muchakucha-markdown-preview-${width}.png` });
    await dialog.getByRole('button', { name: '编辑', exact: true }).click();
    await expect(input).toHaveValue(source);
    const toolbar = dialog.getByRole('toolbar', { name: '笔记格式' });
    await expect(toolbar).toBeVisible();
    expect(await toolbar.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/muchakucha-markdown-editor-${width}.png` });
    await dialog.getByRole('button', { name: '创建', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/households/${a}/notes$`));
    const saved = requests.find(request => request.method === 'POST' && request.path.endsWith('/notes'));
    expect(JSON.parse(saved!.data as string).body).toBe(source);
  });
}

test('note format windows close back to editing without losing the selection or draft', async ({ page }) => {
  await setup(page);
  const note = { id: taskId, householdId: a, title: '日语学习', body: '词语练习', createdBy: 'user', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' };
  await page.route(`**/api/v1/households/${a}/notes/${taskId}`, route => route.fulfill({ json: note }));
  await page.goto(`/households/${a}/notes/${taskId}/edit`);
  const editor = page.getByRole('dialog', { name: '编辑笔记', exact: true });
  const input = editor.getByLabel('笔记内容');
  await expect(input).toHaveValue('词语练习');
  await input.selectText();
  await editor.getByRole('button', { name: '链接', exact: true }).click();
  const link = page.getByRole('dialog', { name: '插入链接', exact: true });
  await expect(link.getByLabel('显示文字')).toHaveValue('词语练习');
  await link.getByLabel('网址', { exact: true }).fill('https://example.com');
  await link.getByRole('button', { name: '关闭插入链接', exact: true }).click();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('词语练习');
  await editor.getByRole('button', { name: '粗体', exact: true }).click();
  await expect(input).toHaveValue('**词语练习**');
  await editor.getByRole('button', { name: '表格', exact: true }).click();
  const table = page.getByRole('dialog', { name: '插入表格', exact: true });
  await table.getByRole('button', { name: '关闭插入表格' }).click();
  await expect(input).toHaveValue('**词语练习**');
  await editor.getByRole('button', { name: '标题格式' }).click();
  const headings = page.getByRole('dialog', { name: '标题格式', exact: true });
  await expect(headings).toBeVisible();
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual([]);
  await page.screenshot({ path: '/tmp/muchakucha-markdown-heading-window.png' });
  await page.keyboard.press('Escape');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('**词语练习**');
  await expect(editor.getByRole('button', { name: '丢弃草稿' })).toHaveCount(0);
  await editor.getByRole('button', { name: '预览', exact: true }).click();
  await expect(editor.getByTestId('markdown-body')).toHaveText('词语练习');
  await editor.getByRole('button', { name: '编辑', exact: true }).click();
  await expect(input).toHaveValue('**词语练习**');
  await expect(page).toHaveURL(new RegExp(`/notes/${taskId}/edit$`));
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
      const heading = await page.getByRole('heading', { name: title, exact: true }).boundingBox();
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
      await expect(page.getByRole('dialog', { name: route === 'today' ? '创建任务' : createLabel, exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(create).toBeFocused();
      if (route !== 'tasks' && route !== 'events') continue;
      const filter = page.getByRole('button', { name: route === 'tasks' ? /^筛选任务/ : /^筛选日程/ });
      const filterBox = await filter.boundingBox();
      expect(Math.abs(filterBox!.y + filterBox!.height / 2 - heading!.y - heading!.height / 2)).toBeLessThan(2);
      expect(filterBox!.x).toBeGreaterThan(heading!.x);
      await expect(page.getByRole('radio')).toHaveCount(0);
      if (route === 'tasks') {
        await expect(page.getByRole('button', { name: /^任务：/ })).toHaveCount(1);
        await expect(page.getByRole('button', { name: '任务：待办样例', exact: true })).toBeVisible();
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
      if (route === 'tasks') {
        await expect(dialog.getByRole('radio', { name: '筛选：待办', exact: true })).toHaveAttribute('aria-checked', 'true');
        await dialog.getByRole('radio', { name: '筛选：已完成', exact: true }).click();
        await done.click();
        await expect(page.getByRole('button', { name: /^任务：/ })).toHaveCount(1);
        await expect(page.getByRole('button', { name: '任务：已完成样例', exact: true })).toBeVisible();
        await filter.click();
      } else await dialog.getByRole('radio', { name: '重复筛选：仅看重复', exact: true }).click();
      await page.screenshot({ path: testInfo.outputPath(`${route}-filters-${width}.png`) });
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await clear.click();
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('radio', { name: route === 'tasks' ? '筛选：全部' : '重复筛选：全部', exact: true })).toHaveAttribute('aria-checked', 'true');
      await done.click();
      await expect(filter).toBeFocused();
      if (route === 'tasks') await expect(page.getByRole('button', { name: /^任务：/ })).toHaveCount(3);
    }
  });
}
