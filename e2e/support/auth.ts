import { expect, type Page } from '@playwright/test';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:3000';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:8081';

// Email-backed household fixtures exercise the retained API compatibility path.
// Browser authentication journeys themselves use the username form in e2e/auth.
export async function loginEmailFixture(
  page: Page,
  email: string,
  password: string,
  destination = '/household-handoff',
): Promise<void> {
  const response = await page.request.post(`${API_ORIGIN}/api/v1/auth/login`, {
    data: { email, password, platform: 'web' },
    headers: { origin: WEB_ORIGIN },
  });
  expect(response.status()).toBe(200);
  await page.goto(destination);
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByRole('progressbar', { name: '正在恢复登录状态' })).toBeHidden();
}
