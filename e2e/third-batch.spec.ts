import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const householdId = '11111111-1111-4111-8111-111111111111';
const noteId = '33333333-3333-4333-8333-333333333333';
const base = `/households/${householdId}`;
async function setup(page: Page, role = 'OWNER') {
  let note = { id: noteId, householdId, title: '暑假计划：和家人一起安排一个轻松的假期', body: '先商量每个人想去的地方。\n'.repeat(45), createdBy: 'user', createdAt: '2030-06-01T00:00:00Z', updatedAt: '2030-06-01T00:00:00Z' };
  let labels = [{ id: 'label', name: '家务', color: '#277A72' }];
  let failLabels = false;
  await page.clock.setFixedTime(new Date('2030-06-15T04:00:00Z'));
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const household = { id: householdId, name: '周末的家', role, memberCount: 1, ownerMembershipId: 'member' };
    let body: unknown = {};
    if (path.endsWith('/auth/refresh')) body = { accessToken: 'mock-only' };
    else if (path.endsWith('/users/me')) body = { id: 'user', username: 'review', displayName: '小林', hasHousehold: true };
    else if (path === '/api/v1/households') body = [household];
    else if (path.endsWith('/' + householdId)) body = { ...household, members: [{ membershipId: 'member', userId: 'user', displayName: '小林', role, isCurrentUser: true }] };
    else if (path.endsWith('/notes')) body = { notes: [note], total: 1 };
    else if (path.endsWith('/notes/' + noteId)) {
      if (method === 'PUT') note = { ...note, ...route.request().postDataJSON() };
      body = note;
    } else if (path.includes('/labels')) {
      if (method !== 'GET' && failLabels) { await route.fulfill({ status: 500, json: { error: { code: 'server_error' } } }); return; }
      if (method === 'POST') { const created = { id: 'new-label', ...route.request().postDataJSON() }; labels.push(created); body = created; }
      else if (method === 'PUT') { const updated = { id: 'label', ...route.request().postDataJSON() }; labels = labels.map(label => label.id === updated.id ? updated : label); body = updated; }
      else if (method === 'DELETE') { labels = labels.filter(label => !path.endsWith('/' + label.id)); }
      else body = { labels };
    } else if (path.endsWith('/tasks')) body = { tasks: Array.from({ length: 10 }, (_, index) => ({ id: `task-${index}`, householdId, title: `${index < 5 ? '逾期' : '待安排'}任务 ${index}`, status: 'pending', priority: 'medium', dueDate: index < 5 ? '2030-06-10T04:00:00Z' : null, assigneeIds: [], labels: [], recurrence: null, recurrenceRuleId: null, createdBy: 'user', updatedAt: '2030-06-01T00:00:00Z' })) };
    else if (path.endsWith('/events')) body = { events: [] };
    else if (path.endsWith('/invitations/inbox')) body = { invitations: [] };
    else throw new Error(`Unexpected API ${method} ${path}`);
    await route.fulfill({ json: body });
  });
  return { failLabels: (fail: boolean) => { failLabels = fail; } };
}

