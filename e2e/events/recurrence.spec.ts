import { expect, test, type Page } from '@playwright/test';
import { Client } from 'pg';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:3000';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:8081';
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://muchakucha_test:muchakucha_test_only@127.0.0.1:5432/muchakucha_test';
const password = 'correct horse battery staple 2026';

type ApiResult<T = any> = { status: number; body: T };
type TestAccount = { email: string; accessToken: string; userId: string };

function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateAt(year: number, month: number, day: number): Date {
  return new Date(year, month, day, 9, 0, 0, 0);
}

function weekdayLabel(day: number): string {
  return `星期${['日', '一', '二', '三', '四', '五', '六'][day]}`;
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

async function prepareVerifiedAccount(seed: string): Promise<TestAccount> {
  return withDatabase(async (database) => {
    const email = `recurrence-${seed}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
    const registerResponse = await fetch(`${API_ORIGIN}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({ email, displayName: '重复旅程测试', password, platform: 'web' }),
    });
    expect(registerResponse.status).toBe(202);

    await database.query(
      `UPDATE "User" SET "email_verified_at" = now() WHERE "email_canonical" = lower($1)`,
      [email],
    );

    const loginResponse = await fetch(`${API_ORIGIN}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({ email, password, platform: 'web' }),
    });
    expect(loginResponse.status).toBe(200);
    const loginBody = (await loginResponse.json()) as { accessToken: string };
    const meResponse = await fetch(`${API_ORIGIN}/api/v1/users/me`, {
      headers: { authorization: `Bearer ${loginBody.accessToken}` },
    });
    expect(meResponse.status).toBe(200);
    const me = (await meResponse.json()) as { id: string };
    return { email, accessToken: loginBody.accessToken, userId: me.id };
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

async function loginViaPage(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).not.toHaveURL(/\/login$/);
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
  test('creates a weekly event in the Web form and presents every generated occurrence', async ({ page }) => {
    const account = await prepareVerifiedAccount('create');
    const householdId = await createHousehold(account.accessToken, '重复事件之家');
    const title = `每周家庭会-${Date.now()}`;
    const now = new Date();
    const start = dateAt(now.getFullYear(), now.getMonth(), 2);
    const startDate = toIsoDate(start);
    const monthStart = toIsoDate(dateAt(now.getFullYear(), now.getMonth(), 1));
    const monthEnd = toIsoDate(dateAt(now.getFullYear(), now.getMonth() + 1, 0));
    await loginViaPage(page, account.email);
    await page.getByLabel('打开家庭日历').click();
    await expect(page.getByLabel('创建事件')).toBeVisible();
    await page.getByLabel('创建事件').click();
    await expect(page.getByRole('main', { name: '创建事件' })).toBeVisible();
    await page.getByLabel('事件标题').fill(title);
    const startDateInput = page.getByLabel('开始日期');
    await startDateInput.fill(startDate);
    await startDateInput.press('Tab');
    await page.getByLabel('结束日期').fill(startDate);
    await page.getByLabel('结束日期').press('Tab');
    await page.getByLabel('开始时间').fill('09:00');
    await page.getByLabel('结束时间').fill('10:00');

    await page.getByLabel('每天', { exact: true }).click();
    await expect(page.getByLabel('每天', { exact: true })).toBeChecked();
    await page.getByLabel('每周', { exact: true }).click();
    await expect(page.getByLabel('每周', { exact: true })).toBeChecked();
    const defaultWeekday = await page.evaluate((value) => new Date(`${value}T12:00:00`).getDay(), startDate);
    const selectedWeekdays = [defaultWeekday, (defaultWeekday + 1) % 7, (defaultWeekday + 2) % 7];
    const checkedWeekdays = await page.getByRole('checkbox').evaluateAll((checkboxes) =>
      checkboxes
        .filter((checkbox) => checkbox.getAttribute('aria-checked') === 'true')
        .map((checkbox) => checkbox.getAttribute('aria-label')),
    );
    expect(checkedWeekdays).toEqual([weekdayLabel(selectedWeekdays[0]!)]);
    await page.getByLabel(weekdayLabel(selectedWeekdays[1]!)).click();
    await page.getByLabel(weekdayLabel(selectedWeekdays[2]!)).click();
    await page.getByLabel('重复次数', { exact: true }).first().click();
    await page.getByLabel('重复次数', { exact: true }).last().fill('4');
    await expect(page.getByLabel(/每周.*重复，共 4 次/)).toBeVisible();

    await page.getByLabel('创建', { exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/households/${householdId}/events$`));

    const occurrences = (await listEvents(account.accessToken, householdId, monthStart, monthEnd))
      .filter((event) => event.title === title);
    expect(occurrences).toHaveLength(4);
    for (const occurrence of occurrences) {
      const day = Number(String(occurrence.occurrenceDate).slice(-2));
      await page.getByLabel(new RegExp(`^${day}日，\\d+个事件$`)).click();
      await expect(page.getByLabel(`事件：${title}，重复`)).toBeVisible();
    }

    const detailOccurrence = occurrences[2]!;
    await page.getByLabel(new RegExp(`^${Number(String(detailOccurrence.occurrenceDate).slice(-2))}日，\\d+个事件$`)).click();
    await page.getByLabel(`事件：${title}，重复`).click();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.getByText('重复', { exact: true })).toBeVisible();
    await expect(page.getByText(/每周.*重复，共 4 次/)).toBeVisible();
  });

  test('splits an event only after scope selection and cancels one task occurrence', async ({ page }) => {
    const account = await prepareVerifiedAccount('scope');
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

    await loginViaPage(page, account.email);
    await page.getByLabel('打开家庭日历').click();
    await page.getByLabel(new RegExp(`^${Number(String(selected.occurrenceDate).slice(-2))}日，\\d+个事件$`)).click();
    await page.getByLabel(`事件：${eventTitle}，重复`).click();
    await page.getByLabel('编辑事件').click();
    await expect(page.getByRole('main', { name: '编辑事件' })).toBeVisible();
    await page.getByLabel(weekdayLabel(removedWeekday)).click();
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

    await dialog.getByLabel('此后所有').click();
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
      dueDate: `${today}T00:00:00.000Z`,
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
    await page.getByLabel('打开今日视图').click();
    await expect(page.getByRole('main', { name: '今日视图' })).toBeVisible();
    // Exactly one occurrence is due today, and it is in 今日待办 before the cancel —
    // this is the "before" half of the exclusion assertion, so the "after" half
    // below cannot pass vacuously.
    await expect(page.getByText('今日待办 (1)')).toBeVisible();

    // Reach the occurrence from the Today view. The overdue section is empty and
    // 今日待办 precedes the upcoming section, so this resolves to today's
    // occurrence even though every occurrence in the series shares one title.
    await page.getByLabel(`任务：${taskTitle}，重复`).first().click();
    await page.getByLabel('编辑任务').click();
    await page.getByLabel('删除任务').click();
    const deleteDialog = page.getByRole('dialog', { name: '删除这次重复？' });
    await expect(deleteDialog).toBeVisible();
    await expect(deleteDialog.getByLabel('取消')).toBeFocused();
    await deleteDialog.getByLabel('仅此一次').click();
    await expect(deleteDialog).toHaveCount(0);

    const afterCancel = (await listTasks(account.accessToken, householdId))
      .filter((task) => task.title === taskTitle);
    expect(afterCancel.find((task) => task.id === taskToCancel.id)?.status).toBe('cancelled');
    expect(afterCancel.filter((task) => task.id !== taskToCancel.id).every((task) => task.status === 'pending')).toBe(true);

    await page.goto(`/households/${householdId}`);
    await page.getByLabel('打开家庭任务').click();
    await expect(page).toHaveURL(new RegExp(`/households/${householdId}/tasks$`));
    await expect(page.getByText('已取消', { exact: true })).toBeVisible();

    await page.goto(`/households/${householdId}`);
    await page.getByLabel('打开今日视图').click();
    await expect(page.getByRole('main', { name: '今日视图' })).toBeVisible();
    // The cancelled occurrence is gone from 今日待办 — the section held only that
    // one task, so it disappears entirely. Its future siblings are untouched and
    // remain listed under the upcoming section.
    await expect(page.getByText(/^今日待办 \(/)).toHaveCount(0);
    await expect(page.getByLabel(`任务：${taskTitle}，重复`).first()).toBeVisible();
  });
});
