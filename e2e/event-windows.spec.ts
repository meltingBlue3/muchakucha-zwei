import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { EventResponseDto } from '@muchakucha/api-client';

const householdId = '11111111-1111-4111-8111-111111111111';
const eventId = '33333333-3333-4333-8333-333333333333';
const base = `/households/${householdId}`;
const initialEvent: EventResponseDto = { id: eventId, householdId, title: '和家人一起准备周末聚餐，提前确认每个人的时间', description: '带上想分享的食物。\n'.repeat(35), location: '家里的餐厅', allDay: false, startTime: '2030-06-15T09:00:00.000Z', endTime: '2030-06-15T10:00:00.000Z', labels: [], recurrence: null, recurrenceRuleId: null, occurrenceDate: null, cancelledAt: null, createdBy: 'user', createdAt: '2030-06-01T00:00:00.000Z', updatedAt: '2030-06-01T00:00:00.000Z' };
async function setup(page: Page) {
  const events = new Map<string, EventResponseDto>([[eventId, { ...initialEvent }]]);
  await page.clock.setFixedTime(new Date('2030-06-15T04:00:00Z'));
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const household = { id: householdId, name: '周末的家', role: 'OWNER', memberCount: 1, ownerMembershipId: 'member' };
    let body: unknown = {};
    if (path.endsWith('/auth/refresh')) body = { accessToken: 'mock-only' };
    else if (path.endsWith('/users/me')) body = { id: 'user', username: 'review', displayName: '小林', hasHousehold: true };
    else if (path === '/api/v1/households') body = [household];
    else if (path.endsWith('/' + householdId)) body = { ...household, members: [{ membershipId: 'member', userId: 'user', displayName: '小林', username: 'review', role: 'OWNER', isCurrentUser: true }] };
    else if (path.endsWith('/events')) {
      if (method === 'POST') { const id = '44444444-4444-4444-8444-444444444444'; const event = { ...initialEvent, ...route.request().postDataJSON(), id }; events.set(id, event); body = event; }
      else body = { events: [...events.values()] };
    } else if (path.includes('/events/') && !path.endsWith('/labels')) {
      const id = path.split('/').at(-1)!;
      if (method === 'PUT') events.set(id, { ...events.get(id)!, ...route.request().postDataJSON(), updatedAt: '2030-06-15T04:01:00Z' });
      if (method === 'DELETE') events.delete(id);
      body = events.get(id) ?? {};
    } else if (path.endsWith('/labels')) body = { labels: [] };
    else if (path.endsWith('/tasks')) body = { tasks: [] };
    else if (path.endsWith('/invitations/inbox')) body = { invitations: [] };
    else throw new Error(`Unexpected API ${method} ${path}`);
    await route.fulfill({ json: body });
  });
  return events;
}

for (const width of [320, 390, 1440]) {
  test(`calendar and event windows fit ${width}px and preserve the selected date`, async ({ page }, testInfo) => {
    const events = await setup(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}/events`);
    await expect(page.getByRole('button', { name: /^事件：/ })).toBeVisible();
    const month = await page.getByTestId('calendar-month-pane').boundingBox();
    const agenda = await page.getByTestId('calendar-agenda-pane').boundingBox();
    if (width === 1440) expect(agenda!.x).toBeGreaterThan(month!.x + month!.width);
    else expect(agenda!.y).toBeGreaterThan(month!.y + month!.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`calendar-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: /^事件：/ }).click();
    const detail = page.getByRole('dialog', { name: '日程详情', exact: true });
    await expect(detail).toBeVisible();
    await expect(detail.getByRole('button', { name: '编辑事件', exact: true })).toBeInViewport();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`event-detail-${width}.png`) });
    await detail.getByRole('button', { name: '编辑事件', exact: true }).click();
    const edit = page.getByRole('dialog', { name: '编辑日程', exact: true });
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await edit.getByRole('textbox', { name: '事件标题', exact: true }).fill('已修改的日程');
    await edit.getByRole('button', { name: '保存', exact: true }).click();
    await expect(detail.getByRole('heading', { name: '已修改的日程', exact: true })).toBeVisible();
    expect(events.get(eventId)!.title).toBe('已修改的日程');
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(`${base}/events`);
    await expect(page.getByRole('button', { name: /^2030-06-15/ })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: /^2030-06-20/ }).click();
    await page.getByRole('button', { name: '创建事件', exact: true }).click();
    const create = page.getByRole('dialog', { name: '创建日程', exact: true });
    await expect(create.getByLabel('开始日期', { exact: true })).toHaveValue('2030-06-20');
    await expect(create.getByLabel('结束日期', { exact: true })).toHaveValue('2030-06-20');
    await create.getByLabel('事件标题', { exact: true }).fill('选中日期的新日程');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    const panel = await create.getByTestId('app-dialog-panel').boundingBox();
    expect(panel!.x + panel!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`event-create-${width}.png`) });
    await create.getByRole('button', { name: '创建', exact: true }).click();
    await expect(page).toHaveURL(`${base}/events`);
    await expect(page.getByRole('button', { name: '事件：选中日期的新日程', exact: true })).toBeVisible();
  });
}

