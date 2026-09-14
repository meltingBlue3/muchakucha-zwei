import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { Client } from 'pg';

import { loginEmailFixture } from '../support/auth';

// Same three constants, same defaults, and the same test-only database as
// `e2e/events/recurrence.spec.ts`. Introducing a second source for the
// connection string is exactly how an E2E suite ends up pointed at something
// that is not a test database (T-07-49), so this is copied verbatim rather
// than refactored.
const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:3000';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:8081';
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://muchakucha_test:muchakucha_test_only@127.0.0.1:5432/muchakucha_test';
const password = 'correct horse battery staple 2026';

// The browser and this Node process share one machine, so one timezone makes
// the materializer's "today" and the rendered "today" the same calendar day.
const LOCAL_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

const DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'] as const;

// D-19: no generation copy may name a fixed number of days. This is the
// negative shape the rendered page must never contain.
const DAY_COUNT_PATTERN = /\d+\s*天/;

// 07-UI-SPEC.md lines 636-641, byte for byte.
const END_ACTION = '结束此重复';
const END_CONFIRM_PROMPT = '确定结束？明天起不再重复，今天和之前的安排都保留。';
const END_CONFIRM_ACTION = '确认结束';
const ENDED_ROW_LINE = '这个重复已经结束';
const ENDED_DETAIL_NOTE = '这个重复已经结束了。';

