import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { Client } from 'pg';

const MAILPIT_ORIGIN = process.env.MAILPIT_ORIGIN
  ?? `http://127.0.0.1:${process.env.TEST_MAILPIT_HTTP_PORT ?? '18025'}`;
const DATABASE_URL =
  process.env.DATABASE_URL
  ?? 'postgresql://muchakucha_test:muchakucha_test_only@127.0.0.1:55432/muchakucha_test';

async function forceTerminalState(link: string, state: 'expired' | 'used'): Promise<void> {
  const token = new URL(link).searchParams.get('token');
  if (!token) throw new Error('Verification fixture link did not include a token.');
  const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');
  const database = new Client({ connectionString: DATABASE_URL });
  await database.connect();
  try {
    if (state === 'expired') {
      await database.query(
        `UPDATE "EmailVerificationToken"
         SET "created_at" = now() - interval '2 days', "expires_at" = now() - interval '1 day'
         WHERE "token_hash" = $1`,
        [tokenHash],
      );
    } else {
      await database.query(
        `UPDATE "EmailVerificationToken"
         SET "consumed_at" = now(), "pending_proof_hash" = NULL
         WHERE "token_hash" = $1`,
        [tokenHash],
      );
    }
  } finally {
    await database.end();
  }
}

async function latestLinkFor(request: APIRequestContext, recipient: string, path: string): Promise<string> {
  let source = '';
  await expect
    .poll(async () => {
      const response = await request.get(`${MAILPIT_ORIGIN}/messages`, {
        params: { recipient, path },
      });
      if (!response.ok()) return 0;
      const body = (await response.json()) as { messages?: string[] };
      source = body.messages?.at(-1) ?? '';
      return body.messages?.length ?? 0;
    })
    .toBeGreaterThan(0);

  const decoded = source.replace(/=\n/g, '').replaceAll('=3D', '=').replaceAll('&amp;', '&');
  const match = decoded.match(new RegExp(`https?:[^\\s\"']+${path}[^\\s\"']+`));
  if (!match) throw new Error(`Mailpit message for ${recipient} did not contain ${path}`);
  return match[0];
}

async function register(page: Page, email: string): Promise<void> {
  await page.goto('/register');
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('昵称').fill('验证成员');
  await page.getByLabel('密码', { exact: true }).fill('correct horse battery staple 2026');
  await page.getByRole('button', { name: '创建账户' }).click();
  await expect(page).toHaveURL(/\/verify-pending/);
}

async function expectNoWebSecret(context: BrowserContext, page: Page): Promise<void> {
  const cookies = await context.cookies();
  expect(cookies.filter((cookie) => /refresh|pending/i.test(cookie.name))).toEqual(
    expect.arrayContaining([expect.objectContaining({ httpOnly: true })]),
  );
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(storage).not.toMatch(/refresh|pending.?proof|token/i);
}

test.describe('Email verification journey', () => {
  test('follows the real Mailpit link in the registering browser and establishes a cookie-only session', async ({
    context,
    page,
    request,
  }) => {
    const email = `playwright-verify-same-${Date.now()}@example.test`;
    await register(page, email);
    const link = await latestLinkFor(request, email, '/auth/verify-email');

    await page.goto(link);
    await expect(page).not.toHaveURL(/token=|proof=/i);
    await expect(page.getByRole('heading', { name: /验证成功|邮箱已验证/ })).toBeVisible();
    await page.getByRole('button', { name: '继续' }).click();
    await expect(page).toHaveURL(/\/household-handoff/);
    await expectNoWebSecret(context, page);
  });

  test('shows login guidance when the Mailpit link opens in an isolated browser', async ({ browser, page, request }) => {
    const email = `playwright-verify-cross-${Date.now()}@example.test`;
    await register(page, email);
    const link = await latestLinkFor(request, email, '/auth/verify-email');
    const isolated = await browser.newContext();
    const isolatedPage = await isolated.newPage();

    await isolatedPage.goto(link);
    await expect(isolatedPage).not.toHaveURL(/token=|proof=/i);
    await expect(isolatedPage.getByRole('button', { name: '前往登录' })).toBeVisible();
    expect((await isolated.cookies()).filter((cookie) => /refresh/i.test(cookie.name))).toHaveLength(0);
    await isolated.close();
  });

  test('renders expired, used, and invalid link recovery states without retaining tokens', async ({ page, request }) => {
    for (const state of ['expired', 'used', 'invalid'] as const) {
      let link: string;
      if (state === 'invalid') {
        link = `/auth/verify-email?token=${'i'.repeat(43)}`;
      } else {
        const email = `playwright-verify-${state}-${Date.now()}@example.test`;
        await register(page, email);
        link = await latestLinkFor(request, email, '/auth/verify-email');
        await forceTerminalState(link, state);
      }
      await page.goto(link);
      await expect(page).not.toHaveURL(/token=/i);
      await expect(page.getByRole('heading')).toContainText(
        state === 'expired' ? /过期/ : state === 'used' ? /已验证|已使用/ : /无效|无法验证/,
      );
    }
  });

  test('resend countdown disables repeat delivery and announces eligibility', async ({ page }) => {
    await page.goto('/verify-pending');
    const resend = page.getByRole('button', { name: /重新发送/ });
    await expect(resend).toBeDisabled();
    await expect(page.getByText(/60/)).toHaveAttribute('aria-live', /polite|assertive/);
  });
});