test('calendar filters have visible summaries and Today restores the current month', async ({ page }) => {
  await setup(page);
  await page.goto(`${base}/events`);
  await page.getByRole('button', { name: '下一个月' }).click();
  await expect(page.getByText('2030年7月', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '回到今天' }).click();
  await expect(page.getByRole('button', { name: /^2030-06-15/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '筛选日程', exact: true }).click();
  const filter = page.getByRole('dialog', { name: '筛选日程', exact: true });
  await filter.getByRole('radio', { name: '重复筛选：仅看周期性', exact: true }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await filter.getByRole('button', { name: '查看结果', exact: true }).click();
  await expect(page.getByText('仅重复', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^事件：/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^2030-06-15/ })).not.toHaveAttribute('aria-label', /个事件/);
  await page.getByRole('button', { name: '清除日程筛选', exact: true }).click();
  await expect(page.getByRole('button', { name: /^事件：/ })).toBeVisible();
});

test('direct event edit links restore drafts and confirmation stays in one window', async ({ page }) => {
  await setup(page);
  await page.goto(`${base}/events/${eventId}/edit`);
  await page.getByLabel('事件标题', { exact: true }).fill('保留修改');
  await page.reload();
  await expect(page.getByLabel('事件标题', { exact: true })).toHaveValue('保留修改');
  await page.getByRole('button', { name: '删除事件', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '删除日程' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '编辑日程' })).toBeVisible();
  await expect(page.getByLabel('事件标题', { exact: true })).toHaveValue('保留修改');
  await page.getByRole('button', { name: '关闭编辑日程' }).click();
  await expect(page.getByRole('dialog', { name: '日程详情' })).toBeVisible();
  await page.getByRole('button', { name: '关闭日程详情' }).click();
  await expect(page).toHaveURL(`${base}/events`);
});

test('an event opened from Today closes back to Today with focus restored', async ({ page }) => {
  await setup(page);
  await page.goto(`${base}/today`);
  const item = page.getByRole('button', { name: /^事件：/ });
  await item.click();
  await expect(page.getByRole('dialog', { name: '日程详情' })).toBeVisible();
  await page.getByRole('button', { name: '编辑事件', exact: true }).click();
  await page.goBack();
  await expect(page.getByRole('dialog', { name: '日程详情' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(`${base}/today`);
  await expect(item).toBeFocused();
});

test('a late response from the previous month cannot replace the selected month', async ({ page }) => {
  await setup(page);
  let releaseJune!: () => void;
  const juneGate = new Promise<void>(resolve => { releaseJune = resolve; });
  await page.route(`**/api/v1/households/${householdId}/events?**`, async route => {
    const start = new URL(route.request().url()).searchParams.get('startDate');
    if (start === '2030-06-01') await juneGate;
    await route.fulfill({ json: { events: start === '2030-06-01' ? [initialEvent] : [{ ...initialEvent, title: '七月安排', startTime: '2030-07-01T09:00:00Z', endTime: '2030-07-01T10:00:00Z' }] } });
  });
  const juneRequest = page.waitForRequest(request => request.url().includes('startDate=2030-06-01'));
  await page.goto(`${base}/events`);
  await juneRequest;
  await page.getByRole('button', { name: '下一个月' }).click();
  const july = page.getByRole('button', { name: '事件：七月安排', exact: true });
  await expect(july).toBeVisible();
  const juneResponse = page.waitForResponse(response => response.url().includes('startDate=2030-06-01'));
  releaseJune();
  await (await juneResponse).finished();
  await page.getByRole('button', { name: '筛选日程', exact: true }).click();
  await page.getByRole('button', { name: '查看结果', exact: true }).click();
  await expect(july).toBeVisible();
  await expect(page.getByRole('button', { name: /^2030-07-01/ })).toHaveAttribute('aria-pressed', 'true');
});
