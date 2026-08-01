import { expect, test } from '@playwright/test';

test.describe('Web login and session restoration', () => {
  test('logs in a verified account and restores it after a fresh page without Web-visible refresh material', async ({
    context,
    page,
  }) => {
    throw new Error('IMPLEMENTATION_MISSING_SESSION_UI');
    await page.goto('/login');
    await page.getByLabel('邮箱').fill('verified-user@example.test');
    await page.getByLabel('密码', { exact: true }).fill('correct horse battery staple 2026');
    await page.getByRole('button', { name: '登录' }).click();
    await expect(page).toHaveURL(/\/household-handoff/);

    const restored = await context.newPage();
    await restored.goto('/');
    await expect(restored).toHaveURL(/\/household-handoff/);
    const storage = await restored.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    expect(storage).not.toMatch(/refresh|token/i);
  });

  test('keeps the session during timeout, DNS, and 5xx restoration failures and offers offline retry', async ({ page }) => {
    throw new Error('IMPLEMENTATION_MISSING_SESSION_UI');
    await page.route('**/api/v1/auth/refresh', (route) => route.abort('timedout'));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /离线|无法连接/ })).toBeVisible();
    await expect(page.getByRole('button', { name: '重试连接' })).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('clears a rejected session and preserves only a safe internal intended route', async ({ page }) => {
    throw new Error('IMPLEMENTATION_MISSING_SESSION_UI');
    await page.route('**/api/v1/auth/refresh', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: '{"code":"SESSION_REVOKED"}' }),
    );
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('alert')).toContainText(/会话|重新登录/);
    await expect(page).not.toHaveURL(/https?%3A|javascript%3A/i);
  });

  test('holds the branded splash until restoration resolves without flashing login', async ({ page }) => {
    throw new Error('IMPLEMENTATION_MISSING_SESSION_UI');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/api/v1/auth/refresh', async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto('/', { waitUntil: 'commit' });
    await expect(page.getByLabel(/正在恢复|正在加载/)).toBeVisible();
    await expect(page.getByRole('button', { name: '登录' })).toHaveCount(0);
    release();
  });
});
