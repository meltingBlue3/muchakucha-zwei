import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { loginUsernameFixture } from '../support/auth';
const api = process.env.API_ORIGIN ?? 'http://127.0.0.1:3000';
const origin = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:8081';
const password = 'family123';
async function account(request: APIRequestContext, prefix: string) {
  const username = `${prefix}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 7)}`;
  const response = await request.post(`${api}/api/v1/auth/register`, { headers: { origin }, data: { username, password, confirmPassword: password, platform: 'web' } });
  expect(response.status()).toBe(202);
  return { username, accessToken: (await response.json()).accessToken as string };
}
for (const width of [320, 390, 1440]) {
  test(`accepts from inbox at ${width}px without a link`, async ({ page, request }, testInfo) => {
    const owner = await account(request, 'owner'); const recipient = await account(request, 'recipient');
    const created = await request.post(`${api}/api/v1/households`, { headers: { authorization: `Bearer ${owner.accessToken}` }, data: { name: '周末一起做饭的温暖家庭' } });
    const household = await created.json();
    const sent = await request.post(`${api}/api/v1/households/${household.id}/invitations`, { headers: { authorization: `Bearer ${owner.accessToken}` }, data: { username: recipient.username } });
    expect(sent.status()).toBe(201);
    for (const name of ['周末出游', '家人共享日常安排']) {
      const extra = await request.post(`${api}/api/v1/households`, { headers: { authorization: `Bearer ${owner.accessToken}` }, data: { name } });
      const home = await extra.json();
      expect((await request.post(`${api}/api/v1/households/${home.id}/invitations`, { headers: { authorization: `Bearer ${owner.accessToken}` }, data: { username: recipient.username } })).status()).toBe(201);
    }
    await page.setViewportSize({ width, height: 900 });
    await loginUsernameFixture(page, recipient.username, password);
    await page.getByRole('button', { name: '查看家庭邀请' }).click();
    const inbox = page.getByRole('main', { name: '收件箱' });
    const accept = inbox.getByRole('button', { name: '接受「周末一起做饭的温暖家庭」的邀请' });
    await expect(accept).toBeVisible();
    await expect(inbox.getByRole('button', { name: /^查看消息：/ })).toHaveCount(3);
    await expect(page.getByRole('button', { name: /刷新收件箱/ })).toHaveCount(0);
    const inboxIcon = await inbox.getByRole('button', { name: '收件箱', exact: true }).boundingBox();
    const profileIcon = await inbox.getByRole('button', { name: '个人中心', exact: true }).boundingBox();
    expect(inboxIcon!.x + inboxIcon!.width).toBeLessThanOrEqual(profileIcon!.x + 1);
    const reject = await inbox.getByRole('button', { name: '拒绝「周末一起做饭的温暖家庭」的邀请' }).boundingBox();
    const acceptBox = await accept.boundingBox();
    expect(Math.abs(reject!.y - acceptBox!.y)).toBeLessThan(1);

    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`inbox-${width}.png`), fullPage: true });
    const detailTrigger = inbox.getByRole('button', { name: /查看消息：.*周末一起做饭的温暖家庭/ });
    await detailTrigger.click();
    const dialog = page.getByRole('dialog', { name: '消息详情' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('普通成员，可以查看和编辑家庭共享的日程、任务和笔记。')).toBeVisible();
    await expect(dialog.getByRole('button', { name: '关闭消息详情' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: '拒绝「周末一起做饭的温暖家庭」的邀请' })).toBeFocused();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`inbox-detail-${width}.png`), fullPage: true });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(detailTrigger).toBeFocused();
    await accept.click();
    await expect(page).toHaveURL(new RegExp(`/households/${household.id}(?:/today)?$`));
    const roster = await request.get(`${api}/api/v1/households/${household.id}`, { headers: { authorization: `Bearer ${recipient.accessToken}` } });
    expect(roster.status()).toBe(200);
    expect((await roster.json()).members).toEqual(expect.arrayContaining([expect.objectContaining({ username: recipient.username, role: 'MEMBER' })]));
    // Global inbox entry remains available after joining a household.
    await page.getByRole('button', { name: '收件箱', exact: true }).click();
    await expect(page.getByRole('button', { name: /^查看消息：/ })).toHaveCount(2);
  });
}
test('declines from inbox and persists the outcome across reload', async ({ page, request }) => {
  const owner = await account(request, 'owner'); const recipient = await account(request, 'recipient');
  const created = await request.post(`${api}/api/v1/households`, { headers: { authorization: `Bearer ${owner.accessToken}` }, data: { name: '邀请测试家庭' } });
  const household = await created.json();
  await request.post(`${api}/api/v1/households/${household.id}/invitations`, { headers: { authorization: `Bearer ${owner.accessToken}` }, data: { username: recipient.username } });
  await loginUsernameFixture(page, recipient.username, password, '/inbox');
  await page.getByRole('button', { name: /查看消息：.*邀请测试家庭/ }).click();
  await page.getByRole('dialog', { name: '消息详情' }).getByRole('button', { name: '拒绝「邀请测试家庭」的邀请' }).click();
  await expect(page.getByRole('dialog', { name: '消息详情' })).toHaveCount(0);
  await expect(page.getByText('已拒绝「邀请测试家庭」的邀请。')).toBeVisible();
  await page.reload(); await expect(page.getByText('暂无消息')).toBeVisible();
  const homes = await request.get(`${api}/api/v1/households`, { headers: { authorization: `Bearer ${recipient.accessToken}` } });
  expect(await homes.json()).toEqual([]);
  const sent = await request.get(`${api}/api/v1/households/${household.id}/invitations`, { headers: { authorization: `Bearer ${owner.accessToken}` } });
  expect((await sent.json()).invitations[0].status).toBe('declined');
});
