import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const householdId = '11111111-1111-4111-8111-111111111111';
const parentsId = '22222222-2222-4222-8222-222222222222';
const taskId = '33333333-3333-4333-8333-333333333333';
const base = `/households/${householdId}`;

interface Writes {
  settings: unknown[];
  reminders: unknown[];
  tasks: unknown[];
}

async function setup(page: Page): Promise<Writes> {
  const writes: Writes = { settings: [], reminders: [], tasks: [] };
  let settings = {
    taskMinutesBefore: 0, eventMinutesBefore: 15, dateOnlyTime: '09:00', alarm: false,
    households: [{ id: householdId, name: '小林之家', muted: false }, { id: parentsId, name: '爸妈家', muted: false }],
  };
  let task = {
    id: taskId, householdId, title: '交水费', description: null, status: 'pending', priority: 'medium',
    dueDate: new Date('2026-10-24T18:00:00').toISOString(), assigneeIds: ['user'], labels: [], recurrenceRuleId: null, recurrence: null,
    occurrenceDate: null, createdBy: 'user', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
    myReminder: { mode: 'default', minutesBefore: null, alarm: null },
  };
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    let body: unknown = {};
    const household = { id: householdId, name: '小林之家', role: 'OWNER', memberCount: 1, ownerMembershipId: 'member' };
    if (path.endsWith('/auth/refresh')) body = { accessToken: 'mock-only' };
    else if (path.endsWith('/users/me')) body = { id: 'user', username: 'review', displayName: '小林', hasHousehold: true };
    else if (path.endsWith('/users/me/reminder-settings')) {
      if (method === 'PUT') {
        const next = route.request().postDataJSON() as { taskMinutesBefore: number | null; eventMinutesBefore: number | null; dateOnlyTime: string; alarm: boolean; mutedHouseholdIds: string[] };
        writes.settings.push(next);
        settings = {
          taskMinutesBefore: next.taskMinutesBefore, eventMinutesBefore: next.eventMinutesBefore, dateOnlyTime: next.dateOnlyTime, alarm: next.alarm,
          households: settings.households.map(item => ({ ...item, muted: next.mutedHouseholdIds.includes(item.id) })),
        };
      }
      body = settings;
    } else if (path === '/api/v1/households') body = [household, { ...household, id: parentsId, name: '爸妈家', role: 'MEMBER' }];
    else if (path.endsWith('/' + householdId)) body = { ...household, members: [{ membershipId: 'member', userId: 'user', displayName: '小林', username: 'review', role: 'OWNER', isCurrentUser: true }] };
    else if (path.endsWith(`/tasks/${taskId}/my-reminder`)) {
      writes.reminders.push(route.request().postDataJSON());
      task = { ...task, myReminder: route.request().postDataJSON() };
      body = task.myReminder;
    } else if (path.endsWith('/tasks/' + taskId)) {
      if (method === 'PUT') { writes.tasks.push(route.request().postDataJSON()); task = { ...task, ...route.request().postDataJSON(), updatedAt: new Date().toISOString() }; }
      body = task;
    } else if (path.endsWith('/tasks')) body = { tasks: [task], total: 1, materializedThrough: null };
    else if (path.endsWith('/labels')) body = { labels: [] };
    else if (path.endsWith('/events')) body = { events: [], total: 0, materializedThrough: null };
    else if (path.endsWith('/invitations/inbox')) body = { invitations: [] };
    else throw new Error(`Unexpected API ${method} ${path}`);
    await route.fulfill({ json: body });
  });
  return writes;
}

