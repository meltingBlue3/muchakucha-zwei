import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const householdId = '11111111-1111-4111-8111-111111111111';
const base = `/households/${householdId}`;
const taskId = (index: number) => `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`;
const conversationId = '66666666-6666-4666-8666-666666666666';
const version = '2026-11-10T02:00:00Z';
async function setup(page: Page) {
  const labels = [{ id: 'school', name: '学校', color: '#3B7DD8', createdBy: 'user' }, { id: 'home', name: '家务', color: '#4C7537', createdBy: 'user' }];
  const tasks = Array.from({ length: 28 }, (_, index) => ({ id: taskId(index), householdId, title: ['交物业费', '检查朵朵的数学作业', '预约年度体检', '整理冬季衣物'][index % 4] + ` ${index + 1}`, description: '第三单元练习册，重点看应用题。', status: 'pending', priority: index === 0 ? 'high' : 'medium', dueDate: index === 0 ? '2026-11-08T10:00:00Z' : index === 1 ? '2026-11-10T12:00:00Z' : null, assigneeIds: ['user'], labels: [labels[index % 2]], createdBy: 'user', createdAt: version, updatedAt: version, recurrenceRuleId: null, recurrence: null }));
  const notes = [{ id: 'note-1', householdId, title: '家庭旅行计划', body: '# 周末去郊外\n\n一起准备野餐垫、水和水果。\n\n## 路线\n\n- 周六上午出发\n- 沿湖走一走', createdBy: 'user', createdAt: version, updatedAt: version }, { id: 'note-2', householdId, title: '家电使用说明', body: '洗碗机使用注意事项。', createdBy: 'user', createdAt: version, updatedAt: '2026-10-20T02:00:00Z' }];
  const events = [{ id: 'event-1', householdId, title: '全家旅行', startTime: '2026-11-09T00:00:00+08:00', endTime: '2026-11-12T00:00:00+08:00', allDay: true, labels: [labels[1]], location: '郊外', description: '一起休息几天', createdBy: 'user', createdAt: version, updatedAt: version, recurrenceRuleId: null, recurrence: null }, { id: 'event-2', householdId, title: '朵朵家长会', startTime: '2026-11-10T10:00:00+08:00', endTime: '2026-11-10T11:30:00+08:00', allDay: false, labels: [labels[0]], location: '学校', description: '和老师聊聊最近的学习。', createdBy: 'user', createdAt: version, updatedAt: version, recurrenceRuleId: null, recurrence: null }];
  const household = { id: householdId, name: '林家小院', role: 'OWNER', memberCount: 2, ownerMembershipId: 'member' };
  const members = [{ membershipId: 'member', userId: 'user', displayName: '小林', username: 'xiaolin', role: 'OWNER', isCurrentUser: true }, { membershipId: 'member-2', userId: 'user-2', displayName: '妈妈', username: 'mama', role: 'MEMBER', isCurrentUser: false }];
  const provider = { id: 'provider', name: '我的日常助手', protocol: 'openai-compatible', baseUrl: 'https://example.com/v1', model: 'family-model', visibility: 'private', ownedByMe: true, hasCredential: true, updatedAt: version };
  const conversation = { id: conversationId, title: '周末准备清单', providerId: provider.id, updatedAt: version, version: 1, state: 'idle', messages: [{ role: 'user', content: '周末要准备什么？' }, { role: 'assistant', content: '先确认家人都有空，再一起准备野餐的物品。' }], pendingActions: [] };
  await page.clock.setFixedTime(new Date(version));
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    let body: unknown;
    if (path.endsWith('/auth/refresh')) body = { accessToken: 'ui-only' };
    else if (path.endsWith('/users/me')) body = { id: 'user', username: 'xiaolin', displayName: '小林', hasHousehold: true };
    else if (path.endsWith('/reminder-settings')) body = { taskMinutesBefore: 0, eventMinutesBefore: 15, dateOnlyTime: '09:00', alarm: false, households: [] };
    else if (path.endsWith('/invitations/inbox') || path.endsWith('/invitations')) body = { invitations: [] };
    else if (path === '/api/v1/households') body = [household, { ...household, id: 'other', name: '父母的家' }];
    else if (path.endsWith(`/${householdId}`)) body = { ...household, members };
    else if (path.endsWith('/tasks')) body = { tasks };
    else if (path.includes('/tasks/')) {
      const task = tasks.find(item => path.endsWith(`/${item.id}`));
      if (task && method === 'PUT') Object.assign(task, route.request().postDataJSON());
      body = task;
    } else if (path.endsWith('/events')) body = { events };
    else if (path.includes('/events/')) body = events.find(item => path.endsWith(`/${item.id}`));
    else if (path.endsWith('/notes')) body = { notes };
    else if (path.includes('/notes/')) body = notes.find(item => path.endsWith(`/${item.id}`));
    else if (path.endsWith('/labels')) body = { labels };
    else if (path.endsWith('/recurrence-rules')) body = { rules: [] };
    else if (path.endsWith('/assistant/providers')) body = { providers: [provider] };
    else if (path.endsWith('/assistant/conversations')) body = { conversations: [conversation] };
    else if (path.endsWith(`/assistant/conversations/${conversationId}`)) body = conversation;
    else throw new Error(`Missing desktop fixture: ${method} ${path}`);
    await route.fulfill({ json: body });
  });
}

