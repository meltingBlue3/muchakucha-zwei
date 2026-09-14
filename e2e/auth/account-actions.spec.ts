import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:3000';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:8081';
const password = 'correct horse battery staple 2026';

function uniqueUsername(): string {
  return `account_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`;
}

async function registerAndLogin(page: Page): Promise<string> {
  const username = uniqueUsername();
  await page.goto('/register');
  await page.getByLabel('用户名', { exact: true }).fill(username);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByLabel('确认密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '创建账户' }).click();
  await expect(page).toHaveURL(/\/household-handoff/);
  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: '个人资料' })).toBeVisible();
  return username;
}

async function login(context: BrowserContext, username: string): Promise<Page> {
  const response = await context.request.post(`${API_ORIGIN}/api/v1/auth/login`, {
    data: { username, password, platform: 'web' },
    headers: { origin: WEB_ORIGIN },
  });
  expect(response.status()).toBe(200);
  const page = await context.newPage();
  await page.goto('/profile');
  await expect(page).toHaveURL(/\/profile/);
  return page;
}

test.describe('Authenticated account actions', () => {
  test('updates the current nickname independently of the username and permits shared nicknames', async ({ page, request }) => {
    const duplicateName = '可重复的家庭昵称';
    const duplicate = await request.post(`${API_ORIGIN}/api/v1/auth/register`, {
      data: { username: uniqueUsername(), password, confirmPassword: password, platform: 'web' },
      headers: { origin: WEB_ORIGIN },
    });
    expect(duplicate.status()).toBe(202);
    const { accessToken } = await duplicate.json() as { accessToken: string };
    const renamed = await request.patch(`${API_ORIGIN}/api/v1/users/me`, {
      data: { displayName: duplicateName },
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(renamed.status()).toBe(200);

    const username = await registerAndLogin(page);
    const nickname = page.getByLabel('昵称');
    await expect(nickname).toHaveValue(username);
    await nickname.fill(duplicateName);
    await page.getByRole('button', { name: '保存昵称' }).click();
    await expect(page.getByRole('status')).toHaveText('昵称已更新。');
    await page.reload();
    await expect(page).toHaveURL(/\/profile/);
    await expect(page.getByLabel('昵称')).toHaveValue(duplicateName);
    await expect(page.getByText(username, { exact: true })).toBeVisible();
  });

  test('logs out only the current browser while a second device stays authenticated', async ({ browser, page }) => {
    const username = await registerAndLogin(page);
    const secondDevice = await browser.newContext();
    try {
      const secondPage = await login(secondDevice, username);
      await expect(secondPage.getByRole('heading', { name: '个人资料' })).toBeVisible();
      await page.getByRole('button', { name: '退出登录' }).click();
      await expect(page.getByRole('dialog')).toContainText('退出这台设备？');
      await page.getByRole('dialog').getByRole('button', { name: '确认退出登录', exact: true }).click();
      await expect(page).toHaveURL(/\/login/);
      await page.reload();
      await expect(page).toHaveURL(/\/login/);
      await secondPage.reload();
      await expect(secondPage).toHaveURL(/\/profile/);
      await expect(secondPage.getByRole('heading', { name: '个人资料' })).toBeVisible();
    } finally {
      await secondDevice.close();
    }
  });
});
