import { expect, test, type Page } from '@playwright/test';
import { Client } from 'pg';

import { describeLunarDay, lunarAnniversary } from '../../packages/lunar/src/index';
import { loginUsernameFixture } from '../support/auth';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:3000';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:8081';
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://muchakucha_test:muchakucha_test_only@127.0.0.1:5432/muchakucha_test';
const password = 'correct horse battery staple 2026';
const DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'] as const;

type TestAccount = { username: string; accessToken: string };
type RuleItem = { title: string; occasion: string | null; lunar: { month: number; day: number } | null; birthYear: number | null; startsOn: string; nextOccurrenceDate: string | null };

const pad = (value: number) => String(value).padStart(2, '0');
const isoOf = (date: { year: number; month: number; day: number }) => `${date.year}-${pad(date.month)}-${pad(date.day)}`;

function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The first lunar 十月十五 on or after today, and its lunar year. */
function nextTenthMonthFifteenth(): { date: string; lunarYear: number } {
  const today = localToday();
  const year = Number(today.slice(0, 4));
  for (const lunarYear of [year - 1, year, year + 1]) {
    const date = isoOf(lunarAnniversary(lunarYear, 10, 15)!);
    if (date >= today) return { date, lunarYear };
  }
  throw new Error('no lunar date found');
}

/** The first 12 月 4 日 on or after today. */
function nextDecemberFourth(): string {
  const today = localToday();
  const year = Number(today.slice(0, 4));
  return [`${year}-12-04`, `${year + 1}-12-04`].find(date => date >= today)!;
}

/** 「11月23日周一」, with the year when it is not this one, as the app formats dates. */
function shortDate(iso: string): string {
  const date = new Date(`${iso}T12:00:00`);
  const year = date.getFullYear() === new Date().getFullYear() ? '' : `${date.getFullYear()}年`;
  return `${year}${date.getMonth() + 1}月${date.getDate()}日周${DAY_NAMES[date.getDay()]}`;
}

