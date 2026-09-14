import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const widths = [320, 390, 768, 1440] as const;

test.describe('Web authentication accessibility matrix', () => {
  for (const width of widths) {
    test(`has no axe violations and keeps the auth shell usable at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/login');
      await expect(page.getByRole('main')).toBeVisible();
      await expect(page.getByRole('button', { name: '登录' })).toBeVisible();
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
      await expect(page.getByRole('button', { name: '登录' })).toBeInViewport();
      await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
    });
  }

  test('has no axe violations across registration and profile states', async ({ context, page }) => {
    test.setTimeout(60_000);
    const publicStates = [
      { path: '/register', width: 320 },
      { path: '/register', width: 390 },
      { path: '/register', width: 768 },
      { path: '/register', width: 1440 },
    ] as const;

    for (const state of publicStates) {
      await page.setViewportSize({ width: state.width, height: 900 });
      await page.goto(state.path);
      await expect(page.getByRole('heading').first()).toBeVisible();
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations, `${state.path} at ${state.width}px`).toEqual([]);
      await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
    }

    await context.route('**/api/v1/auth/refresh', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accessToken: 'accessibility-access' }),
      }),
    );
    await context.route('**/api/v1/users/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'accessibility-user',
          username: 'family-member',
          email: '',
          displayName: '家庭成员',
          emailVerified: false,
          hasHousehold: false,
        }),
      }),
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: '个人资料' })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole('button', { name: '退出登录' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('follows visual keyboard order and moves focus to the first invalid field', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('用户名', { exact: true }).fill('family-member');
    await page.getByLabel('密码', { exact: true }).fill('12345678');
    await page.getByLabel('确认密码', { exact: true }).fill('12345678');
    await page.getByLabel('用户名', { exact: true }).focus();
    const focusedLabels: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      focusedLabels.push(
        await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent ?? ''),
      );
      await page.keyboard.press('Tab');
    }
    expect(focusedLabels.join(' ')).toMatch(/用户名.*密码.*确认密码/s);
    await page.getByLabel('用户名', { exact: true }).fill('');
    await page.getByRole('button', { name: '创建账户' }).click();
    await expect(page.getByLabel('用户名', { exact: true })).toBeFocused();
  });

  test('exposes failed login feedback through an accessible live region', async ({ context, page }) => {
    await context.route('**/api/v1/auth/login', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'INVALID_CREDENTIALS' } }),
      }),
    );
    await page.goto('/login');
    await page.getByLabel('用户名', { exact: true }).fill('family-member');
    await page.getByLabel('密码', { exact: true }).fill('incorrect password');
    await page.getByRole('button', { name: '登录' }).click();
    await expect(page.getByRole('alert')).toContainText(/用户名|密码/);
    await expect(page.getByRole('alert')).toHaveAttribute('aria-live', /polite|assertive/);
  });

  test('retains primary actions, errors, and usernames at 200% zoom', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('/register');
    await page.evaluate(() => {
      document.documentElement.style.zoom = '2';
    });
    await page.getByRole('button', { name: '创建账户' }).click();
    await expect(page.getByRole('button', { name: '创建账户' })).toBeVisible();
    await expect(page.getByText(/用户名至少|请输入|必填/).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test('removes translation and shortens opacity transitions when reduced motion is requested', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/login');
    const shell = page.locator('[data-testid="auth-shell"]');
    await expect(shell).toHaveCSS('transform', 'none');
    const duration = await shell.evaluate((element) => Number.parseFloat(getComputedStyle(element).transitionDuration) || 0);
    expect(duration).toBeLessThanOrEqual(0.1);
  });

  test('hides decoration and preserves visible keyboard focus in forced colors', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await page.goto('/login');
    await expect(page.locator('[data-testid="auth-decoration"]')).toBeHidden();
    await page.getByLabel('用户名', { exact: true }).focus();
    const outline = await page.getByLabel('用户名', { exact: true }).evaluate((element) => getComputedStyle(element).outlineStyle);
    expect(outline).not.toBe('none');
  });
});
