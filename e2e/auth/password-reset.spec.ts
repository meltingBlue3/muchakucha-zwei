import { expect, test } from '@playwright/test';

async function mailLinkFor(recipient: string, path: string): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(async () => {
      const response = await fetch(
        `http://127.0.0.1:${process.env.TEST_MAILPIT_HTTP_PORT ?? '18025'}/messages?recipient=${encodeURIComponent(recipient)}&path=${encodeURIComponent(path)}`,
      );
      const body = (await response.json()) as { messages: string[] };
      const message = body.messages.at(-1);
      const decoded = message?.replace(/=\n/g, '').replaceAll('=3D', '=').replaceAll('&amp;', '&');
      link = decoded?.match(new RegExp(`https?:[^\\s"']+${path}[^\\s"']+`))?.[0];
      return link;
    })
    .toBeTruthy();
  if (!link) throw new Error(`SMTP message for ${recipient} did not contain ${path}`);
  return link;
}

test.describe('Web password reset journey', () => {
  test.describe.configure({ mode: 'serial' });

  test('uses privacy-safe request copy, sanitizes the delivered link, and requires normal login afterward', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const email = `password-reset-${Date.now()}@example.test`;
    const oldPassword = 'correct horse battery staple 2026';

    await page.goto('/register');
    await page.getByLabel('邮箱').fill(email);
    await page.getByLabel('昵称').fill('密码重置成员');
    await page.getByLabel('密码', { exact: true }).fill(oldPassword);
    await page.getByRole('button', { name: '创建账户' }).click();
    await expect(page).toHaveURL(/\/verify-pending/);
    await page.goto(await mailLinkFor(email, '/auth/verify-email'));
    await expect(page.getByRole('heading', { name: '验证成功' })).toBeVisible();

    await page.context().clearCookies();
    await page.goto('/forgot-password');
    await page.getByLabel('邮箱').fill(email);
    await page.getByRole('button', { name: '发送重置链接' }).click();
    await expect(page.getByRole('status')).toContainText(/如果该邮箱已注册|请检查邮箱/);

    const resetLink = await mailLinkFor(email, '/auth/reset-password');
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

  });

  test('rejects a common password without consuming the single-use reset link', async ({ page }) => {
    await page.goto(`/auth/reset-password?token=${'r'.repeat(43)}`);
    await page.getByLabel('新密码', { exact: true }).fill('123qweasdzxc');
    await page.getByRole('button', { name: '更新密码' }).click();
    await expect(page.getByText('这个密码过于常见，请使用更强的密码。')).toBeVisible();
    await expect(page).not.toHaveURL(/token=/i);
  });
});
