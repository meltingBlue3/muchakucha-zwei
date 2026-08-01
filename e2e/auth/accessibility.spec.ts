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

  test('has no axe violations across delivered auth, result, and profile states', async ({ context, page }) => {
    test.setTimeout(60_000);
    const publicStates = [
      { path: '/register', width: 320 },
      { path: '/verify-pending?email=member%40example.test', width: 390 },
      { path: '/forgot-password', width: 390 },
      { path: '/auth/reset-password?token=e2e-invalid', width: 768 },
      { path: '/reset-success', width: 768 },
      { path: '/auth/verify-email?token=e2e-invalid', width: 390 },
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
          email: 'member@example.test',
          displayName: '家庭成员',
          emailVerified: true,
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
    await page.keyboard.press('Tab');
    const focusedLabels: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      focusedLabels.push(
        await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent ?? ''),
      );
      await page.keyboard.press('Tab');
    }
    expect(focusedLabels.join(' ')).toMatch(/邮箱.*昵称.*密码/s);
    await page.getByRole('button', { name: '创建账户' }).click();
    await expect(page.getByLabel('邮箱')).toBeFocused();
  });

  test('focuses resolved status headings and exposes live-region feedback', async ({ page }) => {
    await page.goto('/auth/verify-email?token=e2e-invalid');
    await expect(page).not.toHaveURL(/token=/i);
    await expect(page.getByRole('heading')).toBeFocused();
    await page.goto('/forgot-password');
    await page.getByLabel('邮箱').fill('unknown@example.test');
    await page.getByRole('button', { name: '发送重置链接' }).click();
    await expect(page.getByRole('status')).toHaveAttribute('aria-live', /polite|assertive/);
  });

  test('retains primary actions, errors, and email addresses at 200% zoom', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('/register');
    await page.evaluate(() => {
      document.documentElement.style.zoom = '2';
    });
    await page.getByRole('button', { name: '创建账户' }).click();
    await expect(page.getByRole('button', { name: '创建账户' })).toBeVisible();
    await expect(page.getByText(/请输入|必填/).first()).toBeVisible();
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
    await page.getByLabel('邮箱').focus();
    const outline = await page.getByLabel('邮箱').evaluate((element) => getComputedStyle(element).outlineStyle);
    expect(outline).not.toBe('none');
  });
});
