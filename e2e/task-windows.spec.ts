import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const householdId = '11111111-1111-4111-8111-111111111111';
const taskId = '33333333-3333-4333-8333-333333333333';
const base = `/households/${householdId}`;
async function setup(page: Page) {
  let task = { id: taskId, householdId, title: '准备周末的家庭聚餐，记得提前确认每个人的时间', description: '先确认人数，再采购食材。\n'.repeat(40), status: 'pending', priority: 'high', dueDate: '2026-10-02T00:00:00.000Z', assigneeIds: ['user'], labels: [], recurrenceRuleId: null, recurrence: null, occurrenceDate: null, createdBy: 'user', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' };
  let writes = 0;
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    let body: unknown = {};
    const household = { id: householdId, name: '周末的家', role: 'OWNER', memberCount: 1, ownerMembershipId: 'member' };
    if (path.endsWith('/auth/refresh')) body = { accessToken: 'mock-only' };
    else if (path.endsWith('/users/me')) body = { id: 'user', username: 'review', displayName: '小林', hasHousehold: true };
    else if (path === '/api/v1/households') body = [household];
    else if (path.endsWith('/' + householdId)) body = { ...household, members: [{ membershipId: 'member', userId: 'user', displayName: '小林', username: 'review', role: 'OWNER', isCurrentUser: true }] };
    else if (path.endsWith('/tasks/' + taskId)) {
      if (method === 'PUT') { task = { ...task, ...route.request().postDataJSON(), updatedAt: new Date().toISOString() }; writes++; }
      body = task;
    } else if (path.endsWith('/tasks')) {
      if (method === 'POST') { task = { ...task, ...route.request().postDataJSON() }; writes++; body = task; }
      else body = { tasks: [task] };
    } else if (path.endsWith('/labels')) body = { labels: [] };
    else if (path.endsWith('/events')) body = { events: [] };
    else if (path.endsWith('/invitations/inbox')) body = { invitations: [] };
    else throw new Error(`Unexpected API ${method} ${path}`);
    await route.fulfill({ json: body });
  });
  return { getTask: () => task, getWrites: () => writes };
}