for (const width of [320, 390, 1440]) {
  test(`notes, labels and family fit ${width}px with one window and accessible actions`, async ({ page }, testInfo) => {
    await setup(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}/notes`);
    await page.getByLabel('搜索笔记', { exact: true }).fill('暑假');
    await page.getByRole('button', { name: /^笔记：/ }).click();
    const detail = page.getByRole('dialog', { name: '笔记详情', exact: true });
    await expect(detail.getByRole('button', { name: '编辑笔记' })).toBeInViewport();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`note-detail-${width}.png`) });
    await page.getByRole('button', { name: '编辑笔记', exact: true }).click();
    await page.getByLabel('笔记标题', { exact: true }).fill('暑假改好的计划');
    await expect(page.getByRole('button', { name: '丢弃草稿', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '编辑笔记', exact: true }).click();
    await expect(page.getByLabel('笔记标题', { exact: true })).toHaveValue('暑假改好的计划');
    await page.getByLabel('笔记内容', { exact: true }).fill('');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(detail.getByText('这篇笔记还没有内容。')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByLabel('搜索笔记', { exact: true })).toHaveValue('暑假');
    await expect(page.getByRole('button', { name: '笔记：暑假改好的计划', exact: true })).toBeVisible();
    await page.goto(`${base}/more`);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`family-${width}.png`) });
    await page.getByRole('button', { name: '管理标签', exact: true }).click();
    await page.getByRole('button', { name: '创建标签', exact: true }).click();
    const create = page.getByRole('dialog', { name: '创建标签', exact: true });
    await create.getByLabel('标签名称', { exact: true }).fill('旅行');
    const colors = create.getByRole('radio');
    for (const color of await colors.all()) {
      const box = await color.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(48);
      expect(box!.height).toBeGreaterThanOrEqual(48);
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`label-create-${width}.png`) });
    await create.getByRole('button', { name: '创建', exact: true }).click();
    await expect(page.getByLabel('标签：旅行', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.goto(`${base}/today`);
    await expect(page.getByRole('button', { name: /^任务：/ })).toHaveCount(6);
    await page.getByRole('button', { name: '查看全部逾期任务（5）' }).click();
    await page.getByRole('button', { name: '查看全部待安排（5）' }).click();
    await expect(page.getByRole('button', { name: /^任务：/ })).toHaveCount(10);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`today-${width}.png`) });
  });
}

test('direct note edits restore drafts and closing returns to detail without stacked dialogs', async ({ page }) => {
  await setup(page);
  await page.goto(`${base}/notes/${noteId}/edit`);
  await page.getByLabel('笔记标题', { exact: true }).fill('保存到设备的草稿');
  await page.reload();
  await expect(page.getByLabel('笔记标题', { exact: true })).toHaveValue('保存到设备的草稿');
  await expect(page.getByRole('button', { name: '丢弃草稿', exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.getByRole('button', { name: '关闭编辑笔记', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '笔记详情', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(`${base}/notes`);
});

test('label save and delete failures retain the form and offer retry', async ({ page }) => {
  const state = await setup(page);
  await page.goto(`${base}/labels`);
  await page.getByRole('button', { name: '编辑标签 家务', exact: true }).click();
  await page.getByLabel('编辑标签名称', { exact: true }).fill('清洁');
  state.failLabels(true);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('保存失败');
  await expect(page.getByLabel('编辑标签名称')).toHaveValue('清洁');
  state.failLabels(false);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('button', { name: '更多操作：标签 清洁', exact: true }).click();
  await page.getByRole('menuitem', { name: '删除标签 清洁', exact: true }).click();
  state.failLabels(true);
  await page.getByRole('button', { name: '确认删除标签 清洁', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('删除失败');
  state.failLabels(false);
  await page.getByRole('button', { name: '确认删除标签 清洁', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('标签：清洁')).toHaveCount(0);
});

test('ordinary members can browse labels without mutation controls', async ({ page }) => {
  await setup(page, 'MEMBER');
  await page.goto(`${base}/labels`);
  await expect(page.getByLabel('标签：家务')).toBeVisible();
  await expect(page.getByRole('button', { name: /创建标签|编辑标签|删除标签/ })).toHaveCount(0);
});

test('a completed preview task keeps its undo action even if the server reorders it', async ({ page }) => {
  await setup(page);
  let tasks = Array.from({ length: 5 }, (_, index) => ({ id: `preview-${index}`, householdId, title: `预览任务 ${index}`, status: 'pending', priority: 'medium', dueDate: null, assigneeIds: [], labels: [], recurrence: null, recurrenceRuleId: null, createdBy: 'user', updatedAt: '2030-06-01T00:00:00Z' }));
  await page.route(`**/api/v1/households/${householdId}/tasks`, route => route.fulfill({ json: { tasks } }));
  await page.route(`**/api/v1/households/${householdId}/tasks/preview-0`, async route => {
    const task = { ...tasks.find(task => task.id === 'preview-0')!, ...route.request().postDataJSON() };
    tasks = [...tasks.filter(existing => existing.id !== task.id), task];
    await route.fulfill({ json: task });
  });
  await page.goto(`${base}/today`);
  await expect(page.getByRole('button', { name: /^任务：/ })).toHaveCount(3);
  await page.getByRole('button', { name: '完成任务', exact: true }).first().click();
  await expect(page.getByRole('button', { name: '撤销完成：预览任务 0' })).toBeVisible();
  await page.getByRole('button', { name: '撤销完成：预览任务 0' }).click();
  expect(tasks.find(task => task.id === 'preview-0')?.status).toBe('pending');
});

for (const role of ['OWNER', 'ADMIN', 'MEMBER']) {
  test(`${role} uses the note card menu and failed deletion remains retryable`, async ({ page }) => {
    await setup(page, role);
    let deleted = false;
    let fail = true;
    const note = { id: noteId, householdId, title: '待删除笔记', body: null, createdBy: 'user', createdAt: '2030-06-01T00:00:00Z', updatedAt: '2030-06-01T00:00:00Z' };
    await page.route(`**/api/v1/households/${householdId}/notes`, route => route.fulfill({ json: { notes: deleted ? [] : [note], total: deleted ? 0 : 1 } }));
    await page.route(`**/api/v1/households/${householdId}/notes/${noteId}`, async route => {
      if (route.request().method() === 'DELETE') {
        if (fail) { await route.fulfill({ status: 500, json: { error: { code: 'server_error' } } }); return; }
        deleted = true;
      }
      await route.fulfill({ json: note });
    });
    await page.goto(`${base}/notes`);
    const more = page.getByRole('button', { name: '更多操作：笔记：待删除笔记', exact: true });
    await expect(page.getByRole('menuitem')).toHaveCount(0);
    const card = await page.getByRole('button', { name: '笔记：待删除笔记', exact: true }).boundingBox();
    const action = await more.boundingBox();
    expect(action!.x).toBeGreaterThan(card!.x);
    expect(Math.abs(action!.y - card!.y)).toBeLessThan(10);
    await more.click();
    await page.getByRole('menuitem', { name: '删除笔记：待删除笔记', exact: true }).click();
    await expect(page).toHaveURL(`${base}/notes/${noteId}/delete`);
    await page.reload();
    await expect(page.getByRole('dialog', { name: '删除笔记', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '确认删除笔记', exact: true }).click();
    await expect(page.getByText('删除失败，请检查网络后重试。')).toBeVisible();
    expect(deleted).toBe(false);
    fail = false;
    await page.getByRole('button', { name: '确认删除笔记', exact: true }).click();
    await expect(page).toHaveURL(`${base}/notes`);
    await expect(more).toHaveCount(0);
    expect(deleted).toBe(true);
  });
}

test('member cannot delete another author note through the card or direct URL', async ({ page }) => {
  await setup(page, 'MEMBER');
  const note = { id: noteId, householdId, title: '其他成员的笔记', body: null, createdBy: 'other-user', createdAt: '2030-06-01T00:00:00Z', updatedAt: '2030-06-01T00:00:00Z' };
  let writes = 0;
  await page.route(`**/api/v1/households/${householdId}/notes`, route => route.fulfill({ json: { notes: [note], total: 1 } }));
  await page.route(`**/api/v1/households/${householdId}/notes/${noteId}`, route => {
    if (route.request().method() !== 'GET') writes++;
    return route.fulfill({ json: note });
  });
  await page.goto(`${base}/notes`);
  await expect(page.getByRole('button', { name: '笔记：其他成员的笔记', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^更多操作：笔记：/ })).toHaveCount(0);
  await page.goto(`${base}/notes/${noteId}/delete`);
  await expect(page.getByText('你没有删除这条笔记的权限。')).toBeVisible();
  await expect(page.getByRole('button', { name: '确认删除笔记', exact: true })).toHaveCount(0);
  expect(writes).toBe(0);
});