type ApiResult<T = any> = { status: number; body: T };
type TestAccount = { email: string; accessToken: string; userId: string };
type RuleListItem = {
  id: string;
  kind: 'task' | 'event' | null;
  title: string;
  nextOccurrenceDate: string | null;
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** The browser-local calendar date `offsetDays` from now, as `YYYY-MM-DD`. */
function localIsoDate(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localWeekday(offsetDays = 0): number {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.getDay();
}

/** Mirrors `formatRecurrenceSummary` for the two frequencies used here. */
function weeklySummary(weekday: number): string {
  return `每周${DAY_NAMES[weekday]}重复`;
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
    const email = `recurrence-rules-${seed}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
    const registerResponse = await fetch(`${API_ORIGIN}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({ email, displayName: '周期规则测试', password, platform: 'web' }),
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

async function createHousehold(accessToken: string, name: string): Promise<string> {
  const result = await apiCall<{ id: string }>(accessToken, 'POST', '/api/v1/households', { name });
  expect(result.status).toBe(201);
  return result.body.id;
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

async function listRules(accessToken: string, householdId: string): Promise<RuleListItem[]> {
  const result = await apiCall<{ rules: RuleListItem[] }>(
    accessToken,
    'GET',
    `/api/v1/households/${householdId}/recurrence-rules`,
  );
  expect(result.status).toBe(200);
  return result.body.rules;
}

/** A daily rule anchored on today: its only materialized row is today's (D-11/D-12). */
async function createDailyTaskRule(
  accessToken: string,
  householdId: string,
  title: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const today = localIsoDate(0);
  const result = await apiCall<{ recurrenceRuleId: string }>(
    accessToken,
    'POST',
    `/api/v1/households/${householdId}/tasks`,
    {
      title,
      recurrence: {
        freq: 'daily',
        interval: 1,
        startsOn: today,
        timezone: LOCAL_TIMEZONE,
        ...extra,
      },
    },
  );
  expect(result.status).toBe(201);
  return result.body.recurrenceRuleId;
}

/** A weekly event rule whose first (and only materialized) occurrence is tomorrow. */
async function createWeeklyEventRule(
  accessToken: string,
  householdId: string,
  title: string,
): Promise<string> {
  const tomorrow = localIsoDate(1);
  const result = await apiCall<{ recurrenceRuleId: string }>(
    accessToken,
    'POST',
    `/api/v1/households/${householdId}/events`,
    {
      title,
      startTime: `${tomorrow}T09:00:00.000Z`,
      endTime: `${tomorrow}T10:00:00.000Z`,
      recurrence: {
        freq: 'weekly',
        interval: 1,
        byWeekday: [localWeekday(1)],
        startsOn: tomorrow,
        timezone: LOCAL_TIMEZONE,
      },
    },
  );
  expect(result.status).toBe(201);
  return result.body.recurrenceRuleId;
}

async function loginFixture(page: Page, email: string): Promise<void> {
  await loginEmailFixture(page, email, password);
}

async function openTaskList(page: Page, householdId: string): Promise<void> {
  await page.goto(`/households/${householdId}`);
  await page.getByRole('tab', { name: '任务', exact: true }).click();
  await expect(page.getByRole('main', { name: '家庭任务' })).toBeVisible();
}

// Expo Router keeps the pushed-from screen mounted, so the rule list and the
// rule detail are in the DOM at the same time and share several strings
// (`下一次 …`, `这个重复已经结束`). Every assertion below is scoped to one of
// these two regions rather than to the page.
function ruleListScreen(page: Page) {
  return page.getByRole('main', { name: '周期规则', exact: true });
}

function ruleDetailScreen(page: Page) {
  return page.getByRole('main', { name: '周期规则详情', exact: true });
}

async function openRuleList(page: Page, householdId: string): Promise<void> {
  await page.goto(`/households/${householdId}`);
  await page.getByRole('tab', { name: '家庭', exact: true }).click();
  await page.getByLabel('管理周期规则').click();
  await expect(ruleListScreen(page)).toBeVisible();
}

async function expectNoSeriousAxeViolations(page: Page): Promise<void> {
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(
    results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? '')),
  ).toEqual([]);
}

/** The filter toggle's live count, read from its accessible name (0 when absent). */
async function activeFilterCount(page: Page): Promise<number> {
  const label = (await page.getByLabel(/^筛选任务/).getAttribute('aria-label')) ?? '';
  const match = /已选择 (\d+) 项/.exec(label);
  return match === null ? 0 : Number(match[1]);
}

test.describe('recurrence rule addendum journeys', () => {
  test('materializes only today for a daily rule and never states a fixed day count', async ({ page }) => {
    const account = await prepareVerifiedAccount('lookahead');
    const householdId = await createHousehold(account.accessToken, '生成时机之家');
    const today = localIsoDate(0);
    const title = `每日打卡-${Date.now()}`;

    // `count: 5` is the point of the fixture: before D-11/D-12 a create would
    // have materialized all five rows up front. The per-frequency lookahead
    // for `daily` is 0 days, so creation is one standard generation pass that
    // reaches today and stops.
    await createDailyTaskRule(account.accessToken, householdId, title, { count: 5 });

    const materialized = (await listTasks(account.accessToken, householdId))
      .filter((task) => task.title === title);
    expect(materialized).toHaveLength(1);
    expect(materialized[0].occurrenceDate).toBe(today);

    await loginFixture(page, account.email);
    await openTaskList(page, householdId);

    // The user-visible half of the same fact: one row, not a batch.
    await expect(page.getByLabel(`任务：${title}，重复`)).toHaveCount(1);

    // D-19: the generation copy explains *when* things appear, never "in N
    // days". A regression that reintroduces a hardcoded horizon lands here.
    await expect(page.getByText(DAY_COUNT_PATTERN)).toHaveCount(0);
  });

  test('filters the task list down to recurring instances and counts the filter', async ({ page }) => {
    const account = await prepareVerifiedAccount('filter');
    const householdId = await createHousehold(account.accessToken, '周期筛选之家');
    const recurringTitle = `周期任务-${Date.now()}`;
    const plainTitle = `一次性任务-${Date.now()}`;

    await createDailyTaskRule(account.accessToken, householdId, recurringTitle);
    const plain = await apiCall(account.accessToken, 'POST', `/api/v1/households/${householdId}/tasks`, {
      title: plainTitle,
      dueDate: `${localIsoDate(0)}T00:00:00.000Z`,
    });
    expect(plain.status).toBe(201);

    await loginFixture(page, account.email);
    await openTaskList(page, householdId);
    await expect(page.getByLabel(`任务：${recurringTitle}，重复`)).toBeVisible();
    await expect(page.getByLabel(`任务：${plainTitle}`)).toBeVisible();

    const before = await activeFilterCount(page);
    await page.getByLabel(/^筛选任务/).click();

    // D-15 / addendum a11y contract: the two options are one radio group, not
    // a pair of unrelated toggles.
    const group = page.getByRole('radiogroup', { name: '重复筛选' });
    await expect(group).toBeVisible();

    await group.getByLabel('重复筛选：仅看周期性').click();
    await expect(page.getByLabel(`任务：${plainTitle}`)).toHaveCount(0);
    await expect(page.getByLabel(`任务：${recurringTitle}，重复`)).toBeVisible();

    const after = await activeFilterCount(page);
    expect(after).toBe(before + 1);
    await expect(page.getByLabel(/^筛选任务/).getByText(String(after), { exact: true })).toBeVisible();

    await group.getByLabel('重复筛选：全部').click();
    await expect(page.getByLabel(`任务：${plainTitle}`)).toBeVisible();
    await expect(page.getByLabel(`任务：${recurringTitle}，重复`)).toBeVisible();
    expect(await activeFilterCount(page)).toBe(before);
  });

  test('manages merged rules and ends one without touching today', async ({ page }) => {
    const account = await prepareVerifiedAccount('manage');
    const householdId = await createHousehold(account.accessToken, '周期规则之家');
    const today = localIsoDate(0);
    const tomorrow = localIsoDate(1);
    const taskTitle = `每日站会-${Date.now()}`;
    const eventTitle = `明日例会-${Date.now()}`;

    const taskRuleId = await createDailyTaskRule(account.accessToken, householdId, taskTitle);
    const eventRuleId = await createWeeklyEventRule(account.accessToken, householdId, eventTitle);

    const taskSummary = '每天重复，永不结束';
    const eventSummary = `${weeklySummary(localWeekday(1))}，永不结束`;

    await loginFixture(page, account.email);
    await openRuleList(page, householdId);

    const list = ruleListScreen(page);
    const detail = ruleDetailScreen(page);

    // D-20: one merged list. Both rows carry the type in *text*, the frequency
    // summary, and the server-computed next occurrence.
    const taskRow = list.getByLabel(`任务周期规则：${taskTitle}，${taskSummary}`);
    await expect(taskRow).toBeVisible();
    await expect(taskRow.getByText('任务', { exact: true })).toBeVisible();
    await expect(taskRow.getByText(taskSummary, { exact: true })).toBeVisible();
    await expect(taskRow.getByText(`下一次 ${today}`, { exact: true })).toBeVisible();

    const eventRow = list.getByLabel(`事件周期规则：${eventTitle}，${eventSummary}`);
    await expect(eventRow).toBeVisible();
    await expect(eventRow.getByText('事件', { exact: true })).toBeVisible();
    await expect(eventRow.getByText(`下一次 ${tomorrow}`, { exact: true })).toBeVisible();

    // --- Ending the event rule: two-step confirm, zero writes before it ---
    await eventRow.click();
    await expect(detail).toBeVisible();
    await expect(detail.getByRole('heading', { name: eventTitle, exact: true })).toBeVisible();

    const endTrigger = detail.getByLabel(END_ACTION);
    await expect(endTrigger).toBeVisible();
    // Nothing has been written: the screen still shows the original next
    // occurrence, and so does the server.
    await expect(detail.getByText(`下一次 ${tomorrow}`, { exact: true })).toBeVisible();
    expect((await listRules(account.accessToken, householdId))
      .find((rule) => rule.id === eventRuleId)?.nextOccurrenceDate).toBe(tomorrow);

    await endTrigger.click();
    await expect(detail.getByText(END_CONFIRM_PROMPT, { exact: true })).toBeVisible();
    // Still nothing: opening the confirm row is not the write (T-07-48).
    expect((await listRules(account.accessToken, householdId))
      .find((rule) => rule.id === eventRuleId)?.nextOccurrenceDate).toBe(tomorrow);

    await detail.getByLabel(END_CONFIRM_ACTION).click();
    await expect(page).toHaveURL(new RegExp(`/households/${householdId}/recurrence-rules$`));

    // D-14: "结束" is not "删除" — the rule stays in the list and says so in
    // words, so opacity is never the only signal.
    await expect(list.getByText(eventTitle, { exact: true })).toBeVisible();
    await expect(list.getByText(ENDED_ROW_LINE, { exact: true })).toBeVisible();

    // --- Ending the daily rule: today's occurrence must survive ---
    await taskRow.click();
    await expect(detail).toBeVisible();
    await detail.getByLabel(END_ACTION).click();
    await expect(detail.getByText(END_CONFIRM_PROMPT, { exact: true })).toBeVisible();
    await detail.getByLabel(END_CONFIRM_ACTION).click();
    await expect(page).toHaveURL(new RegExp(`/households/${householdId}/recurrence-rules$`));

    // Both rules are now visibly ended. The API still includes today's date
    // in the daily rule's walk, and its existing task must remain available.
    await expect(list.getByText(ENDED_ROW_LINE, { exact: true })).toHaveCount(2);
    expect((await listRules(account.accessToken, householdId))
      .find((rule) => rule.id === taskRuleId)?.nextOccurrenceDate).toBe(today);

    // The D-14 anchor guard. Move the anchor from tomorrow to today and this
    // row disappears, which is exactly the failure this assertion exists for.
    await openTaskList(page, householdId);
    await expect(page.getByLabel(`任务：${taskTitle}，重复`)).toHaveCount(1);
    const survivors = (await listTasks(account.accessToken, householdId))
      .filter((task) => task.title === taskTitle);
    expect(survivors.map((task) => task.occurrenceDate)).toEqual([today]);
  });

  test('keeps both new screens accessible by axe, keyboard, and words', async ({ page }) => {
    const account = await prepareVerifiedAccount('a11y');
    const householdId = await createHousehold(account.accessToken, '周期规则无障碍之家');
    const activeTitle = `无障碍每日规则-${Date.now()}`;
    const endedTitle = `无障碍已结束规则-${Date.now()}`;

    await createDailyTaskRule(account.accessToken, householdId, activeTitle);
    const endedRuleId = await createWeeklyEventRule(account.accessToken, householdId, endedTitle);
    const ended = await apiCall(
      account.accessToken,
      'POST',
      `/api/v1/households/${householdId}/recurrence-rules/${endedRuleId}/end`,
    );
    expect(ended.status).toBe(204);

    await loginFixture(page, account.email);
    await openRuleList(page, householdId);
    const list = ruleListScreen(page);
    const detail = ruleDetailScreen(page);
    await expect(list.getByText(ENDED_ROW_LINE, { exact: true })).toBeVisible();
    await expectNoSeriousAxeViolations(page);

    // Detail of the still-running rule: axe, then the two-step confirm's
    // keyboard contract — 确认 and 取消 follow the trigger in DOM order, so
    // Tab reaches them directly without hunting elsewhere on the page.
    await list.getByLabel(`任务周期规则：${activeTitle}，每天重复，永不结束`).click();
    await expect(detail).toBeVisible();
    await expectNoSeriousAxeViolations(page);

    const endTrigger = detail.getByLabel(END_ACTION);
    await endTrigger.focus();
    await expect(endTrigger).toBeFocused();
    await endTrigger.click();
    await expect(detail.getByText(END_CONFIRM_PROMPT, { exact: true })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(detail.getByLabel(END_CONFIRM_ACTION)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(detail.getByLabel('取消')).toBeFocused();
    await detail.getByLabel('取消').click();
    await expect(detail.getByText(END_CONFIRM_PROMPT, { exact: true })).toHaveCount(0);

    // The ended rule's detail: the state is carried by words plus
    // `aria-disabled` on every write entry point, never by opacity alone.
    await openRuleList(page, householdId);
    await list.getByLabel(new RegExp(`周期规则：${endedTitle}，`)).click();
    await expect(detail).toBeVisible();
    await expect(detail.getByText(ENDED_DETAIL_NOTE, { exact: true })).toBeVisible();
    await expect(detail.getByLabel(END_ACTION)).toHaveAttribute('aria-disabled', 'true');
    await expect(detail.getByLabel('保存更改')).toHaveAttribute('aria-disabled', 'true');
  });
});