async function prepareAccount(): Promise<TestAccount> {
  const database = new Client({ connectionString: DATABASE_URL });
  await database.connect();
  try {
    const username = `u-bday-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
    const registered = await fetch(`${API_ORIGIN}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({ username, confirmPassword: password, password, platform: 'web' }),
    });
    expect(registered.status).toBe(202);
    await database.query(`UPDATE "User" SET "display_name" = $2 WHERE "username_canonical" = lower($1)`, [username, '生日测试']);
    const login = await fetch(`${API_ORIGIN}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({ username, password, platform: 'web' }),
    });
    expect(login.status).toBe(200);
    return { username, accessToken: ((await login.json()) as { accessToken: string }).accessToken };
  } finally {
    await database.end();
  }
}

async function api<T>(token: string, method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: (await response.json()) as T };
}

async function startHousehold(page: Page): Promise<{ account: TestAccount; householdId: string }> {
  const account = await prepareAccount();
  const created = await api<{ id: string }>(account.accessToken, 'POST', '/api/v1/households', { name: '生日测试之家' });
  expect(created.status).toBe(201);
  await loginUsernameFixture(page, account.username, password, `/households/${created.body.id}/birthdays`);
  return { account, householdId: created.body.id };
}

/** Fills 添加生日 for 妈妈: lunar 十月十五, born 1968, and her Gregorian birthday too. */
async function addMomsBirthdays(page: Page) {
  await page.getByRole('button', { name: '添加生日' }).click();
  // The form is a side pane on a wide screen and a dialog on a phone; its date step takes the window's place and name.
  const role = (page.viewportSize()?.width ?? 0) >= 1024 ? 'region' as const : 'dialog' as const;
  const form = page.getByRole(role, { name: '添加生日' });
  await expect(form).toBeVisible();
  await form.getByLabel('谁的生日').fill('妈妈');
  await expect(form.getByRole('radio', { name: '按农历过生日' })).toBeChecked();
  await form.getByRole('button', { name: '生日日期，选择日期' }).click();
  const picker = page.getByRole(role, { name: '农历生日' });
  await picker.getByRole('radio', { name: '十月', exact: true }).click();
  await picker.getByRole('radio', { name: '十月十五' }).click();
  await picker.getByRole('button', { name: '完成' }).click();
  await expect(form.getByRole('button', { name: '生日日期，农历十月十五' })).toBeVisible();
  await form.getByLabel('出生年份').fill('1968');
  await expect(form.getByText('公历 1968年12月4日')).toBeVisible();
  await form.getByRole('switch', { name: '也过公历生日' }).click();
  await form.getByRole('button', { name: '保存' }).click();
  await expect(form).toBeHidden();
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test.describe(`at ${viewport.width}px`, () => {
    test.use({ viewport });

    test('one entry saves a lunar birthday and its Gregorian one, listed by the next date with ages', async ({ page }) => {
      const { account, householdId } = await startHousehold(page);
      await expect(page.getByText('记下家人的生日')).toBeVisible();
      await addMomsBirthdays(page);

      const lunar = nextTenthMonthFifteenth();
      const solar = nextDecemberFourth();
      const lunarAge = lunar.lunarYear - 1968;
      const solarAge = Number(solar.slice(0, 4)) - 1968;
      const lunarRow = page.getByRole('button', { name: new RegExp(`^妈妈的农历生日，农历十月十五 · ${shortDate(lunar.date)}，.*${lunarAge} 岁$`) });
      const solarRow = page.getByRole('button', { name: new RegExp(`^妈妈的生日，每年 12月4日 · ${shortDate(solar)}，.*${solarAge} 岁$`) });
      await expect(lunarRow).toBeVisible();
      await expect(solarRow).toBeVisible();
      // Soonest first.
      const lunarTop = (await lunarRow.boundingBox())!.y;
      const solarTop = (await solarRow.boundingBox())!.y;
      expect(lunarTop < solarTop).toBe(lunar.date < solar);

      // What the server stored: two yearly birthday series.
      const rules = await api<{ rules: RuleItem[] }>(account.accessToken, 'GET', `/api/v1/households/${householdId}/recurrence-rules`);
      expect(rules.body.rules.map(rule => [rule.title, rule.occasion, rule.lunar, rule.birthYear, rule.nextOccurrenceDate]).sort()).toEqual([
        ['妈妈的农历生日', 'birthday', { month: 10, day: 15 }, 1968, lunar.date],
        ['妈妈的生日', 'birthday', null, 1968, solar],
      ].sort());
    });
  });
}

test.describe('in the calendar', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('shows lunar dates until they are turned off, and a birthday with its lunar date and age', async ({ page }) => {
    const { householdId } = await startHousehold(page);
    await addMomsBirthdays(page);
    const lunar = nextTenthMonthFifteenth();

    await page.goto(`/households/${householdId}/events`);
    const grid = page.getByTestId('desktop-month-grid');
    const [year, month, day] = localToday().split('-').map(Number);
    const todayLabel = describeLunarDay({ year: year!, month: month!, day: day! })!;
    const pane = page.getByTestId('calendar-agenda-pane');
    await expect(pane.getByText(new RegExp(`^${todayLabel}`))).toBeVisible();
    // Every six-week grid holds plain lunar days such as 初二 … 初十.
    const lunarDays = (grid_: typeof grid) => grid_.getByText(/^初[二三四五六七八九十]$/);
    expect(await lunarDays(grid).count()).toBeGreaterThan(0);

    // Open the month of the lunar birthday and its day.
    const target = new Date(`${lunar.date}T12:00:00`);
    while (!(await page.getByText(`${target.getFullYear()}年${target.getMonth() + 1}月`, { exact: true }).isVisible())) {
      await page.getByRole('button', { name: '下一个月' }).click();
    }
    await grid.getByRole('button', { name: new RegExp(`^${target.getFullYear()}年${target.getMonth() + 1}月${target.getDate()}日`) }).click();
    await expect(pane.getByRole('button', { name: '日程：妈妈的农历生日', exact: true })).toBeVisible();
    await expect(pane.getByText(`全天 · 农历十月十五 · ${lunar.lunarYear - 1968} 岁`)).toBeVisible();

    // 设置 › 显示农历 turns the lunar dates off on this device.
    await page.goto('/settings');
    await page.getByRole('switch', { name: '显示农历' }).click();
    await page.goto(`/households/${householdId}/events`);
    await expect(page.getByTestId('desktop-month-grid')).toBeVisible();
    await expect(page.getByTestId('calendar-agenda-pane').getByText(new RegExp(`^${todayLabel}`))).toHaveCount(0);
    await expect(lunarDays(page.getByTestId('desktop-month-grid'))).toHaveCount(0);
  });
});