for (const width of [320, 390, 1440]) {
  test(`task window keeps one dialog, edits and returns to its list at ${width}px`, async ({ page }, testInfo) => {
    const state = await setup(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}/tasks`);
    const item = page.getByRole('button', { name: /^任务：/ });
    await item.click();
    const detail = page.getByRole('dialog', { name: '任务详情', exact: true });
    await expect(detail).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(detail.getByRole('button', { name: '标记为完成', exact: true })).toBeInViewport();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    const panel = await detail.getByTestId('app-dialog-panel').boundingBox();
    expect(panel!.x).toBeGreaterThanOrEqual(0);
    expect(panel!.x + panel!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`task-detail-${width}.png`) });
    await detail.getByRole('button', { name: '编辑任务', exact: true }).click();
    const edit = page.getByRole('dialog', { name: '编辑任务', exact: true });
    await expect(edit).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await edit.getByRole('textbox', { name: '任务标题', exact: true }).fill('已修改的聚餐安排');
    await edit.getByRole('button', { name: '保存修改', exact: true }).click();
    await expect(detail).toBeVisible();
    await expect(detail.getByText('已修改的聚餐安排', { exact: true })).toBeVisible();
    expect(state.getTask().title).toBe('已修改的聚餐安排');
    await detail.getByRole('button', { name: '关闭任务详情' }).click();
    await expect(page).toHaveURL(`${base}/tasks`);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '任务：已修改的聚餐安排' })).toBeVisible();
  });
}

test('direct task window links survive reload and close to a safe destination', async ({ page }) => {
  await setup(page);
  await page.goto(`${base}/tasks/${taskId}`);
  await expect(page.getByRole('dialog', { name: '任务详情' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('dialog', { name: '任务详情' })).toBeVisible();
  await page.getByRole('button', { name: '关闭任务详情' }).click();
  await expect(page).toHaveURL(`${base}/tasks`);
  await page.goto(`${base}/tasks/new`);
  await page.getByRole('textbox', { name: '任务标题', exact: true }).fill('明天带伞');
  await page.getByRole('button', { name: '关闭创建任务' }).click();
  await expect(page).toHaveURL(`${base}/tasks`);
  await page.getByRole('button', { name: '创建任务', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '任务标题', exact: true })).toHaveValue('明天带伞');
});

test('closing a task opened from today restores the original entry', async ({ page }) => {
  await setup(page);
  await page.goto(`${base}/today`);
  await page.getByRole('button', { name: /查看后续安排/ }).click();
  const item = page.getByRole('button', { name: /^任务：/ });
  await item.click();
  await expect(page.getByRole('dialog', { name: '任务详情' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(`${base}/today`);
  await expect(item).toBeVisible();
  await expect(item).toBeFocused();
});

test('filter summaries remain visible after closing the filter window', async ({ page }, testInfo) => {
  await setup(page);
  await page.goto(`${base}/tasks`);
  await page.getByRole('button', { name: '筛选任务', exact: true }).click();
  const filter = page.getByRole('dialog', { name: '筛选任务', exact: true });
  await filter.getByRole('radio', { name: '优先级筛选：高', exact: true }).click();
  await filter.getByRole('radio', { name: '筛选：小林', exact: true }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await filter.getByRole('button', { name: '查看结果', exact: true }).click();
  await expect(page.getByText('高优先级 · 小林', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('task-list-390.png') });
  await page.getByRole('button', { name: '清除任务筛选', exact: true }).click();
  await expect(page.getByText('高优先级 · 小林', { exact: true })).toHaveCount(0);
});

test('a failed save retains the draft and busy windows resist closing', async ({ page }, testInfo) => {
  await setup(page);
  let release: (() => void) | undefined;
  await page.route(`**/api/v1/households/${householdId}/tasks/${taskId}`, async route => {
    if (route.request().method() !== 'PUT') return route.fallback();
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE' } } });
  });
  await page.goto(`${base}/tasks/${taskId}/edit`);
  const edit = page.getByRole('dialog', { name: '编辑任务', exact: true });
  await edit.getByRole('textbox', { name: '任务标题', exact: true }).fill('保留我的修改');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('task-edit-390.png') });
  await edit.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect.poll(() => release !== undefined).toBe(true);
  await expect(edit.getByRole('button', { name: '关闭编辑任务' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(edit).toBeVisible();
  release!();
  await expect(edit.getByText('保存失败，请重试。', { exact: true })).toBeVisible();
  await expect(edit.getByRole('textbox', { name: '任务标题', exact: true })).toHaveValue('保留我的修改');
  await edit.getByRole('button', { name: '关闭编辑任务' }).click();
  await expect(page.getByRole('dialog', { name: '任务详情' })).toBeVisible();
});

test('delete confirmation stays in one window and Escape returns to the draft', async ({ page }) => {
  await setup(page);
  await page.goto(`${base}/tasks/${taskId}/edit`);
  await page.getByRole('textbox', { name: '任务标题', exact: true }).fill('删除前的草稿');
  await page.getByRole('button', { name: '删除任务', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '删除任务', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '编辑任务', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '任务标题', exact: true })).toHaveValue('删除前的草稿');
});

test('browser history moves one window level at a time', async ({ page }) => {
  await setup(page);
  await page.goto(`${base}/tasks`);
  await page.getByRole('button', { name: /^任务：/ }).click();
  await page.getByRole('button', { name: '编辑任务', exact: true }).click();
  await page.goBack();
  await expect(page.getByRole('dialog', { name: '任务详情', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.goBack();
  await expect(page).toHaveURL(`${base}/tasks`);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goForward();
  await expect(page.getByRole('dialog', { name: '任务详情', exact: true })).toBeVisible();
});

test('closing a task preserves a long list scroll position', async ({ page }) => {
  const state = await setup(page);
  await page.route(`**/api/v1/households/${householdId}/tasks`, route => route.fulfill({ json: { tasks: [
    ...Array.from({ length: 30 }, (_, index) => ({ ...state.getTask(), id: `earlier-${index}`, title: `前面的任务 ${index}`, description: null })), state.getTask(),
  ] } }));
  await page.goto(`${base}/tasks`);
  const item = page.getByRole('button', { name: `任务：${state.getTask().title}`, exact: true });
  await item.scrollIntoViewIfNeeded();
  const scrollPosition = () => item.evaluate(element => {
    let ancestor = element.parentElement;
    while (ancestor && ancestor.scrollHeight <= ancestor.clientHeight) ancestor = ancestor.parentElement;
    return ancestor?.scrollTop ?? 0;
  });
  const before = await scrollPosition();
  expect(before).toBeGreaterThan(100);
  await item.click();
  await page.getByRole('button', { name: '关闭任务详情' }).click();
  await expect(item).toBeInViewport();
  await expect.poll(scrollPosition).toBe(before);
});

for (const width of [320, 390, 1440]) {
  test(`task options retain collapsed values and restore drafts at ${width}px`, async ({ page }, testInfo) => {
    const state = await setup(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}/tasks/new`);
    const dialog = page.getByRole('dialog', { name: '创建任务' });
    const more = dialog.getByRole('button', { name: '更多任务选项' });
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await expect(dialog.getByRole('textbox', { name: '任务描述' })).toBeHidden();
    await expect(dialog.getByRole('radiogroup', { name: '任务状态' })).toBeHidden();
    await expect(dialog.getByRole('button', { name: '任务重复设置' })).toHaveAttribute('aria-expanded', 'false');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`task-create-compact-${width}.png`) });
    await dialog.getByRole('textbox', { name: '任务标题', exact: true }).fill('整理旅行用品');
    await more.click();
    await dialog.getByRole('radio', { name: '优先级: 紧急', exact: true }).click();
    await dialog.getByRole('radio', { name: '进行中', exact: true }).click();
    await dialog.getByRole('textbox', { name: '任务描述' }).fill('带好证件和充电器');
    await more.click();
    await expect(dialog.getByText('进行中 · 紧急优先级 · 已填写描述', { exact: true })).toBeVisible();
    await page.reload();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    await expect(dialog.getByRole('textbox', { name: '任务描述' })).toHaveValue('带好证件和充电器');
    await expect(dialog.getByRole('radio', { name: '优先级: 紧急', exact: true })).toBeChecked();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`task-create-options-${width}.png`) });
    await more.click();
    await dialog.getByRole('button', { name: '创建任务', exact: true }).click();
    await expect(page).toHaveURL(`${base}/tasks`);
    expect(state.getWrites()).toBe(1);
    expect(state.getTask()).toMatchObject({ title: '整理旅行用品', description: '带好证件和充电器', status: 'in_progress', priority: 'urgent' });
  });
}

