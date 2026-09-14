import { expect, test, type Page } from '@playwright/test';

const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const taskId = '33333333-3333-4333-8333-333333333333';
const household = (id: string) => ({ id, name: id === a ? '家庭 A' : '家庭 B', role: 'OWNER', memberCount: 1, ownerMembershipId: 'member' });

async function setup(page: Page) {
  const requests: { path: string; method: string; data: unknown }[] = [];
  let labelAttempts = 0;
  let invitationAttempts = 0;
  const task = { id: taskId, householdId: a, title: '检查任务', status: 'pending', priority: 'medium', dueDate: null, description: null, assigneeIds: [], labels: [], createdBy: 'user', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), recurrenceRuleId: null, recurrence: null, occurrenceDate: null };
  await page.addInitScript((id) => localStorage.setItem('muchakucha:currentHouseholdId', id), b);
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    requests.push({ path, method, data: route.request().postData() });
    let body: unknown = {};
    let status = 200;
    if (path.endsWith('/auth/refresh')) body = { accessToken: 'mock-only' };
    else if (path.endsWith('/users/me')) body = { id: 'user', username: 'review', displayName: '检查用户', hasHousehold: true };
    else if (path === '/api/v1/households') body = [household(a), household(b)];
    else if (path.endsWith('/invitations/preview')) {
      invitationAttempts++;
      const token = new URL(route.request().url()).searchParams.get('token');
      if (token === 'retry' && invitationAttempts === 1) status = 503;
      body = token === 'invalid' ? { kind: 'invalid' } : { kind: 'valid', householdName: '家庭 A', inviterDisplayName: '家人', expiresAt: '2099-01-01T00:00:00Z' };
    } else if (/\/(tasks|events)\/.+\/labels$/.test(path) && method === 'POST') {
      labelAttempts++;
      status = labelAttempts === 1 ? 503 : 200;
    } else if (path.endsWith('/labels')) body = { labels: [{ id: 'label', name: '家务', color: '#277A72' }] };
    else if (path.endsWith('/tasks/' + taskId) && method === 'PUT') { status = 403; body = { error: { code: 'FORBIDDEN' } }; }
    else if (path.endsWith('/tasks')) body = method === 'POST' ? task : { tasks: [task] };
    else if (path.endsWith('/events')) body = method === 'POST' ? { id: taskId } : { events: [] };
    else if (path.endsWith('/notes')) body = method === 'POST' ? { id: taskId } : { notes: [] };
    else if (path.endsWith('/' + a) || path.endsWith('/' + b)) body = { ...household(path.endsWith(a) ? a : b), members: [] };
    else status = 404;
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return requests;
}

test('deep links use the route household and preserve operation failures', async ({ page }) => {
  const requests = await setup(page);
  await page.goto(`/households/${a}/today`);
  await expect(page.getByRole('button', { name: '当前家庭：家庭 A，切换家庭' })).toBeVisible();
  await page.getByRole('button', { name: '开始任务', exact: true }).click();
  await expect(page.getByText('你没有权限修改这个任务。')).toBeVisible();
  await expect(page.getByText('检查任务', { exact: true })).toBeVisible();
  expect(requests.some((r) => r.method === 'PUT' && r.path === `/api/v1/households/${a}/tasks/${taskId}`)).toBe(true);
});