for (const width of [320, 390, 1440]) {
  test(`the 提醒 page is reached from the account menu and saves each change at once at ${width}px`, async ({ page }, testInfo) => {
    const writes = await setup(page);
    await page.setViewportSize({ width, height: 900 });
    // From a household page, as a person finds it: nothing links to 个人中心 any more.
    await page.goto(`${base}/tasks`);
    await page.getByRole('button', { name: '个人中心', exact: true }).click();
    await page.getByRole('menuitem', { name: '提醒', exact: true }).click();
    await expect(page).toHaveURL('/reminders');
    await expect(page.getByRole('heading', { name: '提醒', exact: true })).toBeVisible();
    // A browser schedules nothing, and says so instead of offering notifications.
    await expect(page.getByText('网页不会弹出提醒，这里的设置在手机 App 上生效。')).toBeVisible();
    await expect(page.getByRole('button', { name: '开启通知' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '分给我的任务，准时', exact: true })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`reminders-${width}.png`), fullPage: true });

    const eventRow = page.getByRole('button', { name: '日程，开始前 15 分钟', exact: true });
    await eventRow.click();
    const dialog = page.getByRole('dialog', { name: '日程' });
    await dialog.getByRole('radio', { name: '开始前 30 分钟', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: '日程，开始前 30 分钟', exact: true })).toBeFocused();

    await page.getByRole('switch', { name: '接收爸妈家的提醒' }).click();
    await expect(page.getByRole('switch', { name: '接收爸妈家的提醒' })).not.toBeChecked();

    // A browser cannot ring, but the choice reaches the phone.
    await expect(page.getByText('到时间像闹钟一样一直响，直到按「知道了」。只在 Android 手机上响。')).toBeVisible();
    await page.getByRole('switch', { name: '用闹铃提醒' }).click();
    await expect(page.getByRole('switch', { name: '用闹铃提醒' })).toBeChecked();
    expect(writes.settings).toEqual([
      { taskMinutesBefore: 0, eventMinutesBefore: 30, dateOnlyTime: '09:00', alarm: false, mutedHouseholdIds: [] },
      { taskMinutesBefore: 0, eventMinutesBefore: 30, dateOnlyTime: '09:00', alarm: false, mutedHouseholdIds: [parentsId] },
      { taskMinutesBefore: 0, eventMinutesBefore: 30, dateOnlyTime: '09:00', alarm: true, mutedHouseholdIds: [parentsId] },
    ]);
  });
}

test('a task shows when its reminder comes, and changing only the reminder saves no edit', async ({ page }, testInfo) => {
  const writes = await setup(page);
  await page.goto(`${base}/tasks/${taskId}`);
  const detail = page.getByRole('dialog', { name: '任务详情', exact: true });
  await expect(detail.getByText('18:00（准时）', { exact: true })).toBeVisible();
  await detail.getByRole('button', { name: '编辑任务', exact: true }).click();
  const edit = page.getByRole('dialog', { name: '编辑任务', exact: true });
  await edit.getByRole('button', { name: '提醒我，准时提醒（默认）', exact: true }).click();
  await expect(page.getByText('只改你自己的提醒，家人不受影响。')).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('task-reminder-step-390.png') });
  await page.getByRole('radio', { name: '提前 1 小时', exact: true }).click();
  await expect(edit.getByRole('button', { name: '提醒我，提前 1 小时提醒', exact: true })).toBeVisible();
  await edit.getByRole('button', { name: '保存', exact: true }).click();
  await expect(detail).toBeVisible();
  await expect(detail.getByText('17:00（提前 1 小时）', { exact: true })).toBeVisible();
  expect(writes.reminders).toEqual([{ mode: 'before', minutesBefore: 60, alarm: null }]);
  expect(writes.tasks).toEqual([]);
});

test('a task can ring on its own, and the detail says so', async ({ page }) => {
  const writes = await setup(page);
  await page.goto(`${base}/tasks/${taskId}`);
  const detail = page.getByRole('dialog', { name: '任务详情', exact: true });
  await detail.getByRole('button', { name: '编辑任务', exact: true }).click();
  const edit = page.getByRole('dialog', { name: '编辑任务', exact: true });
  await edit.getByRole('button', { name: '闹铃，普通提醒（默认）', exact: true }).click();
  await expect(page.getByText('只改你自己的提醒，家人不受影响。闹铃只在 Android 手机上响，这台设备上仍是普通提醒。')).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('radio', { name: '闹铃提醒', exact: true }).click();
  await expect(edit.getByRole('button', { name: '闹铃，闹铃提醒', exact: true })).toBeFocused();
  await edit.getByRole('button', { name: '保存', exact: true }).click();
  await expect(detail.getByText('18:00（准时） · 闹铃', { exact: true })).toBeVisible();
  expect(writes.reminders).toEqual([{ mode: 'default', minutesBefore: null, alarm: true }]);
  expect(writes.tasks).toEqual([]);
});