test('invalid collapsed task recurrence opens its error and blocks saving', async ({ page }) => {
  const state = await setup(page);
  await page.goto(`${base}/tasks/new`);
  await page.getByRole('textbox', { name: '任务标题', exact: true }).fill('重复打扫');
  const recurrence = page.getByRole('button', { name: '任务重复设置' });
  await recurrence.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('radio', { name: '每天', exact: true }).click();
  await page.getByRole('radio', { name: '重复次数', exact: true }).click();
  await page.getByRole('textbox', { name: '重复次数', exact: true }).fill('0');
  await recurrence.click();
  await page.getByRole('dialog', { name: '创建任务' }).getByRole('button', { name: '创建任务', exact: true }).click();
  await expect(recurrence).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('重复次数需要在 1 到 1000 之间。', { exact: true })).toBeVisible();
  expect(state.getWrites()).toBe(0);
  await page.getByRole('textbox', { name: '重复次数', exact: true }).fill('4');
  await page.reload();
  await expect(recurrence).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('textbox', { name: '重复次数', exact: true })).toHaveValue('4');
  await recurrence.click();
  await page.getByRole('dialog', { name: '创建任务' }).getByRole('button', { name: '创建任务', exact: true }).click();
  await expect(page).toHaveURL(`${base}/tasks`);
  expect(state.getTask()).toMatchObject({ recurrence: { freq: 'daily', count: 4 } });
});

test('editing keeps task status visible and explicitly clears collapsed optional values', async ({ page }) => {
  const state = await setup(page);
  await page.goto(`${base}/tasks/${taskId}/edit`);
  await expect(page.getByRole('radiogroup', { name: '任务状态' })).toBeVisible();
  const more = page.getByRole('button', { name: '更多任务选项' });
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('textbox', { name: '任务描述' }).fill('');
  await page.getByRole('radio', { name: '优先级: 中', exact: true }).click();
  await more.click();
  await page.getByRole('radio', { name: '进行中', exact: true }).click();
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '任务详情' })).toBeVisible();
  expect(state.getTask()).toMatchObject({ status: 'in_progress', priority: 'medium', description: '' });
});
