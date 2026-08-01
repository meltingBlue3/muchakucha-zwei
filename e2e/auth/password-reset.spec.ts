import { expect, test, type APIRequestContext } from '@playwright/test';

const MAILPIT_ORIGIN = process.env.MAILPIT_ORIGIN ?? 'http://127.0.0.1:18025';

async function resetLinkFor(request: APIRequestContext, recipient: string): Promise<string> {
  await expect
    .poll(async () => {
      const response = await request.get(`${MAILPIT_ORIGIN}/api/v1/search`, { params: { query: `to:${recipient}` } });
      if (!response.ok()) return 0;
      const body = (await response.json()) as { messages?: unknown[] };
      return body.messages?.length ?? 0;
    })
    .toBeGreaterThan(0);
  const search = await request.get(`${MAILPIT_ORIGIN}/api/v1/search`, { params: { query: `to:${recipient}` } });
  const body = (await search.json()) as { messages: Array<{ ID: string }> };
  const message = await request.get(`${MAILPIT_ORIGIN}/api/v1/message/${body.messages[0].ID}`);
  const match = JSON.stringify(await message.json()).match(/https?:[^\s"']+\/auth\/reset-password[^\s"']+/);
  if (!match) throw new Error(`Mailpit message for ${recipient} did not contain a reset link`);
  return match[0].replaceAll('\\u0026', '&');
}

test.describe('Web password reset journey', () => {
  test('uses privacy-safe request copy, sanitizes the Mailpit link, revokes all sessions, and does not auto-login', async ({
    browser,
    page,
    request,
  }) => {
    throw new Error('IMPLEMENTATION_MISSING_RESET_UI');
    const email = 'verified-user@example.test';
    await page.goto('/forgot-password');
    await page.getByLabel('邮箱').fill(email);
    await page.getByRole('button', { name: '发送重置链接' }).click();
    await expect(page.getByRole('status')).toContainText(/如果该邮箱已注册|请检查邮箱/);

    const secondDevice = await browser.newContext();
    const resetLink = await resetLinkFor(request, email);
    const resetToken = new URL(resetLink).searchParams.get('token');
    const browserMessages: string[] = [];
    page.on('console', (message) => browserMessages.push(message.text()));
    await page.goto(resetLink);
    await expect(page).not.toHaveURL(/token=/i);
    expect(await page.evaluate(() => JSON.stringify(window.history.state))).not.toContain(resetToken);
    expect(browserMessages.join('\n')).not.toContain(resetToken);
    await page.getByLabel('新密码', { exact: true }).fill('another correct horse battery staple 2026');
    await page.getByRole('button', { name: '更新密码' }).click();
    await expect(page.getByRole('heading', { name: /密码已更新|重置成功/ })).toBeVisible();
    await expect(page.getByText(/所有设备|全部会话/)).toBeVisible();
    await page.getByRole('button', { name: '返回登录' }).click();
    await expect(page).toHaveURL(/\/login/);
    expect((await page.context().cookies()).filter((cookie) => /refresh/i.test(cookie.name))).toHaveLength(0);

    const secondPage = await secondDevice.newPage();
    await secondPage.goto('/');
    await expect(secondPage).toHaveURL(/\/login/);
    await secondDevice.close();
  });

  test('rejects a common password without consuming the single-use reset link', async ({ page }) => {
    throw new Error('IMPLEMENTATION_MISSING_RESET_UI');
    await page.goto('/auth/reset-password?token=e2e-reset-token');
    await page.getByLabel('新密码', { exact: true }).fill('password');
    await page.getByRole('button', { name: '更新密码' }).click();
    await expect(page.getByText(/常见密码|更强的密码/)).toBeVisible();
    await expect(page).not.toHaveURL(/token=/i);
  });
});
