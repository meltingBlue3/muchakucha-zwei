import { createServer, type Server, type Socket } from 'node:net';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { Client } from 'pg';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:3000';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:8081';
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://muchakucha_test:muchakucha_test_only@127.0.0.1:55432/muchakucha_test';
const SMTP_PORT = Number(process.env.TEST_MAILPIT_SMTP_PORT ?? 11025);
const password = 'correct horse battery staple 2026';
let smtpServer: Server | undefined;

function handleSmtp(socket: Socket): void {
  let buffer = '';
  let receivingData = false;
  socket.setEncoding('utf8');
  socket.write('220 muchakucha account actions smtp\r\n');
  socket.on('data', (chunk: string) => {
    buffer += chunk;
    while (buffer.includes('\r\n')) {
      const end = buffer.indexOf('\r\n');
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      if (receivingData) {
        if (line === '.') {
          receivingData = false;
          socket.write('250 queued\r\n');
        }
      } else if (/^EHLO /i.test(line)) socket.write('250-muchakucha\r\n250 PIPELINING\r\n');
      else if (/^HELO |^MAIL FROM:|^RCPT TO:|^RSET$/i.test(line)) socket.write('250 ok\r\n');
      else if (/^DATA$/i.test(line)) {
        receivingData = true;
        socket.write('354 end with <CRLF>.<CRLF>\r\n');
      } else if (/^QUIT$/i.test(line)) socket.end('221 bye\r\n');
      else socket.write('250 ok\r\n');
    }
  });
}

async function markEmailVerified(email: string): Promise<void> {
  const database = new Client({ connectionString: DATABASE_URL });
  await database.connect();
  try {
    const result = await database.query(
      `UPDATE "User" SET "email_verified_at" = now() WHERE "email_canonical" = lower($1)`,
      [email],
    );
    expect(result.rowCount).toBe(1);
  } finally {
    await database.end();
  }
}

async function registerAndLogin(page: Page, displayName: string): Promise<string> {
  const email = `account-actions-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  await page.goto('/register');
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('昵称').fill(displayName);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '创建账户' }).click();
  await expect(page).toHaveURL(/\/verify-pending/);
  await markEmailVerified(email);
  const response = await page.request.post(`${API_ORIGIN}/api/v1/auth/login`, {
    data: { email, password, platform: 'web' },
    headers: { origin: WEB_ORIGIN },
  });
  expect(response.status()).toBe(200);
  await page.goto('/profile');
  await expect(page).toHaveURL(/\/profile/);
  return email;
}

async function login(context: BrowserContext, email: string): Promise<Page> {
  const response = await context.request.post(`${API_ORIGIN}/api/v1/auth/login`, {
    data: { email, password, platform: 'web' },
    headers: { origin: WEB_ORIGIN },
  });
  expect(response.status()).toBe(200);
  const page = await context.newPage();
  await page.goto('/profile');
  await expect(page).toHaveURL(/\/profile/);
  return page;
}

test.describe('Authenticated account actions', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    smtpServer = createServer(handleSmtp);
    await new Promise<void>((resolve, reject) => {
      smtpServer!.once('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          smtpServer = undefined;
          resolve();
        } else reject(error);
      });
      smtpServer!.listen(SMTP_PORT, '127.0.0.1', resolve);
    });
  });

  test.afterAll(async () => {
    if (smtpServer !== undefined) {
      await new Promise<void>((resolve, reject) =>
        smtpServer!.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  test('updates the current nickname and accepts a nickname used by another account', async ({ page, request }) => {
    test.setTimeout(60_000);
    const duplicateName = '可重复的家庭昵称';
    const duplicateEmail = `duplicate-name-${Date.now()}@example.test`;
    const duplicate = await request.post(`${API_ORIGIN}/api/v1/auth/register`, {
      data: { displayName: duplicateName, email: duplicateEmail, password, platform: 'web' },
      headers: { origin: WEB_ORIGIN },
    });
    expect(duplicate.status()).toBe(202);

    await registerAndLogin(page, '原昵称');
    await page.goto('/profile');
    const nickname = page.getByLabel('昵称');
    await expect(nickname).toHaveValue('原昵称');
    await nickname.fill(duplicateName);
    await page.getByRole('button', { name: '保存昵称' }).click();
    await expect(page.getByRole('status')).toHaveText('昵称已更新。');
    await page.reload();
    await expect(page).toHaveURL(/\/profile/);
    await expect(page.getByLabel('昵称')).toHaveValue(duplicateName);
  });

  test('logs out only the current browser while a second device stays authenticated', async ({ browser, page }) => {
    test.setTimeout(60_000);
    const email = await registerAndLogin(page, '双设备成员');
    const secondDevice = await browser.newContext();
    try {
      const secondPage = await login(secondDevice, email);
      await secondPage.goto('/profile');
      await expect(secondPage.getByRole('heading', { name: '个人资料' })).toBeVisible();

      await page.goto('/profile');
      await page.getByRole('button', { name: '退出登录' }).click();
      await expect(page.getByRole('dialog')).toContainText('退出这台设备？');
      await page.getByRole('dialog').getByRole('button', { name: '退出登录' }).click();
      await expect(page).toHaveURL(/\/login/);
      await page.reload();
      await expect(page).toHaveURL(/\/login/);

      await secondPage.reload();
      await expect(secondPage).toHaveURL(/\/profile/);
      await expect(secondPage.getByRole('heading', { name: '个人资料' })).toBeVisible();
    } finally {
      await secondDevice.close();
    }
  });
});
