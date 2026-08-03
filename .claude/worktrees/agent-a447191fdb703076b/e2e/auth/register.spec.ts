import { expect, test } from '@playwright/test';

test.describe('Web registration journey', () => {
  test('registers through the real form and reaches verification pending', async ({ page }) => {
    const email = `playwright-register-${Date.now()}@example.test`;

    await page.goto('/register');
    await page.getByLabel('邮箱').fill(email);
    await page.getByLabel('昵称').fill('共享日历成员');
    await page.getByLabel('密码', { exact: true }).fill('correct horse battery staple 2026');
    await page.getByRole('button', { name: '创建账户' }).click();

    await expect(page).toHaveURL(/\/verify-pending(?:\?|$)/);
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByRole('button', { name: '打开邮箱' })).toBeVisible();
  });

  test('keeps password-manager, paste, and reveal behavior available', async ({ page }) => {
    await page.goto('/register');

    const email = page.getByLabel('邮箱');
    const password = page.getByLabel('密码', { exact: true });
    await expect(email).toHaveAttribute('autocomplete', 'email');
    await expect(password).toHaveAttribute('autocomplete', 'new-password');
    await password.fill('pasted password value');
    await page.getByRole('button', { name: '显示密码' }).click();

    await expect(password).toHaveJSProperty('type', 'text');
    await expect(password).toBeFocused();
  });
});
