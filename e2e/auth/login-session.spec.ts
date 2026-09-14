import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const currentUser = {
  displayName: '家庭成员',
  username: 'family-member',
  email: '',
  emailVerified: false,
  hasHousehold: false,
  id: 'playwright-user',
};

async function mockCurrentUser(context: BrowserContext): Promise<void> {
  await context.route('**/api/v1/users/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentUser) }),
  );
}

async function waitForBootstrap(page: Page): Promise<void> {
  await expect(page.getByLabel('正在恢复登录状态')).toBeHidden();
}

test.describe('Web login and session restoration', () => {
  test.describe.configure({ mode: 'serial' });
  test('logs in a username account and restores it after a fresh page without Web-visible refresh material', async ({
    context,
    page,
  }) => {
    let authenticated = false;
    await mockCurrentUser(context);
    await context.route('**/api/v1/auth/login', async (route) => {
      expect(route.request().postDataJSON()).toEqual({
        username: 'family-member',
        password: 'correct horse battery staple 2026',
        platform: 'web',
      });
      authenticated = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'set-cookie': 'mucha_refresh=session; HttpOnly; Path=/api/v1/auth; SameSite=None' },
        body: JSON.stringify({ accessToken: 'login-access' }),
      });
    });
    await context.route('**/api/v1/auth/refresh', (route) =>
      route.fulfill({
        status: authenticated ? 200 : 401,
        contentType: 'application/json',
        body: authenticated
          ? JSON.stringify({ accessToken: 'restored-access' })
          : JSON.stringify({ error: { code: 'INVALID_REFRESH_TOKEN' } }),
      }),
    );

    await page.goto('/login?intended=%2Fprofile');
    await waitForBootstrap(page);
    await page.getByLabel('用户名', { exact: true }).fill('family-member');
    await page.getByLabel('密码', { exact: true }).fill('correct horse battery staple 2026');
    await page.getByRole('button', { name: '登录' }).click();
    await expect(page).toHaveURL(/\/profile/);

    const restored = await context.newPage();
    await restored.goto('/');
    await expect(restored).toHaveURL(/\/household-handoff/);
    const storage = await restored.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    expect(storage).not.toMatch(/refresh|token/i);
  });

  test('keeps the session during a restoration availability failure and offers offline retry', async ({ context, page }) => {
    await context.route('**/api/v1/auth/refresh', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
    );
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '暂时无法连接' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: '重试连接' })).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('clears a rejected session and preserves only a safe internal intended route', async ({ context, page }) => {
    await context.route('**/api/v1/auth/refresh', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'SESSION_REVOKED' } }),
      }),
    );
    await page.goto('/household-handoff');
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await expect(page.getByRole('alert')).toContainText(/登录|重新登录/);
    await expect(page).not.toHaveURL(/https?%3A|javascript%3A/i);
  });

  test('holds the branded splash until restoration resolves without flashing login', async ({ context, page }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await mockCurrentUser(context);
    await context.route('**/api/v1/auth/refresh', async (route) => {
      await gate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accessToken: 'restored-access' }),
      });
    });
    await page.goto('/', { waitUntil: 'commit' });
    await expect(page.getByLabel('正在恢复登录状态').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: '登录' })).toHaveCount(0);
    release();
    await expect(page).toHaveURL(/\/household-handoff/);
  });
});
