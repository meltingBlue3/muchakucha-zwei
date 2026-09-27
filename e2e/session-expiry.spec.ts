import { expect, test, type Page } from '@playwright/test';

const householdId = '11111111-1111-4111-8111-111111111111';
const base = `/households/${householdId}`;
const event = { id: '33333333-3333-4333-8333-333333333333', householdId, title: '周末聚餐', description: null, location: null, allDay: false, startTime: '2030-06-15T09:00:00.000Z', endTime: '2030-06-15T10:00:00.000Z', labels: [], recurrence: null, recurrenceRuleId: null, occurrenceDate: null, cancelledAt: null, createdBy: 'user', createdAt: '2030-06-01T00:00:00.000Z', updatedAt: '2030-06-01T00:00:00.000Z' };

/**
 * Mocks an API whose access tokens expire like the real one (15 minutes):
 * `expireTokens()` makes every token issued so far answer 401, and only a
 * new /auth/refresh (the refresh cookie is still valid) issues a working one.
 */
async function setup(page: Page) {
  let issued = 0;
  let refreshRevoked = false;
  const expired = new Set<string>();
  const refreshes: number[] = [];
  await page.clock.setFixedTime(new Date('2030-06-15T04:00:00Z'));
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/refresh')) {
      refreshes.push(Date.now());
      if (refreshRevoked) await route.fulfill({ status: 401, json: { error: { code: 'INVALID_REFRESH_TOKEN', message: 'The refresh token is invalid.' } } });
      else await route.fulfill({ json: { accessToken: `token-${++issued}` } });
      return;
    }
    const token = (route.request().headers()['authorization'] ?? '').replace(/^Bearer /, '');
    if (expired.has(token)) {
      await route.fulfill({ status: 401, json: { error: { code: 'INVALID_ACCESS_TOKEN', message: 'The access token is invalid or expired.' } } });
      return;
    }
    const household = { id: householdId, name: '周末的家', role: 'OWNER', memberCount: 1, ownerMembershipId: 'member' };
    let body: unknown;
    if (path.endsWith('/users/me')) body = { id: 'user', username: 'review', displayName: '小林', hasHousehold: true };
    else if (path === '/api/v1/households') body = [household];
    else if (path.endsWith('/' + householdId)) body = { ...household, members: [{ membershipId: 'member', userId: 'user', displayName: '小林', username: 'review', role: 'OWNER', isCurrentUser: true }] };
    else if (path.endsWith('/events')) body = { events: [event] };
    else if (path.endsWith('/tasks')) body = { tasks: [] };
    else if (path.endsWith('/labels')) body = { labels: [] };
    else if (path.endsWith('/notes')) body = { notes: [] };
    else if (path.endsWith('/invitations/inbox')) body = { invitations: [] };
    else throw new Error(`Unexpected API ${route.request().method()} ${path}`);
    await route.fulfill({ json: body });
  });
  return {
    expireTokens: () => { for (let n = 1; n <= issued; n++) expired.add(`token-${n}`); },
    refreshCount: () => refreshes.length,
    revokeRefresh: () => { refreshRevoked = true; },
  };
}

test('an expired access token is refreshed instead of failing the next load', async ({ page }) => {
  const api = await setup(page);
  await page.goto(`${base}/tasks`);
  await expect(page.getByRole('main', { name: '家庭任务' })).toBeVisible();
  const refreshesBefore = api.refreshCount();
  api.expireTokens();
  await page.getByRole('tab', { name: '日历', exact: true }).click();
  await expect(page.getByRole('button', { name: /^日程：周末聚餐/ })).toBeVisible();
  await expect(page.getByText(/无法加载|刷新失败/)).toHaveCount(0);
  expect(api.refreshCount()).toBe(refreshesBefore + 1);
});

test('a revoked refresh credential leads to sign-in instead of a load error', async ({ page }) => {
  const api = await setup(page);
  await page.goto(`${base}/tasks`);
  await expect(page.getByRole('main', { name: '家庭任务' })).toBeVisible();
  api.expireTokens();
  api.revokeRefresh();
  await page.getByRole('tab', { name: '日历', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?/);
  const url = new URL(page.url());
  expect(url.searchParams.get('intended')).toBe(`${base}/events`);
  expect(url.searchParams.get('reason')).toBe('reauth-required');
});
