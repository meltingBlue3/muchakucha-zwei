import { expect, type Page } from '@playwright/test';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:3000';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:8081';

// Sign in through the username API and let the browser restore its HttpOnly session.
export async function loginUsernameFixture(
  page: Page,
  username: string,
  password: string,
  destination = '/household-handoff',
): Promise<void> {
  const response = await page.request.post(`${API_ORIGIN}/api/v1/auth/login`, {
    data: { username, password, platform: 'web' },
    headers: { origin: WEB_ORIGIN },
  });
  expect(response.status()).toBe(200);
  await page.goto(destination);
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByRole('progressbar', { name: '正在恢复登录状态' })).toBeHidden();
}
