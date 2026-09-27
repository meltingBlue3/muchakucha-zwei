import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { Client } from 'pg';

import { loginUsernameFixture } from '../support/auth';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:3000';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:8081';
const DATABASE_URL = process.env.DATABASE_URL ??
  'postgresql://muchakucha_test:muchakucha_test_only@127.0.0.1:5432/muchakucha_test';
const password = 'correct horse battery staple 2026';

type Fixture = { accessToken: string; username: string; eventId: string; householdId: string; title: string };

async function prepareFixture(): Promise<Fixture> {
  const username = `fixture-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
  const database = new Client({ connectionString: DATABASE_URL });
  await database.connect();
  try {
    const registered = await fetch(`${API_ORIGIN}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({ username, confirmPassword: password, password, platform: 'web' }),
    });
    expect(registered.status).toBe(202);
    await database.query(
      `UPDATE "User" SET "display_name" = $2 WHERE "username_canonical" = lower($1)`,
      [username, '事件无障碍用户'],
    );
  } finally {
    await database.end();
  }

  const loggedIn = await fetch(`${API_ORIGIN}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
    body: JSON.stringify({ username, password, platform: 'web' }),
  });
  expect(loggedIn.status).toBe(200);
  const { accessToken } = await loggedIn.json() as { accessToken: string };
  const household = await fetch(`${API_ORIGIN}/api/v1/households`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name: '事件无障碍家庭' }),
  });
  expect(household.status).toBe(201);
  const { id: householdId } = await household.json() as { id: string };
  const startsOn = new Date().toISOString().slice(0, 10);
  const title = `无障碍重复事件-${Date.now()}`;
  const event = await fetch(`${API_ORIGIN}/api/v1/households/${householdId}/events`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      title,
      startTime: `${startsOn}T09:00:00.000Z`,
      endTime: `${startsOn}T10:00:00.000Z`,
      recurrence: { freq: 'weekly', interval: 1, byWeekday: [new Date(`${startsOn}T12:00:00Z`).getUTCDay()], startsOn, count: 4, timezone: 'UTC' },
    }),
  });
  expect(event.status).toBe(201);
  const { id: eventId } = await event.json() as { id: string };
  return { accessToken, username, eventId, householdId, title };
}

async function loginFixture(page: Page, username: string) {
  await loginUsernameFixture(page, username, password);
}

async function openCalendar(page: Page) {
  await page.getByRole('tab', { name: '日历', exact: true }).click();
  await expect(page.getByRole('main', { name: '家庭日历' })).toBeVisible();
}

async function openNewEvent(page: Page) {
  await openCalendar(page);
  await page.getByLabel('创建日程').click();
  await expect(page.getByRole('dialog', { name: '创建日程' })).toBeVisible();
}

async function openCustomWeekly(page: Page) {
  await page.getByRole('button', { name: /^日程重复设置/ }).click();
  await page.getByRole('dialog', { name: '重复' }).getByRole('radio', { name: '自定义…' }).click();
  const custom = page.getByRole('dialog', { name: '自定义重复' });
  await custom.getByRole('radio', { name: '周', exact: true }).click();
  return custom;
}

async function openEventDetail(page: Page, fixture: Fixture) {
  await openCalendar(page);
  const day = Number(new Date().toISOString().slice(8, 10));
  await page.getByLabel(new RegExp(`^\\d{4}-\\d{2}-${String(day).padStart(2, '0')}(?:，今天)?，\\d+个日程$`)).click();
  await page.getByLabel(`日程：${fixture.title}，重复`).click();
  await expect(page.getByRole('dialog', { name: '日程详情' })).toBeVisible();
}

async function openEventEdit(page: Page, fixture: Fixture) {
  await openEventDetail(page, fixture);
  await page.getByLabel('编辑日程').click();
  await expect(page.getByRole('dialog', { name: '编辑日程' })).toBeVisible();
}

async function expectNoSeriousAxeViolations(page: Page) {
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([]);
}

test.describe('event recurrence accessibility', () => {
  let fixture: Fixture;

  test.beforeAll(async () => { fixture = await prepareFixture(); });

  test('has no serious axe violations on list, create, detail, and edit routes', async ({ page }) => {
    await loginFixture(page, fixture.username);
    await openCalendar(page);
    await expectNoSeriousAxeViolations(page);
    await page.getByLabel('创建日程').click();
    await expectNoSeriousAxeViolations(page);
    await page.getByLabel('取消').click();
    const day = Number(new Date().toISOString().slice(8, 10));
    await page.getByLabel(new RegExp(`^\\d{4}-\\d{2}-${String(day).padStart(2, '0')}(?:，今天)?，\\d+个日程$`)).click();
    await page.getByLabel(`日程：${fixture.title}，重复`).click();
    await expectNoSeriousAxeViolations(page);
    await page.getByLabel('编辑日程').click();
    await expectNoSeriousAxeViolations(page);
  });

  test('supports keyboard traversal and a Google-style repeat list', async ({ page }) => {
    await loginFixture(page, fixture.username);
    await openNewEvent(page);
    await page.getByLabel('日程标题').focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('switch')).toBeFocused();
    const repeat = page.getByRole('button', { name: /^日程重复设置/ });
    await expect(repeat).toHaveAccessibleName('日程重复设置，不重复');
    await repeat.focus();
    await page.keyboard.press('Enter');
    const options = page.getByRole('dialog', { name: '重复' });
    await expect(options.getByRole('radiogroup', { name: '重复频率' })).toBeVisible();
    await expect(options.getByRole('radio', { name: '不重复' })).toBeChecked();
    await options.getByRole('radio', { name: '不重复' }).focus();
    // Arrow keys only move focus: choosing an option closes the list.
    await page.keyboard.press('ArrowDown');
    await expect(options.getByRole('radio', { name: '每天' })).toBeFocused();
    await expect(options.getByRole('radio', { name: '不重复' })).toBeChecked();
    await page.keyboard.press('Enter');
    await expect(options).toHaveCount(0);
    await expect(repeat).toHaveAccessibleName('日程重复设置，每天重复');
    await expect(repeat).toBeFocused();
  });

  test('a custom weekly rule keeps at least one weekday', async ({ page }) => {
    await loginFixture(page, fixture.username);
    await openNewEvent(page);
    const custom = await openCustomWeekly(page);
    await expect(custom.getByRole('checkbox')).toHaveCount(7);
    const selectedLabel = await custom.getByRole('checkbox').evaluateAll((nodes) =>
      nodes.find((node) => node.getAttribute('aria-checked') === 'true')?.getAttribute('aria-label'),
    );
    expect(selectedLabel).toBeTruthy();
    await custom.getByLabel(selectedLabel!).click();
    await custom.getByRole('button', { name: '完成', exact: true }).click();
    await expect(custom.getByText('至少需要选择一天。')).toBeVisible();
    await expect(custom).toBeVisible();
  });

  test('card deletion scope stays in one window and Escape returns to the card', async ({ page }) => {
    await loginFixture(page, fixture.username);
    await page.goto(`/households/${fixture.householdId}/events`);
    const more = page.getByRole('button', { name: `更多操作：日程：${fixture.title}`, exact: true }).first();
    await more.click();
    await page.getByRole('menuitem', { name: `删除日程：${fixture.title}`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '删除日程', exact: true });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(dialog.getByRole('button', { name: '关闭删除日程' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(more).toBeFocused();
  });

  test('remains usable at 200% zoom without horizontal overflow or inert weekday chips', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await loginFixture(page, fixture.username);
    await openNewEvent(page);
    const custom = await openCustomWeekly(page);
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const uncheckedLabel = await custom.getByRole('checkbox').evaluateAll((nodes) =>
      nodes.find((node) => node.getAttribute('aria-checked') !== 'true')?.getAttribute('aria-label'),
    );
    const weekday = custom.getByLabel(uncheckedLabel!);
    await expect(weekday).toBeVisible();
    const before = await weekday.getAttribute('aria-checked');
    await weekday.click();
    await expect(weekday).not.toHaveAttribute('aria-checked', before!);
  });
});