test('family management is a restorable destination', async ({ page }) => {
  await setup(page);
  await page.goto(`/households/${a}/more`);
  await expect(page.getByRole('tab', { name: '家庭', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(new RegExp(`/households/${a}/more$`));
});

test('task filters and calendar month survive tab switches', async ({ page }) => {
  await setup(page);
  await page.goto(`/households/${a}/tasks`);
  await page.getByRole('button', { name: '筛选任务', exact: true }).click();
  await page.getByLabel('筛选：待办', { exact: true }).click();
  await page.getByRole('tab', { name: '日历', exact: true }).click();
  await page.getByLabel('下一个月').click();
  const nextMonth = await page.getByText(/^\d{4}年\s*\d{1,2}月$/).innerText();
  await page.getByRole('tab', { name: '任务', exact: true }).click();
  await expect(page.getByRole('button', { name: '筛选任务，已选择 1 项' })).toBeVisible();
  await page.getByRole('tab', { name: '日历', exact: true }).click();
  await expect(page.getByText(nextMonth, { exact: true })).toBeVisible();
});

for (const kind of ['tasks', 'events'] as const) {
  test(`${kind} creation retries labels without creating duplicates`, async ({ page }) => {
    const requests = await setup(page);
    await page.goto(`/households/${a}/${kind}`);
    await page.getByLabel(kind === 'tasks' ? '创建任务' : '创建事件', { exact: true }).click();
    await page.getByLabel(kind === 'tasks' ? '任务标题' : '事件标题', { exact: true }).fill('只创建一次');
    if (kind === 'tasks') {
      await expect(page.getByText('保存到：家庭 A', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: /当前家庭/ })).toHaveCount(0);
    }
    await page.getByLabel('选择标签 家务', { exact: true }).click();
    await page.getByLabel(kind === 'tasks' ? '创建任务' : '创建', { exact: true }).filter({ visible: true }).last().click();
    await expect(page.getByText('内容已创建，但标签未保存。重试只会保存标签，不会重复创建。')).toBeVisible();
    await page.getByRole('button', { name: '重试保存标签' }).click();
    await expect(page).toHaveURL(new RegExp(`/households/${a}/${kind}$`));
    expect(requests.filter((r) => r.method === 'POST' && r.path.endsWith('/' + kind))).toHaveLength(1);
    expect(requests.filter((r) => r.method === 'POST' && r.path.endsWith('/labels'))).toHaveLength(2);
  });
}

test('a note draft survives cancel and is cleared only after successful save', async ({ page }) => {
  await setup(page);
  await page.goto(`/households/${a}/notes`);
  await page.getByLabel('创建笔记', { exact: true }).click();
  await page.getByLabel('笔记标题').fill('还没写完');
  await page.getByLabel('笔记内容').fill('第一行内容');
  await page.getByLabel('取消', { exact: true }).click();
  await page.getByLabel('创建笔记', { exact: true }).click();
  await expect(page.getByLabel('笔记标题')).toHaveValue('还没写完');
  await expect(page.getByLabel('笔记内容')).toHaveValue('第一行内容');
  await page.getByLabel('创建', { exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/households/${a}/notes$`));
  await page.getByRole('main', { name: '家庭笔记', exact: true }).getByLabel('创建笔记', { exact: true }).click();
  await expect(page.getByLabel('笔记标题')).toHaveValue('');
});

test('invalid invitations can be replaced and temporary failures retried', async ({ page }) => {
  await setup(page);
  await page.goto('/invite');
  await page.getByLabel('邀请链接或邀请码').fill('invalid');
  await page.getByRole('button', { name: '查看邀请' }).click();
  await page.getByRole('button', { name: '重新输入邀请链接' }).click();
  await expect(page.getByLabel('邀请链接或邀请码')).toHaveValue('');
  await page.getByLabel('邀请链接或邀请码').fill('valid');
  await page.getByRole('button', { name: '查看邀请' }).click();
  await expect(page.getByRole('button', { name: '接受邀请', exact: true })).toBeVisible();
});

test('a failed invitation preview has a working retry action', async ({ page }) => {
  await setup(page);
  await page.goto('/invite');
  await page.getByLabel('邀请链接或邀请码').fill('retry');
  await page.getByRole('button', { name: '查看邀请' }).click();
  await page.getByRole('button', { name: '重试加载邀请' }).click();
  await expect(page.getByRole('button', { name: '接受邀请', exact: true })).toBeVisible();
});
