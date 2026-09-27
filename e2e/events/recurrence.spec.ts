import { expect, test, type Page } from '@playwright/test';
import { Client } from 'pg';

import { loginUsernameFixture } from '../support/auth';

/** The calendar grid names a day as "2030年6月20日". */
const dayLabel = (iso: string): string => {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  return `${year}年${month}月${day}日`;
};

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:3000';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:8081';
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://muchakucha_test:muchakucha_test_only@127.0.0.1:5432/muchakucha_test';
const password = 'correct horse battery staple 2026';

type ApiResult<T = any> = { status: number; body: T };
type TestAccount = { username: string; accessToken: string; userId: string };

function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateAt(year: number, month: number, day: number): Date {
  return new Date(year, month, day, 9, 0, 0, 0);
}

function weekdayLabel(day: number): string {
  return `星期${['日', '一', '二', '三', '四', '五', '六'][day]}`;
}

/** Chooses a date through the Material-style dialog's keyboard entry. */
async function pickDate(page: Page, name: string, value: string) {
  await page.getByRole('button', { name: new RegExp(`^${name}，`) }).click();
  const dialog = page.getByRole('dialog', { name: '选择日期' });
  await dialog.getByRole('button', { name: '切换到键盘输入' }).click();
  await dialog.getByLabel('输入日期').fill(value);
  await dialog.getByRole('button', { name: '确定', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

async function pickTime(page: Page, name: string, value: string) {
  await page.getByRole('button', { name: new RegExp(`^${name}，`) }).click();
  await page.getByRole('dialog', { name: '选择时间' }).getByRole('button', { name: `选择 ${value}`, exact: true }).click();
}

async function withDatabase<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const database = new Client({ connectionString: DATABASE_URL });
  await database.connect();
  try {
    return await run(database);
  } finally {
    await database.end();
  }
}

async function prepareAccount(seed: string): Promise<TestAccount> {
  return withDatabase(async (database) => {
    const username = `u-${seed.slice(0, 6)}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
    const registerResponse = await fetch(`${API_ORIGIN}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({ username, confirmPassword: password, password, platform: 'web' }),
    });
    expect(registerResponse.status).toBe(202);

    await database.query(
      `UPDATE "User" SET "display_name" = $2 WHERE "username_canonical" = lower($1)`,
      [username, '重复旅程测试'],
    );

    const loginResponse = await fetch(`${API_ORIGIN}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({ username, password, platform: 'web' }),
    });
    expect(loginResponse.status).toBe(200);
    const loginBody = (await loginResponse.json()) as { accessToken: string };
    const meResponse = await fetch(`${API_ORIGIN}/api/v1/users/me`, {
      headers: { authorization: `Bearer ${loginBody.accessToken}` },
    });
    expect(meResponse.status).toBe(200);
    const me = (await meResponse.json()) as { id: string };
    return { username, accessToken: loginBody.accessToken, userId: me.id };
  });
}

async function createHousehold(accessToken: string, name: string): Promise<string> {
  const result = await apiCall<{ id: string }>(accessToken, 'POST', '/api/v1/households', { name });
  expect(result.status).toBe(201);
  return result.body.id;
}

async function apiCall<T = any>(
  accessToken: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: (text === '' ? undefined : JSON.parse(text)) as T,
  };
}

async function loginFixture(page: Page, username: string): Promise<void> {
  await loginUsernameFixture(page, username, password);
}

async function listEvents(accessToken: string, householdId: string, start: string, end: string) {
  const result = await apiCall<{ events: any[] }>(
    accessToken,
    'GET',
    `/api/v1/households/${householdId}/events?startDate=${start}&endDate=${end}`,
  );
  expect(result.status).toBe(200);
  return result.body.events;
}

async function listTasks(accessToken: string, householdId: string) {
  const result = await apiCall<{ tasks: any[] }>(
    accessToken,
    'GET',
    `/api/v1/households/${householdId}/tasks`,
  );
  expect(result.status).toBe(200);
  return result.body.tasks;
}

test.describe('recurring event and task journeys', () => {
  test('browsing a future month shows daily occurrences and opens their real details', async ({ page }) => {
    const account = await prepareAccount('future');
    const householdId = await createHousehold(account.accessToken, '未来日历之家');
    const today = new Date();
    const startsOn = toIsoDate(today);
    const future = dateAt(today.getFullYear(), today.getMonth() + 2, 15);
    const futureDate = toIsoDate(future);
    const title = `未来每日安排-${Date.now()}`;
    const result = await apiCall(account.accessToken, 'POST', `/api/v1/households/${householdId}/events`, {
      title, startTime: `${startsOn}T09:00:00Z`, endTime: `${startsOn}T10:00:00Z`,
      recurrence: { freq: 'daily', startsOn, timezone: 'UTC' },
    });
    expect(result.status).toBe(201);
    await loginFixture(page, account.username);
    await page.getByRole('tab', { name: '日历', exact: true }).click();
    for (let i = 0; i < 2; i += 1) {
      const loaded = page.waitForResponse((response) => response.url().includes('/events?') && response.url().includes('expandRecurring=true'));
      await page.getByRole('button', { name: '下一个月', exact: true }).click();
      expect((await loaded).status()).toBe(200);
    }
    await page.getByRole('button', { name: `${dayLabel(futureDate)}，1个日程`, exact: true }).click();
    await page.getByRole('button', { name: new RegExp(`^日程：${title}`) }).click();
    await expect(page.getByRole('dialog', { name: '日程详情' })).toBeVisible();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    const persisted = await listEvents(account.accessToken, householdId, futureDate, futureDate);
    expect(persisted.some((event) => event.occurrenceDate === futureDate && event.title === title)).toBe(true);
  });

  test('creates a weekly event in the Web form and presents every generated occurrence', async ({ page }) => {
    const account = await prepareAccount('create');
    const householdId = await createHousehold(account.accessToken, '重复事件之家');
    const title = `每周家庭会-${Date.now()}`;
    const now = new Date();
    const start = dateAt(now.getFullYear(), now.getMonth(), 2);
    const startDate = toIsoDate(start);
    const monthStart = toIsoDate(dateAt(now.getFullYear(), now.getMonth(), 1));
    const monthEnd = toIsoDate(dateAt(now.getFullYear(), now.getMonth() + 1, 0));
    await loginFixture(page, account.username);
    await page.getByRole('tab', { name: '日历', exact: true }).click();
    await expect(page.getByLabel('创建日程')).toBeVisible();
    await page.getByLabel('创建日程').click();
    await expect(page.getByRole('dialog', { name: '创建日程' })).toBeVisible();
    await page.getByLabel('日程标题').fill(title);
    await pickDate(page, '开始日期', startDate);
    await pickDate(page, '结束日期', startDate);
    await pickTime(page, '开始时间', '09:00');
    await pickTime(page, '结束时间', '10:00');

    const repeat = page.getByRole('button', { name: /^日程重复设置/ });
    await expect(repeat).toHaveAccessibleName('日程重复设置，不重复');
    await repeat.click();
    await page.getByRole('dialog', { name: '重复' }).getByRole('radio', { name: '每天' }).click();
    await expect(repeat).toHaveAccessibleName('日程重复设置，每天重复');
    await repeat.click();
    await page.getByRole('dialog', { name: '重复' }).getByRole('radio', { name: '自定义…' }).click();
    const custom = page.getByRole('dialog', { name: '自定义重复' });
    await custom.getByRole('radio', { name: '周', exact: true }).click();
    const defaultWeekday = await page.evaluate((value) => new Date(`${value}T12:00:00`).getDay(), startDate);
    const selectedWeekdays = [defaultWeekday, (defaultWeekday + 1) % 7, (defaultWeekday + 2) % 7];
    const checkedWeekdays = await custom.getByRole('checkbox').evaluateAll((checkboxes) =>
      checkboxes
        .filter((checkbox) => checkbox.getAttribute('aria-checked') === 'true')
        .map((checkbox) => checkbox.getAttribute('aria-label')),
    );
    expect(checkedWeekdays).toEqual([weekdayLabel(selectedWeekdays[0]!)]);
    await custom.getByLabel(weekdayLabel(selectedWeekdays[1]!)).click();
    await custom.getByLabel(weekdayLabel(selectedWeekdays[2]!)).click();
    await custom.getByRole('radio', { name: '重复次数', exact: true }).click();
    await custom.getByLabel('重复次数值', { exact: true }).fill('4');
    await custom.getByRole('button', { name: '完成', exact: true }).click();
    await expect(repeat).toHaveAccessibleName(/^日程重复设置，每周.*重复，共 4 次$/);

    await page.getByLabel('创建', { exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/households/${householdId}/events$`));

    const occurrences = (await listEvents(account.accessToken, householdId, monthStart, monthEnd))
      .filter((event) => event.title === title);
    expect(occurrences).toHaveLength(4);
    for (const occurrence of occurrences) {
      const day = Number(String(occurrence.occurrenceDate).slice(-2));
      await page.getByLabel(new RegExp(`^\\d{4}年\\d{1,2}月${day}日(?:，今天)?，\\d+个日程$`)).click();
      await expect(page.getByLabel(`日程：${title}，重复`)).toBeVisible();
    }

    const detailOccurrence = occurrences[2]!;
    await page.getByLabel(new RegExp(`^${dayLabel(String(detailOccurrence.occurrenceDate))}(?:，今天)?，\\d+个日程$`)).click();
    await page.getByLabel(`日程：${title}，重复`).click();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.getByText('重复安排', { exact: true })).toBeVisible();
    await expect(page.getByText(/每周.*重复，共 4 次/)).toBeVisible();
  });

  test('splits an event only after scope selection and cancels one task occurrence', async ({ page }) => {
    const account = await prepareAccount('scope');
    const householdId = await createHousehold(account.accessToken, '范围选择之家');
    const now = new Date();
    const seriesStart = dateAt(now.getFullYear(), now.getMonth(), 2);
    const startsOn = toIsoDate(seriesStart);
    const rangeStart = toIsoDate(dateAt(now.getFullYear(), now.getMonth(), 1));
    const rangeEnd = toIsoDate(dateAt(now.getFullYear(), now.getMonth() + 2, 0));
    const byWeekday = [seriesStart.getDay(), (seriesStart.getDay() + 1) % 7, (seriesStart.getDay() + 2) % 7].sort();
    const eventTitle = `拆分事件-${Date.now()}`;

    const eventCreate = await apiCall<any>(account.accessToken, 'POST', `/api/v1/households/${householdId}/events`, {
      title: eventTitle,
      startTime: `${startsOn}T09:00:00.000Z`,
      endTime: `${startsOn}T10:00:00.000Z`,
      recurrence: {
        freq: 'weekly',
        interval: 1,
        byWeekday,
        startsOn,
        count: 6,
        timezone: 'UTC',
      },
    });
    expect(eventCreate.status).toBe(201);
    const originalRuleId = eventCreate.body.recurrenceRuleId as string;
    expect(originalRuleId).toBeTruthy();
    const before = (await listEvents(account.accessToken, householdId, rangeStart, rangeEnd))
      .filter((event) => event.title === eventTitle)
      .sort((left, right) => left.occurrenceDate.localeCompare(right.occurrenceDate));
    expect(before).toHaveLength(6);
    const selected = before[2]!;
    const removedWeekday = byWeekday.find((weekday) => weekday !== new Date(`${selected.occurrenceDate}T00:00:00Z`).getUTCDay())!;

    await loginFixture(page, account.username);
    await page.getByRole('tab', { name: '日历', exact: true }).click();
    await page.getByLabel(new RegExp(`^${dayLabel(String(selected.occurrenceDate))}(?:，今天)?，\\d+个日程$`)).click();
    await page.getByLabel(`日程：${eventTitle}，重复`).click();
    await page.getByLabel('编辑日程').click();
    const edit = page.getByRole('dialog', { name: '编辑日程' });
    await expect(edit).toBeVisible();
    // Weekdays live on the custom repeat page, reached through the repeat row.
    const openCustomRepeat = async () => {
      await page.getByRole('button', { name: /^日程重复设置/ }).click();
      await page.getByRole('dialog', { name: '重复' }).getByRole('radio', { name: '自定义…' }).click();
      return page.getByRole('dialog', { name: '自定义重复' });
    };
    let custom = await openCustomRepeat();
    await custom.getByLabel(weekdayLabel(removedWeekday)).click();
    await custom.getByRole('button', { name: '完成', exact: true }).click();
    await page.reload();
    custom = await openCustomRepeat();
    await expect(custom.getByLabel(weekdayLabel(removedWeekday))).not.toBeChecked();
    await custom.getByRole('button', { name: '完成', exact: true }).click();
    await page.getByLabel('保存', { exact: true }).click();

    const dialog = page.getByRole('dialog', { name: '更改重复规则？' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('仅此一次')).toBeDisabled();
    const beforeChoice = (await listEvents(account.accessToken, householdId, rangeStart, rangeEnd))
      .filter((event) => event.title === eventTitle)
      .sort((left, right) => left.occurrenceDate.localeCompare(right.occurrenceDate));
    expect(beforeChoice.map((event) => [event.id, event.occurrenceDate])).toEqual(
      before.map((event) => [event.id, event.occurrenceDate]),
    );

    await expect(dialog.getByRole('radio', { name: '此后所有' })).toBeChecked();
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/households/${householdId}/events`));
    await expect.poll(async () => {
      const events = (await listEvents(account.accessToken, householdId, rangeStart, rangeEnd))
        .filter((event) => event.title === eventTitle);
      return events.some((event) => event.recurrenceRuleId !== originalRuleId);
    }).toBe(true);
    const after = (await listEvents(account.accessToken, householdId, rangeStart, rangeEnd))
      .filter((event) => event.title === eventTitle)
      .sort((left, right) => left.occurrenceDate.localeCompare(right.occurrenceDate));
    expect(after.slice(0, 2).map((event) => [event.id, event.occurrenceDate])).toEqual(
      before.slice(0, 2).map((event) => [event.id, event.occurrenceDate]),
    );
    const successor = after.find((event) => event.recurrenceRuleId !== originalRuleId);
    expect(successor).toBeDefined();
    expect(successor.recurrence.byWeekday).not.toContain(removedWeekday);

    // Generation is a rolling per-frequency lookahead (D-11/D-12), so a series
    // only materializes as far as its frequency's window reaches. A weekly rule
    // has a 6-day lookahead, so anchoring on today with four consecutive weekdays
    // materializes today plus the next three days — every sibling stays in the
    // future, which keeps them out of both the overdue and 今日待办 sections and
    // leaves exactly one occurrence due today. The rule is anchored to the
    // browser's timezone so the materializer's "today" and the Today view's
    // "today" are the same calendar day.
    const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const localIsoDate = (offsetDays: number): string => {
      const date = new Date();
      date.setDate(date.getDate() + offsetDays);
      return toIsoDate(date);
    };
    const localWeekday = (offsetDays: number): number => {
      const date = new Date();
      date.setDate(date.getDate() + offsetDays);
      return date.getDay();
    };
    const today = localIsoDate(0);
    const taskTitle = `取消单次-${Date.now()}`;
    const taskCreate = await apiCall<any>(account.accessToken, 'POST', `/api/v1/households/${householdId}/tasks`, {
      title: taskTitle,
      recurrence: {
        freq: 'weekly',
        interval: 1,
        byWeekday: [0, 1, 2, 3].map(localWeekday).sort((left, right) => left - right),
        startsOn: today,
        count: 4,
        timezone: localTimezone,
      },
    });
    expect(taskCreate.status).toBe(201);
    const taskOccurrences = (await listTasks(account.accessToken, householdId))
      .filter((task) => task.title === taskTitle)
      .sort((left, right) => left.occurrenceDate.localeCompare(right.occurrenceDate));
    expect(taskOccurrences).toHaveLength(4);
    // Cancel today's occurrence specifically, so the Today-view exclusion below
    // is a real before/after difference rather than a vacuously-absent row.
    const taskToCancel = taskOccurrences.find((task) => task.occurrenceDate === today)!;
    expect(taskToCancel).toBeDefined();

    await page.goto(`/households/${householdId}`);
    await page.getByRole('tab', { name: '今日', exact: true }).click();
    await expect(page.getByRole('main', { name: '今日视图' })).toBeVisible();
    // Exactly one occurrence is due today, and it is in 今日待办 before the cancel —
    // this is the "before" half of the exclusion assertion, so the "after" half
    // below cannot pass vacuously.
    await expect(page.getByText('今日待办（1）')).toBeVisible();

    // Reach the occurrence from the Today view. The overdue section is empty and
    // 今日待办 precedes the upcoming section, so this resolves to today's
    // occurrence even though every occurrence in the series shares one title.
    await page.getByRole('button', { name: `更多操作：任务：${taskTitle}`, exact: true }).first().click();
    await page.getByRole('menuitem', { name: `删除任务：${taskTitle}`, exact: true }).click();
    const deleteDialog = page.getByRole('dialog', { name: '删除任务' });
    await expect(deleteDialog).toBeVisible();
    await expect(deleteDialog.getByRole('button', { name: '关闭删除任务' })).toBeFocused();
    await deleteDialog.getByRole('radio', { name: '仅此一次' }).click();
    await deleteDialog.getByRole('button', { name: '确认删除任务', exact: true }).click();
    await expect(deleteDialog).toHaveCount(0);

    const afterCancel = (await listTasks(account.accessToken, householdId))
      .filter((task) => task.title === taskTitle);
    expect(afterCancel.find((task) => task.id === taskToCancel.id)?.status).toBe('cancelled');
    expect(afterCancel.filter((task) => task.id !== taskToCancel.id).every((task) => task.status === 'pending')).toBe(true);

    await page.goto(`/households/${householdId}`);
    await page.getByRole('tab', { name: '任务', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/households/${householdId}/tasks$`));
    await expect(page.getByText('已取消', { exact: true })).toBeVisible();

    await page.goto(`/households/${householdId}`);
    await page.getByRole('tab', { name: '今日', exact: true }).click();
    await expect(page.getByRole('main', { name: '今日视图' })).toBeVisible();
    // The cancelled occurrence is gone from 今日待办 — the section held only that
    // one task, so it disappears entirely. Its future siblings are untouched and
    // remain listed under the upcoming section.
    await expect(page.getByText(/^今日待办 \(/)).toHaveCount(0);
    await page.getByRole('button', { name: /^查看后续安排/ }).click();
    await expect(page.getByLabel(`任务：${taskTitle}，重复`).first()).toBeVisible();
  });
});
