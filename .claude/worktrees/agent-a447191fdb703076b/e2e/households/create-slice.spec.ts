import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const MAILPIT_ORIGIN = process.env.MAILPIT_ORIGIN ?? 'http://127.0.0.1:18025';

async function latestVerificationLink(request: APIRequestContext, recipient: string): Promise<string> {
  let source = '';
  await expect
    .poll(async () => {
      const response = await request.get(`${MAILPIT_ORIGIN}/messages`, {
        params: { recipient, path: '/auth/verify-email' },
      });
      if (!response.ok()) return 0;
      const body = (await response.json()) as { messages?: string[] };
      source = body.messages?.at(-1) ?? '';
      return body.messages?.length ?? 0;
    })
    .toBeGreaterThan(0);

  const decoded = source.replace(/=\n/g, '').replaceAll('=3D', '=').replaceAll('&amp;', '&');
  const match = decoded.match(/https?:[^\s"']+\/auth\/verify-email[^\s"']+/);
  if (!match) throw new Error(`Mailpit message for ${recipient} did not contain the verification link.`);
  return match[0];
}

async function reachHouseholdHandoff(page: Page, request: APIRequestContext, email: string): Promise<void> {
  await page.goto('/register');
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('昵称').fill('创建成员');
  await page.getByLabel('密码', { exact: true }).fill('correct horse battery staple 2026');
  await page.getByRole('button', { name: '创建账户' }).click();
  await expect(page).toHaveURL(/\/verify-pending/);

  const link = await latestVerificationLink(request, email);
  await page.goto(link);
  await expect(page.getByRole('button', { name: '继续' })).toBeVisible();
  await page.getByRole('button', { name: '继续' }).click();
  await expect(page).toHaveURL(/\/household-handoff/);
}

test('creates and displays the authoritative household [RED:HOUSEHOLD_CREATE]', async ({ page, request }) => {
  const email = `playwright-household-create-${Date.now()}@example.test`;
  await reachHouseholdHandoff(page, request, email);

  const householdName = '山田家';
  const createEntry = page.getByRole('button', { name: '创建家庭' });
  await expect(createEntry).toBeVisible();
  await createEntry.click();
  await expect(page).toHaveURL(/\/households\/new$/);

  await page.getByLabel('家庭名称').fill(householdName);
  await page.getByRole('button', { name: '创建家庭' }).click();

  await expect(page).toHaveURL(/\/households\/new$/);
  await expect(page.getByText('家庭已创建。你现在是这个家庭的所有者。')).toBeVisible();
  await expect(page.getByText(householdName)).toBeVisible();
  await expect(page.getByText('所有者', { exact: true })).toBeVisible();
});
