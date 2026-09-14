import { expect, test, type Page } from '@playwright/test';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:3000';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:8081';
const password = '12345678';

function uniqueUsername(): string {
  return `家庭_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`;
}

async function fillRegistration(page: Page, username: string, confirmation = password): Promise<void> {
  await page.getByLabel('用户名', { exact: true }).fill(username);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByLabel('确认密码', { exact: true }).fill(confirmation);
}

test.describe('Web username registration journey', () => {
  test('registers, signs in immediately, restores after reload, and logs in again after logout', async ({ context, page }) => {
    const username = uniqueUsername();
    await page.goto('/register');
    await expect(page.getByRole('textbox')).toHaveCount(3);
    await fillRegistration(page, username);
    const registered = page.waitForResponse((response) =>
      response.url().endsWith('/api/v1/auth/register') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: '创建账户' }).click();
    const response = await registered;
    expect(response.status()).toBe(202);
    expect(response.request().postDataJSON()).toEqual({ username, password, confirmPassword: password, platform: 'web' });
    expect(await response.json()).toEqual({ code: 'REGISTRATION_ACCEPTED', accessToken: expect.any(String) });
    await expect(page).toHaveURL(/\/household-handoff/);

    const refreshCookies = (await context.cookies()).filter((cookie) => /refresh/i.test(cookie.name));
    expect(refreshCookies).toHaveLength(1);
    expect(refreshCookies[0]?.httpOnly).toBe(true);
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toMatch(/refresh|token/i);

    await page.reload();
    await expect(page.getByRole('heading', { name: '开始设置你的家庭' })).toBeVisible();
    await page.goto('/profile');
    await expect(page.getByText(username, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '退出登录' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '确认退出登录', exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.reload();
    await expect(page).toHaveURL(/\/login/);
    expect((await context.cookies()).filter((cookie) => /refresh/i.test(cookie.name))).toHaveLength(0);

    await page.getByLabel('用户名', { exact: true }).fill(username);
    await page.getByLabel('密码', { exact: true }).fill(password);
    await page.getByRole('button', { name: '登录' }).click();
    await expect(page).toHaveURL(/\/household-handoff/);
  });

  test('reports a duplicate username without authenticating the rejected registration', async ({ page, request }) => {
    const username = uniqueUsername();
    const initial = await request.post(`${API_ORIGIN}/api/v1/auth/register`, {
      headers: { origin: WEB_ORIGIN },
      data: { username, password, confirmPassword: password, platform: 'web' },
    });
    expect(initial.status()).toBe(202);
    await page.goto('/register');
    await fillRegistration(page, username);
    const rejected = page.waitForResponse((response) =>
      response.url().endsWith('/api/v1/auth/register') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: '创建账户' }).click();
    expect((await rejected).status()).toBe(409);
    await expect(page.getByText(/用户名.*(已被使用|已存在|已被占用|已注册)/)).toBeVisible();
    await expect(page).toHaveURL(/\/register/);
    expect((await page.context().cookies()).filter((cookie) => /refresh/i.test(cookie.name))).toHaveLength(0);
  });

  test('focuses a mismatched password confirmation without submitting the registration', async ({ page }) => {
    const submissions: string[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith('/api/v1/auth/register') && request.method() === 'POST') submissions.push(request.url());
    });
    await page.goto('/register');
    await fillRegistration(page, uniqueUsername(), 'different password');
    await page.getByRole('button', { name: '创建账户' }).click();
    await expect(page.getByText(/两次.*密码.*不一致|密码不一致/)).toBeVisible();
    await expect(page.getByLabel('确认密码', { exact: true })).toBeFocused();
    expect(submissions).toEqual([]);
    await expect(page).toHaveURL(/\/register/);
  });

  test('keeps password-manager, paste, and reveal behavior available', async ({ page }) => {
    await page.goto('/register');
    const username = page.getByLabel('用户名', { exact: true });
    const passwordField = page.getByLabel('密码', { exact: true });
    const confirmation = page.getByLabel('确认密码', { exact: true });
    await expect(username).toHaveAttribute('autocomplete', 'username');
    await expect(passwordField).toHaveAttribute('autocomplete', 'new-password');
    await expect(confirmation).toHaveAttribute('autocomplete', 'new-password');
    await passwordField.fill('pasted password value');
    await page.getByRole('button', { name: '显示密码', exact: true }).first().click();
    await expect(passwordField).toHaveJSProperty('type', 'text');
    await expect(passwordField).toBeFocused();
    await confirmation.fill('pasted password value');
    await expect(confirmation).toHaveValue('pasted password value');
  });
});
