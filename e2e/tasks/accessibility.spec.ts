import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { Client } from 'pg';

import { loginUsernameFixture } from '../support/auth';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:3000';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:8081';
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://muchakucha_test:muchakucha_test_only@127.0.0.1:5432/muchakucha_test';
const password = 'correct horse battery staple 2026';

const widths = [320, 390, 768, 1440] as const;

async function withDatabase<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

async function prepareAccount(
  seed: string,
  displayName: string,
): Promise<{ username: string; accessToken: string; userId: string }> {
  return withDatabase(async (database) => {
    const username = `u-${seed.slice(0, 6)}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;

    const registerResponse = await fetch(`${API_ORIGIN}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({ username, confirmPassword: password, password, platform: 'web' }),
    });
    expect(registerResponse.status).toBe(202);

    await database.query(
      `UPDATE "User" SET "display_name" = $2 WHERE "username_canonical" = lower($1)`,
      [username, displayName],
    );

    const userResult = await database.query(
      `SELECT "id" FROM "User" WHERE "username_canonical" = lower($1)`,
      [username],
    );
    const userId = userResult.rows[0]?.id as string;
    expect(userId).toBeDefined();

    const loginResponse = await fetch(`${API_ORIGIN}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({ username, password, platform: 'web' }),
    });
    expect(loginResponse.status).toBe(200);
    const loginBody: unknown = await loginResponse.json();
    const accessToken = (loginBody as { accessToken?: string }).accessToken;
    expect(accessToken).toBeDefined();

    return { username, accessToken, userId };
  });
}

async function createHousehold(
  accessToken: string,
  name: string,
): Promise<{ id: string; name: string; ownerMembershipId: string }> {
  const response = await fetch(`${API_ORIGIN}/api/v1/households`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ name }),
  });
  const body: unknown = await response.json();
  const household = body as { id: string; name: string; ownerMembershipId: string };
  expect(response.status).toBe(201);
  return { id: household.id, name: household.name, ownerMembershipId: household.ownerMembershipId };
}

async function loginFixture(page: Page, username: string): Promise<void> {
  await loginUsernameFixture(page, username, password);
}

test.describe('tasks and today view accessibility', () => {
  let ownerUsername: string;
  let ownerId: string;
  let ownerToken: string;
  let householdId: string;
  let ownerMembershipId: string;

  test.beforeAll(async () => {
    const owner = await prepareAccount('owner', '无障碍主人');
    ownerUsername = owner.username;
    ownerId = owner.userId;
    ownerToken = owner.accessToken;
    const household = await createHousehold(ownerToken, '无障碍任务组');
    householdId = household.id;
    ownerMembershipId = household.ownerMembershipId;
  });

  // ---- Mock setup helper ----

  async function setupTaskRoutes(context: any) {
    // Auth refresh
    await context.route('**/api/v1/auth/refresh', (route: any) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accessToken: ownerToken }),
      }),
    );

    // Household roster
    await context.route(`**/api/v1/households/${encodeURIComponent(householdId)}`, (route: any) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: householdId,
          name: '无障碍任务组',
          ownerMembershipId,
          members: [{
            membershipId: ownerMembershipId,
            userId: ownerId,
            displayName: '无障碍主人',
            username: ownerUsername,
            role: 'OWNER',
            isCurrentUser: true,
          }],
        }),
      }),
    );

    // Household list
    await context.route('**/api/v1/households', (route: any) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: householdId,
          name: '无障碍任务组',
          role: 'OWNER',
          memberCount: 1,
          ownerMembershipId,
        }]),
      }),
    );

    // User profile
    await context.route('**/api/v1/users/me', (route: any) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: ownerId,
          username: ownerUsername,
          displayName: '无障碍主人',
          hasHousehold: true,
        }),
      }),
    );

    // Events list (empty for today view)
    await context.route(`**/api/v1/households/${encodeURIComponent(householdId)}/events?startDate=*&endDate=*`, (route: any) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ events: [], total: 0 }),
      }),
    );

    // Tasks list
    await context.route(`**/api/v1/households/${encodeURIComponent(householdId)}/tasks`, (route: any) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tasks: [], total: 0 }),
      }),
    );
  }

  // ============================================================================
  // 1. AXE AT ALL RESPONSIVE BREAKPOINTS
  // ============================================================================

  for (const width of widths) {
    test(`tasks list has no axe violations at ${width}px`, async ({ context, page }) => {
      await setupTaskRoutes(context);
      await page.setViewportSize({ width, height: 900 });
      await loginFixture(page, ownerUsername);
      await page.goto(`/households/${encodeURIComponent(householdId)}/tasks`);
      await page.waitForTimeout(2000);

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations, `tasks list at ${width}px`).toEqual([]);
      await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
    });

    test(`today view has no axe violations at ${width}px`, async ({ context, page }) => {
      await setupTaskRoutes(context);
      await page.setViewportSize({ width, height: 900 });
      await loginFixture(page, ownerUsername);
      await page.goto(`/households/${encodeURIComponent(householdId)}/today`);
      await page.waitForTimeout(2000);

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations, `today view at ${width}px`).toEqual([]);
      await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
    });
  }

  // ============================================================================
  // 2. REDUCED MOTION
  // ============================================================================

  test('today view has no axe violations with reduced motion', async ({ browser }) => {
    const context = await browser.newContext({
      reducedMotion: 'reduce',
      viewport: { width: 390, height: 900 },
    });
    const page = await context.newPage();
    await setupTaskRoutes(context);

    await loginFixture(page, ownerUsername);
    await page.goto(`/households/${encodeURIComponent(householdId)}/today`);
    await page.waitForTimeout(2000);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, 'reduced-motion today').toEqual([]);

    await context.close();
  });

  // ============================================================================
  // 3. FORCED COLORS
  // ============================================================================

  test('tasks pages remain usable in forced-colors mode', async ({ browser }) => {
    const context = await browser.newContext({
      forcedColors: 'active',
      viewport: { width: 390, height: 900 },
    });
    const page = await context.newPage();
    await setupTaskRoutes(context);

    await loginFixture(page, ownerUsername);
    await page.goto(`/households/${encodeURIComponent(householdId)}/tasks`);
    await page.waitForTimeout(2000);

    await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
    await context.close();
  });
});
