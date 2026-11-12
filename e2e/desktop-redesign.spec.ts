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
    else if (path.endsWith('/tasks')) body = method === 'POST' ? { ...tasks[3], ...route.request().postDataJSON(), id: taskId(99) } : { tasks };
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
      if (destination.startsWith('assistant/')) {
        // The assistant's columns carry their own 56px headers in place of the shared one.
        const columns = page.getByTestId('desktop-column-header');
        await expect(columns.first()).toBeVisible();
        await expect(page.getByTestId('desktop-page-header')).toHaveCount(0);
        await expect(page.getByRole('progressbar')).toHaveCount(0);
        const boxes = await Promise.all((await columns.all()).map(column => column.boundingBox()));
        expect(boxes.length).toBeGreaterThanOrEqual(2);
        for (const column of boxes) expect(column!.height).toBe(56);
        expect(boxes[0]!.x).toBe(sidebarWidth + 1);
      } else {
        const header = page.getByTestId('desktop-page-header');
        await expect(header.last()).toBeVisible();
        await expect(page.getByRole('progressbar')).toHaveCount(0);
        const box = (await header.boundingBox())!;
        expect(box.height).toBe(56);
        expect(box.x).toBe(sidebarWidth + 1);
        expect(box.x + box.width).toBe(width - 9);
      }
      const sidebar = (await page.getByTestId('global-sidebar').boundingBox())!;
      expect(sidebar.width).toBe(sidebarWidth);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`${destination.replaceAll('/', '-')}-${width}.png`) });
      if (destination === 'events') {
        const grid = (await page.getByTestId('desktop-month-grid').boundingBox())!;
        expect(grid.y + grid.height).toBe(891);
        const span = page.getByTestId('calendar-span');
        await expect(span).toHaveCount(1);
        // Three day cells wide, inset 4px from the cell edges on each side.
        expect((await span.boundingBox())!.width).toBeCloseTo(grid.width * 3 / 7 - 8, 0);
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
    const title = edit.getByRole('textbox', { name: '任务标题', exact: true });
    // An editor nothing was changed in gives way without asking.
    await expect(title).toHaveValue('检查朵朵的数学作业 2');
    await first.click();
    await expect(detail.getByRole('heading', { name: '交物业费 1', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await second.click();
    await detail.getByRole('button', { name: '编辑任务', exact: true }).click();
    await title.fill('待保存的家庭安排');
    await first.click();
    // Changes ask first, in a dialog of its own; the editor stays in the pane behind it.
    const confirmation = page.getByRole('dialog', { name: '修改还没有保存', exact: true });
    await expect(confirmation).toBeVisible();
    await expect(title).toHaveValue('待保存的家庭安排');
    await page.screenshot({ path: testInfo.outputPath(`switch-question-${width}.png`) });
    await confirmation.getByRole('button', { name: '继续编辑', exact: true }).click();
    await expect(confirmation).toHaveCount(0);
    await expect(title).toHaveValue('待保存的家庭安排');
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

test('the sidebar counts the day, collapses to a rail and searches the household', async ({ page }, testInfo) => {
  await setup(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}/tasks`);
  const sidebar = page.getByTestId('global-sidebar');
  // Two events and one task today, one task overdue; the destinations keep their plain names.
  await expect(sidebar.getByRole('tab', { name: '今日', exact: true })).toHaveAccessibleDescription('今天 3 项安排');
  await expect(sidebar.getByRole('tab', { name: '任务', exact: true })).toHaveAccessibleDescription('1 件逾期');
  // Collapsing is remembered across a reload; expanding again returns the full sidebar.
  await sidebar.getByRole('button', { name: '收起侧栏', exact: true }).click();
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(64);
  await page.reload();
  await expect(sidebar.getByRole('button', { name: '展开侧栏', exact: true })).toBeVisible();
  expect((await sidebar.boundingBox())!.width).toBe(64);
  await sidebar.getByRole('button', { name: '展开侧栏', exact: true }).click();
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(248);

  const entry = sidebar.getByRole('button', { name: '搜索', exact: true });
  const palette = page.getByRole('dialog', { name: '搜索', exact: true });
  const input = palette.getByRole('combobox', { name: '搜索页面、任务、日程和笔记', exact: true });
  await page.keyboard.press('Control+K');
  await expect(input).toBeFocused();
  await input.fill('朵朵');
  const options = palette.getByRole('option');
  await expect(options.first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(palette.getByRole('option', { name: /^日程：朵朵家长会/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('search-1440.png') });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(palette).toHaveCount(0);
  // Opened from the sidebar, closing returns focus to the search entry.
  await entry.click();
  await expect(input).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(entry).toBeFocused();
  // A result opens beside its own section's list, here the calendar.
  await entry.click();
  await input.fill('家长会');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`${base}/events/event-2`);
  await expect(page.getByRole('region', { name: '日程详情', exact: true })).toBeVisible();
  await expect(page.getByTestId('desktop-month-grid')).toBeVisible();
  await expect(sidebar.getByRole('tab', { name: '日历', exact: true })).toHaveAttribute('aria-selected', 'true');
  // Pages are found by name too.
  await page.keyboard.press('Control+K');
  await input.fill('标签');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`${base}/labels`);
});

test('a desktop pane form names its shortcut, and Ctrl+Enter submits it', async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const created: unknown[] = [];
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/tasks')) created.push(request.postDataJSON()); });
  await page.goto(`${base}/tasks`);
  await page.getByRole('button', { name: '创建任务', exact: true }).click();
  const editor = page.getByRole('region', { name: '创建任务', exact: true });
  await expect(editor.getByText('Ctrl + Enter 创建', { exact: true })).toBeVisible();
  // Label chips in a desktop form are 24px.
  expect((await editor.getByRole('button', { name: '选择标签 学校', exact: true }).boundingBox())!.height).toBe(24);
  await editor.getByRole('textbox', { name: '任务标题', exact: true }).fill('准备郊游野餐用品');
  await page.keyboard.press('Control+Enter');
  await expect.poll(() => created.length).toBe(1);
  expect(created[0]).toMatchObject({ title: '准备郊游野餐用品' });
});

test('a rule opens for reading, and its editor gives way to another rule without asking until something changes', async ({ page }) => {
  await setup(page);
  const rule = (id: string, title: string) => ({ id, kind: 'task', title, freq: 'daily', interval: 1, byWeekday: [], startsOn: '2026-11-01', endsOn: null, count: null, timezone: 'Asia/Shanghai', startTimeLocal: null, durationMinutes: null, lunar: null, occasion: null, birthYear: null, nextOccurrenceDate: '2026-11-10', updatedAt: version });
  const rules = [rule('77777777-7777-4777-8777-000000000001', '倒垃圾'), rule('77777777-7777-4777-8777-000000000002', '浇花')];
  await page.route(url => url.pathname.startsWith('/api/v1/') && url.pathname.includes('/recurrence-rules'), route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path.endsWith('/recurrence-rules') ? { rules, total: rules.length } : rules.find(item => path.endsWith(item.id)) });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}/recurrence-rules`);
  const first = page.getByRole('button', { name: /^任务重复安排：倒垃圾，/ });
  const second = page.getByRole('button', { name: /^任务重复安排：浇花，/ });
  await first.click();
  const detail = page.getByRole('region', { name: '重复安排详情', exact: true });
  await expect(detail.getByRole('heading', { name: '倒垃圾', exact: true })).toBeVisible();
  await detail.getByRole('button', { name: '编辑重复安排', exact: true }).click();
  const edit = page.getByRole('region', { name: '编辑重复安排', exact: true });
  const repeat = edit.getByRole('button', { name: /^重复规则，/ });
  await expect(repeat).toHaveAccessibleName('重复规则，每天重复');
  // Opening the editor, which moves the rule's start to tomorrow, is not a change.
  await second.click();
  await expect(detail.getByRole('heading', { name: '浇花', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await detail.getByRole('button', { name: '编辑重复安排', exact: true }).click();
  await repeat.click();
  await page.getByRole('region', { name: '重复', exact: true }).getByRole('radio', { name: '每周' }).click();
  await first.click();
  const question = page.getByRole('dialog', { name: '修改还没有保存', exact: true });
  await expect(question).toBeVisible();
  await question.getByRole('button', { name: '保留草稿并切换', exact: true }).click();
  await expect(detail.getByRole('heading', { name: '倒垃圾', exact: true })).toBeVisible();
});

test('the wide sign-in screen sets the product beside a floating form', async ({ page }) => {
  await page.route('**/api/v1/**', route => route.fulfill({ status: 401, json: { error: { code: 'UNAUTHORIZED' } } }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: '欢迎回来', exact: true })).toBeVisible();
  await expect(page.getByText('登录后回到你的家庭。', { exact: true })).toBeVisible();
  await expect(page.getByTestId('auth-decoration')).toBeVisible();
  expect((await page.getByTestId('auth-shell').boundingBox())!.width).toBe(360);
  expect((await page.getByRole('button', { name: '登录', exact: true }).boundingBox())!.height).toBe(40);
  await expect(page.getByRole('link', { name: '创建账户', exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('creating from Today keeps only the columns related to what is being made', async ({ page }, testInfo) => {
  await setup(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}/today`);
  // An event keeps the dates of 接下来, a task keeps 待办, a note gets both columns' room.
  const layouts = { 日程: { todo: false, next: true, pane: 400 }, 任务: { todo: true, next: false, pane: 400 }, 笔记: { todo: false, next: false, pane: 700 } };
  const todo = page.getByRole('heading', { name: '待办', exact: true });
  const next = page.getByRole('heading', { name: '接下来', exact: true });
  for (const [kind, layout] of Object.entries(layouts)) {
    await page.getByTestId('header-create').click();
    // A small menu anchored under the button, with no blurred layer over the page.
    const menu = page.getByRole('menu', { name: '创建内容', exact: true });
    expect((await menu.boundingBox())!.width).toBe(184);
    await expect(page.getByTestId('create-menu-blur')).toHaveCount(0);
    await menu.getByRole('menuitem', { name: `创建${kind}`, exact: true }).click();
    const region = page.getByRole('region', { name: `创建${kind}`, exact: true });
    const panel = region.getByTestId('app-dialog-panel');
    await expect(panel).toHaveCSS('opacity', '1');
    const pane = (await panel.boundingBox())!;
    expect(pane.width).toBe(layout.pane);
    await expect(todo).toHaveCount(layout.todo ? 1 : 0);
    await expect(next).toHaveCount(layout.next ? 1 : 0);
    for (const kept of [layout.todo ? page.getByRole('link', { name: '全部任务', exact: true }) : null, layout.next ? next : null]) {
      if (kept) expect((await kept.boundingBox())!.x + (await kept.boundingBox())!.width).toBeLessThan(pane.x);
    }
    await page.screenshot({ path: testInfo.outputPath(`today-create-${kind}-1440.png`) });
    // The way out is a round 32px button, not a bare glyph.
    const close = region.getByRole('button', { name: `关闭创建${kind}`, exact: true });
    expect((await close.boundingBox())!.width).toBe(32);
    await expect(close).toHaveCSS('border-radius', '999px');
    await close.click();
    await expect(region).toHaveCount(0);
    // The folded columns come back once the pane closes.
    await expect(todo).toHaveCount(1);
    await expect(next).toHaveCount(1);
  }
});

test.describe('desktop motion', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });
  /** Opacity and transform of the pane on every frame for a while after `act`. */
  async function paneFrames(page: Page, act: () => Promise<void>) {
    await page.evaluate(() => {
      const frames: Array<[string, string]> = [];
      (window as unknown as { paneFrames: typeof frames }).paneFrames = frames;
      const start = performance.now();
      const tick = () => {
        const panel = document.querySelector('[data-testid="app-dialog-panel"]');
        if (panel) { const style = getComputedStyle(panel); frames.push([style.opacity, style.transform]); }
        if (performance.now() - start < 1200) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await act();
    await page.waitForTimeout(1300);
    return page.evaluate(() => (window as unknown as { paneFrames: Array<[string, string]> }).paneFrames);
  }

  test('a pane slides in once; switching items replaces it in place', async ({ page }) => {
    await setup(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${base}/tasks`);
    const opened = await paneFrames(page, () => page.getByRole('button', { name: '任务：交物业费 1', exact: true }).click());
    expect(opened.some(([opacity]) => Number(opacity) < 1)).toBe(true);
    expect(opened.some(([, transform]) => transform !== 'none' && transform !== 'matrix(1, 0, 0, 1, 0, 0)')).toBe(true);
    expect(opened.at(-1)).toEqual(['1', 'matrix(1, 0, 0, 1, 0, 0)']);
    const switched = await paneFrames(page, () => page.getByRole('button', { name: '任务：检查朵朵的数学作业 2', exact: true }).click());
    expect(switched.every(([opacity]) => opacity === '1')).toBe(true);
  });

  test('with reduced motion a pane only fades in', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await setup(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${base}/tasks`);
    const opened = await paneFrames(page, () => page.getByRole('button', { name: '任务：交物业费 1', exact: true }).click());
    expect(opened.length).toBeGreaterThan(0);
    expect(opened.every(([, transform]) => transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)')).toBe(true);
  });
});

test('标签管理 creates through the shared button: in the page header on a wide screen, bottom right on a phone', async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}/labels`);
  await expect(page.getByTestId('desktop-page-header').getByTestId('header-create')).toHaveAccessibleName('创建标签');
  await page.setViewportSize({ width: 390, height: 844 });
  const create = page.getByTestId('floating-create');
  await expect(create).toHaveAccessibleName('创建标签');
  await expect(page.getByRole('button', { name: '创建标签' })).toHaveCount(1);
  await create.click();
  await expect(page.getByRole('dialog', { name: '创建标签', exact: true })).toBeVisible();
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
  // A changed label asks first, in a dialog of its own: labels keep no drafts, so switching drops the change.
  await pane.getByLabel('编辑标签名称').fill('家务活');
  await school.click();
  const question = page.getByRole('dialog', { name: '修改还没有保存', exact: true });
  await expect(question.getByText('切换后，这些修改会丢失。', { exact: true })).toBeVisible();
  await expect(pane.getByLabel('编辑标签名称')).toHaveValue('家务活');
  await question.getByRole('button', { name: '继续编辑', exact: true }).click();
  await expect(pane.getByLabel('编辑标签名称')).toHaveValue('家务活');
  await school.click();
  await question.getByRole('button', { name: '放弃修改并切换', exact: true }).click();
  await expect(pane.getByLabel('编辑标签名称')).toHaveValue('学校');
  await home.click();
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

test('家人生日 is framed like the other family lists: create in the header, rows edge to edge', async ({ page }, testInfo) => {
  await setup(page);
  const birthday = (id: string, title: string, lunar: { month: number; day: number } | null, next: string) => ({ id, kind: 'event', title, freq: 'YEARLY', interval: 1, byWeekday: [], startsOn: next, endsOn: null, count: null, timezone: 'Asia/Shanghai', startTimeLocal: null, durationMinutes: null, lunar, occasion: 'birthday', birthYear: 1968, nextOccurrenceDate: next, updatedAt: version });
  const rules = [birthday('birthday-1', '妈妈的生日', null, '2026-11-10'), birthday('birthday-2', '外婆的农历生日', { month: 11, day: 8 }, '2026-12-17')];
  await page.route(url => url.pathname.endsWith('/recurrence-rules'), route => route.fulfill({ json: { rules, total: rules.length } }));
  await page.setViewportSize({ width: 1440, height: 900 });
  // The row around a row's button: what the hover tint and the hairlines span.
  const rowFrame = async (name: string | RegExp) => {
    const box = (await page.getByRole('button', { name }).first().locator('xpath=../..').boundingBox())!;
    return [box.x, box.width];
  };
  await page.goto(`${base}/labels`);
  const labelRow = await rowFrame('标签：学校');
  // Edge to edge: from the sidebar's edge to the workspace's right border.
  expect(labelRow).toEqual([249, 1440 - 249 - 9]);

  await page.goto(`${base}/birthdays`);
  const header = page.getByTestId('desktop-page-header');
  await expect(header.getByRole('button', { name: '添加生日', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '添加生日' })).toHaveCount(1);
  await expect(header.getByText('2 个 · 按下一次生日排列')).toBeVisible();
  await expect(page.getByRole('button', { name: /^妈妈的生日，每年 11月10日 · 11月10日周二，今天，58 岁$/ })).toBeVisible();
  expect(await rowFrame(/^妈妈的生日，/)).toEqual(labelRow);
  expect(await rowFrame(/^外婆的农历生日，/)).toEqual(labelRow);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('birthdays-1440.png') });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('floating-create')).toHaveAccessibleName('添加生日');
  await expect(page.getByRole('button', { name: '添加生日' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: /^外婆的农历生日，农历冬月初八 · 12月17日周四，37 天后，/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('birthdays-390.png') });
});