for (const width of [1024, 1280, 1440, 1920]) {
  test(`desktop shell and page templates use the workspace at ${width}px`, async ({ page }, testInfo) => {
    await setup(page);
    await page.setViewportSize({ width, height: 900 });
    const sidebarWidth = width < 1280 ? 64 : 248;
    for (const destination of ['today', 'events', 'tasks', 'notes', `assistant/conversations/${conversationId}`, 'settings', 'labels', 'recurrence-rules', '/profile', '/reminders', '/inbox']) {
      await page.goto(destination.startsWith('/') ? destination : `${base}/${destination}`);
      const header = page.getByTestId('desktop-page-header');
      await expect(header.last()).toBeVisible();
      await expect(page.getByRole('progressbar')).toHaveCount(0);
      const box = (await header.boundingBox())!;
      expect(box.height).toBe(56);
      expect(box.x).toBe(sidebarWidth + 1);
      expect(box.x + box.width).toBe(width - 9);
      const sidebar = (await page.getByTestId('global-sidebar').boundingBox())!;
      expect(sidebar.width).toBe(sidebarWidth);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`${destination.replaceAll('/', '-')}-${width}.png`) });
      if (destination === 'events') {
        const grid = (await page.getByTestId('desktop-month-grid').boundingBox())!;
        expect(grid.y + grid.height).toBe(891);
        const span = page.getByTestId('calendar-span');
        await expect(span).toHaveCount(1);
        expect((await span.boundingBox())!.width).toBeCloseTo(grid.width * 3 / 7, 0);
      }
      if (destination === `assistant/conversations/${conversationId}`) {
        await expect(page.getByTestId('assistant-history')).toBeVisible();
        await expect(page.getByTestId('global-sidebar').getByRole('button', { name: /^打开对话/ })).toHaveCount(0);
      }
    }
  });

  test(`desktop panes switch items, retain drafts and release focus at ${width}px`, async ({ page }, testInfo) => {
    await setup(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}/tasks`);
    const first = page.getByRole('button', { name: '任务：交物业费 1', exact: true });
    const second = page.getByRole('button', { name: '任务：检查朵朵的数学作业 2', exact: true });
    await first.click();
    const detail = page.getByRole('region', { name: '任务详情', exact: true });
    await expect(detail).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(first).toBeFocused();
    const panel = (await detail.getByTestId('app-dialog-panel').boundingBox())!;
    expect(panel.width).toBe(width < 1280 ? 360 : width >= 1600 ? 520 : 400);
    const row = (await first.boundingBox())!;
    expect(row.x + row.width).toBeLessThan(panel.x);
    await second.click();
    await expect(detail.getByRole('heading', { name: '检查朵朵的数学作业 2', exact: true })).toBeVisible();
    await detail.getByRole('button', { name: '编辑任务', exact: true }).click();
    const edit = page.getByRole('region', { name: '编辑任务', exact: true });
    await edit.getByRole('textbox', { name: '任务标题', exact: true }).fill('待保存的家庭安排');
    await first.click();
    const confirmation = page.getByRole('region', { name: '切换条目？', exact: true });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: '继续编辑', exact: true }).click();
    await expect(edit.getByRole('textbox', { name: '任务标题', exact: true })).toHaveValue('待保存的家庭安排');
    await first.click();
    await confirmation.getByRole('button', { name: '保留草稿并切换', exact: true }).click();
    await expect(detail.getByRole('heading', { name: '交物业费 1', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`task-pane-${width}.png`) });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await detail.getByRole('button', { name: '关闭任务详情' }).click();
    await expect(page).toHaveURL(`${base}/tasks`);
    // The original list is retained while the edited route is replaced.
    await expect(first).toBeVisible();
    await first.focus();
    await page.keyboard.press('Enter');
    await expect(detail.getByRole('heading', { name: '任务详情', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(first).toBeFocused();
    await page.reload();
    await expect(first).toBeVisible();
    await page.goto(`${base}/tasks/${taskId(1)}/edit`);
    await expect(edit.getByRole('textbox', { name: '任务标题', exact: true })).toHaveValue('待保存的家庭安排');
  });
}

test('desktop family switching is anchored and date controls fit their popover', async ({ page }, testInfo) => {
  await setup(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}/tasks`);
  const trigger = page.getByRole('button', { name: '当前家庭：林家小院，切换家庭' });
  await trigger.click();
  const switcher = page.getByRole('dialog', { name: '切换家庭', exact: true });
  await expect(switcher.getByRole('button', { name: /父母的家/ })).toBeVisible();
  await expect(switcher.getByRole('button', { name: '家庭设置', exact: true })).toHaveCount(0);
  const anchor = (await trigger.boundingBox())!;
  const box = (await switcher.boundingBox())!;
  expect(box.width).toBe(300);
  expect(box.y).toBe(anchor.y + anchor.height + 8);
  await page.screenshot({ path: testInfo.outputPath('family-switcher-1440.png') });
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await page.getByRole('button', { name: '创建任务', exact: true }).click();
  const editor = page.getByRole('region', { name: '创建任务', exact: true });
  await editor.getByRole('button', { name: /^截止日期，/ }).click();
  const picker = page.getByRole('dialog', { name: '选择日期', exact: true });
  await expect(picker).toBeVisible();
  const pickerBox = (await picker.boundingBox())!;
  for (const button of await picker.getByRole('button').all()) {
    const buttonBox = (await button.boundingBox())!;
    expect(buttonBox.x).toBeGreaterThanOrEqual(pickerBox.x);
    expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(pickerBox.x + pickerBox.width);
  }
  await page.screenshot({ path: testInfo.outputPath('task-create-date-1440.png') });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('a timed task is completed from its ring on the timeline and the completion can be undone', async ({ page }, testInfo) => {
  await setup(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const writes: unknown[] = [];
  page.on('request', request => { if (request.method() === 'PUT' && request.url().includes(`/tasks/${taskId(1)}`)) writes.push(request.postDataJSON().status); });
  await page.goto(`${base}/today`);
  const timeline = page.getByTestId('today-timeline');
  const marker = timeline.getByRole('button', { name: '任务：检查朵朵的数学作业 2', exact: true });
  const ring = timeline.getByRole('button', { name: '完成任务', exact: true });
  await expect(marker).toBeVisible();
  // The ring fits the half-hour marker and sits beside the button that opens the task, not inside it.
  const ringBox = (await ring.boundingBox())!;
  const markerBox = (await marker.boundingBox())!;
  expect(ringBox.height).toBeLessThanOrEqual(24);
  expect(Math.abs(ringBox.y - markerBox.y)).toBeLessThan(1);
  expect(ringBox.x + ringBox.width).toBeLessThanOrEqual(markerBox.x);
  await expect(marker.getByRole('button')).toHaveCount(0);
  await marker.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('today-timeline-task-1440.png') });
  await ring.click();
  await expect(page.getByText('已完成「检查朵朵的数学作业 2」', { exact: true })).toBeVisible();
  // While the completion can be undone the marker stays where it was, marked done.
  await expect(timeline.getByRole('button', { name: '标记为未完成', exact: true })).toBeVisible();
  await expect(marker).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('today-timeline-task-done-1440.png') });
  expect(writes).toEqual(['completed']);
  await page.getByRole('button', { name: '撤销完成：检查朵朵的数学作业 2', exact: true }).click();
  await expect(page.getByText('已完成「检查朵朵的数学作业 2」', { exact: true })).toHaveCount(0);
  await expect(ring).toBeVisible();
  expect(writes).toEqual(['completed', 'pending']);
});

