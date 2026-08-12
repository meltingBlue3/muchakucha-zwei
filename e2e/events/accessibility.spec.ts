import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { Client } from 'pg';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:3000';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:8081';
const DATABASE_URL = process.env.DATABASE_URL ??
  'postgresql://muchakucha_test:muchakucha_test_only@127.0.0.1:5432/muchakucha_test';
const password = 'correct horse battery staple 2026';

type Fixture = { accessToken: string; email: string; eventId: string; householdId: string; title: string };

async function prepareFixture(): Promise<Fixture> {
  const email = `event-a11y-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  const database = new Client({ connectionString: DATABASE_URL });
  await database.connect();
  try {
    const registered = await fetch(`${API_ORIGIN}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({ email, displayName: '事件无障碍用户', password, platform: 'web' }),
    });
    expect(registered.status).toBe(202);
    await database.query(
      `UPDATE "User" SET "email_verified_at" = now() WHERE "email_canonical" = lower($1)`,
      [email],
    );
  } finally {
    await database.end();
  }

  const loggedIn = await fetch(`${API_ORIGIN}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
    body: JSON.stringify({ email, password, platform: 'web' }),
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
  return { accessToken, email, eventId, householdId, title };
}

async function loginViaPage(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

async function openCalendar(page: Page) {
  await page.getByLabel('打开家庭日历').click();
  await expect(page.getByRole('main', { name: '家庭日历' })).toBeVisible();
}

async function openNewEvent(page: Page) {
  await openCalendar(page);
  await page.getByLabel('创建事件').click();
  await expect(page.getByRole('main', { name: '创建事件' })).toBeVisible();
}

async function openEventDetail(page: Page, fixture: Fixture) {
  await openCalendar(page);
  const day = Number(new Date().toISOString().slice(8, 10));
  await page.getByLabel(new RegExp(`^${day}日，\\d+个事件$`)).click();
  await page.getByLabel(`事件：${fixture.title}，重复`).click();
  await expect(page.getByRole('main', { name: '事件详情' })).toBeVisible();
}

async function openEventEdit(page: Page, fixture: Fixture) {
  await openEventDetail(page, fixture);
  await page.getByLabel('编辑事件').click();
  await expect(page.getByRole('main', { name: '编辑事件' })).toBeVisible();
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
    await loginViaPage(page, fixture.email);
    await openCalendar(page);
    await expectNoSeriousAxeViolations(page);
    await page.getByLabel('创建事件').click();
    await expectNoSeriousAxeViolations(page);
    await page.getByLabel('取消').click();
    const day = Number(new Date().toISOString().slice(8, 10));
    await page.getByLabel(new RegExp(`^${day}日，\\d+个事件$`)).click();
    await page.getByLabel(`事件：${fixture.title}，重复`).click();
    await expectNoSeriousAxeViolations(page);
    await page.getByLabel('编辑事件').click();
    await expectNoSeriousAxeViolations(page);
  });

  test('supports keyboard traversal and directional radio selection', async ({ page }) => {
    await loginViaPage(page, fixture.email);
    await openNewEvent(page);
    await page.getByLabel('事件标题').focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('switch')).toBeFocused();
    await page.getByLabel('不重复', { exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByLabel('每天', { exact: true })).toBeChecked();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByLabel('每周', { exact: true })).toBeChecked();
    await expect(page.getByRole('radiogroup', { name: '重复频率' })).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(7);
  });

  test('keeps the last weekday selected and announces the constraint', async ({ page }) => {
    await loginViaPage(page, fixture.email);
    await openNewEvent(page);
    await page.getByLabel('每周', { exact: true }).click();
    const selectedLabel = await page.getByRole('checkbox').evaluateAll((nodes) =>
      nodes.find((node) => node.getAttribute('aria-checked') === 'true')?.getAttribute('aria-label'),
    );
    expect(selectedLabel).toBeTruthy();
    await page.getByLabel(selectedLabel!).click();
    await expect(page.getByLabel(selectedLabel!)).toBeChecked();
    await expect(page.getByText('至少需要选择一天。')).toHaveAttribute('aria-live', 'polite');
  });

  test('traps focus in SeriesScopeSheet, closes on Escape, and returns focus', async ({ page }) => {
    await loginViaPage(page, fixture.email);
    await openEventEdit(page, fixture);
    const deleteTrigger = page.getByLabel('删除事件');
    await deleteTrigger.click();
    const dialog = page.getByRole('dialog', { name: '删除这次重复？' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('取消')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByLabel('仅此一次')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(deleteTrigger).toBeFocused();
  });

  test('remains usable at 200% zoom without horizontal overflow or inert weekday chips', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await loginViaPage(page, fixture.email);
    await openNewEvent(page);
    await page.getByLabel('每周', { exact: true }).click();
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const uncheckedLabel = await page.getByRole('checkbox').evaluateAll((nodes) =>
      nodes.find((node) => node.getAttribute('aria-checked') !== 'true')?.getAttribute('aria-label'),
    );
    const weekday = page.getByLabel(uncheckedLabel!);
    await expect(weekday).toBeVisible();
    const before = await weekday.getAttribute('aria-checked');
    await weekday.click();
    await expect(weekday).not.toHaveAttribute('aria-checked', before!);
  });
});
