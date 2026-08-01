import { expect, test } from '@playwright/test';

test.describe.skip('Authenticated account actions', () => {
  test('updates the current nickname and accepts a nickname used by another account', async ({ page }) => {
    await page.goto('/profile');
    const nickname = page.getByLabel('昵称');
    await expect(nickname).not.toHaveValue('');
    await nickname.fill('可重复的家庭昵称');
    await page.getByRole('button', { name: '保存昵称' }).click();
    await expect(page.getByRole('status')).toHaveText('昵称已更新。');
    await page.reload();
    await expect(nickname).toHaveValue('可重复的家庭昵称');
  });

  test('logs out only the current browser while a second device stays authenticated', async ({ browser, page }) => {
    const secondDevice = await browser.newContext({ storageState: await page.context().storageState() });
    const secondPage = await secondDevice.newPage();
    await secondPage.goto('/profile');
    await expect(secondPage.getByRole('heading', { name: /昵称|个人资料/ })).toBeVisible();

    await page.goto('/profile');
    await page.getByRole('button', { name: '退出登录' }).click();
    await expect(page.getByRole('dialog')).toContainText('退出这台设备？');
    await page.getByRole('dialog').getByRole('button', { name: '退出登录' }).click();
    await expect(page).toHaveURL(/\/login/);

    await secondPage.reload();
    await expect(secondPage).toHaveURL(/\/profile/);
    await secondDevice.close();
  });
});