test('labels are edited in the side pane beside a list that stays usable', async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}/labels`);
  const school = page.getByRole('button', { name: '标签：学校', exact: true });
  await school.click();
  const pane = page.getByRole('region', { name: '编辑标签', exact: true });
  await expect(pane.getByLabel('编辑标签名称')).toHaveValue('学校');
  // The open label is marked in the list, and each row names who created it.
  await expect(school).toHaveAttribute('aria-current', 'true');
  await expect(page.getByText('小林 创建', { exact: true })).toHaveCount(2);
  // Another row replaces the open label rather than being blocked by the pane.
  const home = page.getByRole('button', { name: '标签：家务', exact: true });
  await home.click();
  await expect(pane.getByLabel('编辑标签名称')).toHaveValue('家务');
  await expect(home).toHaveAttribute('aria-current', 'true');
  await expect(school).not.toHaveAttribute('aria-current', 'true');
  // Delete, cancel and save share one footer row, with delete apart at the start.
  const remove = (await pane.getByRole('button', { name: '删除标签', exact: true }).boundingBox())!;
  const cancel = (await pane.getByRole('button', { name: '取消', exact: true }).boundingBox())!;
  const save = (await pane.getByRole('button', { name: '保存', exact: true }).boundingBox())!;
  expect(Math.abs(remove.y + remove.height / 2 - (save.y + save.height / 2))).toBeLessThan(2);
  expect(remove.x + remove.width).toBeLessThan(cancel.x);
  expect(cancel.x + cancel.width).toBeLessThanOrEqual(save.x);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await pane.getByRole('button', { name: '删除标签', exact: true }).click();
  await expect(page.getByText(/日程和任务本身会保留/)).toBeVisible();
});
