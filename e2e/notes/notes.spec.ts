import { expect, test, type Browser, type Page } from '@playwright/test';
import { Client } from 'pg';

import { loginUsernameFixture } from '../support/auth';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:3000';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:8081';
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://muchakucha_test:muchakucha_test_only@127.0.0.1:5432/muchakucha_test';
const password = 'correct horse battery staple 2026';

interface Account { username: string; accessToken: string; userId: string }

async function prepareAccount(seed: string, displayName: string): Promise<Account> {
  const database = new Client({ connectionString: DATABASE_URL });
  await database.connect();
  try {
    const username = `u-${seed.slice(0, 6)}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;

    const registerResponse = await fetch(`${API_ORIGIN}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({ username, confirmPassword: password, password, platform: 'web' }),
    });
    expect(registerResponse.status).toBe(202);

    const userResult = await database.query(
      `UPDATE "User" SET "display_name" = $2 WHERE "username_canonical" = lower($1) RETURNING "id"`,
      [username, displayName],
    );
    const userId = userResult.rows[0]?.id as string;
    expect(userId).toBeDefined();

    const loginResponse = await fetch(`${API_ORIGIN}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({ username, password, platform: 'web' }),
    });
    expect(loginResponse.status).toBe(200);
    const { accessToken } = (await loginResponse.json()) as { accessToken: string };
    expect(accessToken).toBeDefined();

    return { username, accessToken, userId };
  } finally {
    await database.end();
  }
}

async function apiCall(
  accessToken: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const response = await fetch(`${API_ORIGIN}/api/v1${path}`, {
    method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text === '' ? null : JSON.parse(text) };
}

async function createHousehold(accessToken: string, name: string): Promise<string> {
  const response = await apiCall(accessToken, 'POST', '/households', { name });
  expect(response.status).toBe(201);
  return response.body.id as string;
}

async function addMembershipViaDb(householdId: string, userId: string): Promise<void> {
  const database = new Client({ connectionString: DATABASE_URL });
  await database.connect();
  try {
    await database.query(
      `INSERT INTO "memberships" ("user_id", "household_id", "role") VALUES ($1, $2, 'MEMBER')`,
      [userId, householdId],
    );
  } finally {
    await database.end();
  }
}

/** The note's window: a named region beside the list on a wide screen, a dialog on a phone. */
const noteWindow = (page: Page) => page.getByRole((page.viewportSize()?.width ?? 0) >= 1024 ? 'region' : 'dialog', { name: '笔记', exact: true });
const editor = (page: Page) => page.getByRole('textbox', { name: '笔记内容', exact: true });
const saveState = (page: Page) => page.getByTestId('note-save-state');
const box = (page: Page, text: string) => editor(page).getByRole('checkbox', { name: new RegExp(`^(已勾选|未勾选)：${text}$`) });

async function signedIn(browser: Browser, account: Account, destination: string, viewport = { width: 1280, height: 720 }): Promise<Page> {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await loginUsernameFixture(page, account.username, password, destination);
  return page;
}

test('a note is written in place, saves itself, and is deleted from its own menu', async ({ page }) => {
  const owner = await prepareAccount('owner', '笔记主人');
  const householdId = await createHousehold(owner.accessToken, '笔记之家');
  const notesPath = `/households/${encodeURIComponent(householdId)}/notes`;

  await loginUsernameFixture(page, owner.username, password, notesPath);
  await expect(page.getByText('还没有笔记', { exact: true })).toBeVisible();

  // --- New: the title is the document's first line, and Enter moves into the body ---
  await page.getByRole('button', { name: '创建笔记' }).first().click();
  await expect(page).toHaveURL(new RegExp(`${notesPath}/new$`));
  await expect(editor(page)).not.toBeFocused();
  await editor(page).locator('h1.note-title').click();
  await page.keyboard.type('暑假计划');
  await page.keyboard.press('Enter');
  await page.keyboard.type('游泳课');
  await page.keyboard.press('Enter');
  await page.keyboard.type('看外婆');
  await expect(saveState(page)).toHaveText('已保存');
  // The first save created the note, and the page took its address without reopening.
  await expect(page).toHaveURL(new RegExp(`${notesPath}/[0-9a-f-]{36}$`));
  const noteId = page.url().split('/').pop()!;
  const listed = await apiCall(owner.accessToken, 'GET', `/households/${householdId}/notes`);
  expect(listed.body.total).toBe(1);
  expect(listed.body.notes[0]).toMatchObject({ id: noteId, title: '暑假计划', body: '游泳课\n\n看外婆', createdBy: owner.userId, updatedBy: owner.userId });
  await expect(noteWindow(page)).toContainText('笔记主人写');

  // --- Reading again changes nothing ---
  await page.reload();
  await expect(editor(page).locator('h1.note-title')).toHaveText('暑假计划');
  await expect(saveState(page)).toHaveText('已保存');
  await page.waitForTimeout(1500);
  expect((await apiCall(owner.accessToken, 'GET', `/households/${householdId}/notes/${noteId}`)).body.updatedAt).toBe(listed.body.notes[0].updatedAt);

  // --- Editing the title saves it, and closing shows it in the list ---
  await editor(page).locator('h1.note-title').click();
  await page.keyboard.press('End');
  await page.keyboard.type('（改）');
  await expect(saveState(page)).toHaveText('已保存');
  await expect.poll(async () => (await apiCall(owner.accessToken, 'GET', `/households/${householdId}/notes/${noteId}`)).body.title).toBe('暑假计划（改）');
  await page.getByRole('button', { name: '关闭笔记', exact: true }).click();
  const card = page.getByRole('button', { name: '笔记：暑假计划（改）', exact: true });
  await expect(card).toContainText('游泳课');

  // --- Delete from the note's own 「…」: cancel keeps it, confirm returns to the empty list ---
  await card.click();
  await noteWindow(page).getByRole('button', { name: '更多操作：笔记：暑假计划（改）', exact: true }).click();
  await page.getByRole('menuitem', { name: '删除笔记：暑假计划（改）', exact: true }).click();
  const question = page.getByRole('dialog', { name: '删除笔记', exact: true });
  await question.getByRole('button', { name: '取消', exact: true }).click();
  await expect(question).toBeHidden();
  await expect(editor(page)).toBeVisible();
  await noteWindow(page).getByRole('button', { name: '更多操作：笔记：暑假计划（改）', exact: true }).click();
  await page.getByRole('menuitem', { name: '删除笔记：暑假计划（改）', exact: true }).click();
  await question.getByRole('button', { name: '删除笔记', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${notesPath}$`));
  await expect(page.getByText('还没有笔记', { exact: true })).toBeVisible();
  expect((await apiCall(owner.accessToken, 'GET', `/households/${householdId}/notes/${noteId}`)).status).toBe(404);
});

test('household members see shared notes, most recently updated first, and can search them', async ({ page }) => {
  const owner = await prepareAccount('shared-owner', '笔记主人');
  const member = await prepareAccount('shared-member', '笔记成员');
  const householdId = await createHousehold(owner.accessToken, '共享笔记之家');
  await addMembershipViaDb(householdId, member.userId);

  for (const title of ['Wi-Fi 密码', '垃圾分类时间']) {
    const created = await apiCall(owner.accessToken, 'POST', `/households/${householdId}/notes`, { title });
    expect(created.status).toBe(201);
  }

  await loginUsernameFixture(page, member.username, password, `/households/${encodeURIComponent(householdId)}/notes`);

  const cards = page.getByRole('button', { name: /^笔记：/ });
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toHaveAccessibleName('笔记：垃圾分类时间');
  await expect(cards.nth(1)).toHaveAccessibleName('笔记：Wi-Fi 密码');
  // A wide screen opens the latest note beside the list on arrival.
  await expect(editor(page).locator('h1.note-title')).toHaveText('垃圾分类时间');

  // --- Title search narrows the list without a round trip ---
  const search = page.getByLabel('搜索笔记');
  await search.fill('密码');
  await expect(cards).toHaveCount(1);
  await expect(cards.nth(0)).toHaveAccessibleName('笔记：Wi-Fi 密码');

  // --- A query matching nothing explains itself and can be cleared ---
  await search.fill('不存在的标题');
  await expect(cards).toHaveCount(0);
  await expect(page.getByText('没有笔记匹配「不存在的标题」。', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '清除搜索' }).click();
  await expect(cards).toHaveCount(2);
});

test('a member edits another member’s shared note without gaining deletion rights', async ({ page }) => {
  const owner = await prepareAccount('edit-owner', '笔记主人');
  const creator = await prepareAccount('edit-author', '笔记作者');
  const member = await prepareAccount('edit-member', '协作成员');
  const householdId = await createHousehold(owner.accessToken, '协作笔记之家');
  await addMembershipViaDb(householdId, creator.userId);
  await addMembershipViaDb(householdId, member.userId);
  const created = await apiCall(creator.accessToken, 'POST', `/households/${householdId}/notes`, { title: '采购清单', body: '牛奶' });
  expect(created.status).toBe(201);
  const noteId = created.body.id as string;

  await loginUsernameFixture(page, member.username, password, `/households/${householdId}/notes/${noteId}`);
  await editor(page).getByText('牛奶', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.type('、面包');
  await expect(saveState(page)).toHaveText('已保存');
  await expect(noteWindow(page)).toContainText('笔记作者写 · 协作成员');
  // The note's menu copies but does not delete for someone who did not write it.
  await noteWindow(page).getByRole('button', { name: '更多操作：笔记：采购清单', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: '复制为 Markdown', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /^删除笔记：/ })).toHaveCount(0);
  await page.keyboard.press('Escape');

  const deleted = await apiCall(member.accessToken, 'DELETE', `/households/${householdId}/notes/${noteId}`);
  expect(deleted.status).toBe(403);
  const saved = await apiCall(creator.accessToken, 'GET', `/households/${householdId}/notes/${noteId}`);
  expect(saved.body).toMatchObject({ title: '采购清单', body: '牛奶、面包', createdBy: creator.userId, updatedBy: member.userId });
});

test('a box ticked by one member is ticked for another after a refresh', async ({ browser }) => {
  const owner = await prepareAccount('tick-owner', '妈妈');
  const member = await prepareAccount('tick-member', '爸爸');
  const householdId = await createHousehold(owner.accessToken, '勾选之家');
  await addMembershipViaDb(householdId, member.userId);
  const created = await apiCall(owner.accessToken, 'POST', `/households/${householdId}/notes`, { title: '菜场', body: '- [ ] 排骨\n- [ ] 小葱' });
  const path = `/households/${householdId}/notes/${created.body.id}`;
  const mother = await signedIn(browser, owner, path);
  const father = await signedIn(browser, member, path);
  try {
    await expect(box(mother, '排骨')).not.toBeChecked();
    await box(father, '排骨').click();
    await expect(box(father, '排骨')).toBeChecked();
    // Ticking does not put the caret in the text.
    await expect(editor(father)).not.toBeFocused();
    await expect.poll(async () => (await apiCall(owner.accessToken, 'GET', `/households/${householdId}/notes/${created.body.id}`)).body.body).toBe('- [x] 排骨\n- [ ] 小葱');
    await mother.reload();
    await expect(box(mother, '排骨')).toBeChecked();
    await expect(box(mother, '小葱')).not.toBeChecked();
  } finally {
    await mother.context().close();
    await father.context().close();
  }
});

test('a tick merges into another member’s change, and a text change against theirs pauses and asks', async ({ browser }) => {
  const owner = await prepareAccount('merge-owner', '妈妈');
  const member = await prepareAccount('merge-member', '爸爸');
  const householdId = await createHousehold(owner.accessToken, '合并之家');
  await addMembershipViaDb(householdId, member.userId);
  const created = await apiCall(owner.accessToken, 'POST', `/households/${householdId}/notes`, { title: '菜场', body: '- [ ] 排骨\n- [ ] 小葱' });
  const noteId = created.body.id as string;
  const read = async () => (await apiCall(owner.accessToken, 'GET', `/households/${householdId}/notes/${noteId}`)).body;
  const path = `/households/${householdId}/notes/${noteId}`;
  const mother = await signedIn(browser, owner, path);
  const father = await signedIn(browser, member, path);
  try {
    // Mother adds an item; father still has the note as it was when he opened it.
    await editor(mother).getByText('小葱', { exact: true }).click();
    await mother.keyboard.press('End');
    await mother.keyboard.press('Enter');
    await mother.keyboard.type('西红柿');
    await expect(saveState(mother)).toHaveText('已保存');
    await expect.poll(async () => (await read()).body).toBe('- [ ] 排骨\n- [ ] 小葱\n- [ ] 西红柿');

    // His tick lands on her version without asking him anything.
    await box(father, '小葱').click();
    await expect.poll(async () => (await read()).body).toBe('- [ ] 排骨\n- [x] 小葱\n- [ ] 西红柿');
    await expect(editor(father).getByText('西红柿', { exact: true })).toBeVisible();
    await expect(box(father, '小葱')).toBeChecked();
    await expect(father.getByRole('alert')).toHaveCount(0);
    await expect(saveState(father)).toHaveText('已保存');

    // Her next words meet his save: saving stops and she is asked, with her text kept.
    const before = await read();
    await editor(mother).getByText('西红柿', { exact: true }).click();
    await mother.keyboard.press('End');
    await mother.keyboard.type(' 6 个');
    const banner = mother.getByRole('alert').filter({ hasText: '在你写的时候也改了这篇' });
    await expect(banner).toContainText('爸爸在你写的时候也改了这篇。自动保存先停下，你的内容还在。');
    await expect(saveState(mother)).toHaveText('未保存');
    expect((await read()).updatedAt).toBe(before.updatedAt);
    await expect(editor(mother).getByText('西红柿 6 个', { exact: true })).toBeVisible();
    await banner.getByRole('button', { name: '对照最新内容', exact: true }).click();
    await expect(banner).toContainText('正文：- [ ] 排骨 - [x] 小葱 - [ ] 西红柿');
    await banner.getByRole('button', { name: '用我的版本保存', exact: true }).click();
    await expect(saveState(mother)).toHaveText('已保存');
    await expect.poll(async () => (await read()).body).toBe('- [ ] 排骨\n- [ ] 小葱\n- [ ] 西红柿 6 个');
  } finally {
    await mother.context().close();
    await father.context().close();
  }
});

test('a member pins another member’s note from its header, and the household finds it on top', async ({ browser }) => {
  const owner = await prepareAccount('pin-owner', '妈妈');
  const member = await prepareAccount('pin-member', '爸爸');
  const householdId = await createHousehold(owner.accessToken, '置顶之家');
  await addMembershipViaDb(householdId, member.userId);
  const wifi = (await apiCall(owner.accessToken, 'POST', `/households/${householdId}/notes`, { title: '家里的 Wi-Fi', body: '密码贴在路由器背面' })).body;
  await apiCall(owner.accessToken, 'POST', `/households/${householdId}/notes`, { title: '旅行计划' });
  const read = async () => (await apiCall(owner.accessToken, 'GET', `/households/${householdId}/notes/${wifi.id}`)).body;
  const father = await signedIn(browser, member, `/households/${householdId}/notes/${wifi.id}`);
  try {
    await noteWindow(father).getByRole('button', { name: '置顶', exact: true }).click();
    await expect(noteWindow(father).getByRole('button', { name: '取消置顶', exact: true })).toBeVisible();
    await expect.poll(async () => (await read()).pinnedAt).not.toBeNull();
    // A pin is not an edit: the note keeps its version and its last editor.
    expect(await read()).toMatchObject({ updatedAt: wifi.updatedAt, updatedBy: owner.userId });
  } finally {
    await father.context().close();
  }

  const mother = await signedIn(browser, owner, `/households/${householdId}/notes`, { width: 390, height: 844 });
  try {
    const cards = mother.getByRole('button', { name: /^笔记：/ });
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toHaveAccessibleName('笔记：家里的 Wi-Fi，已置顶');
    await expect(cards.nth(1)).toHaveAccessibleName('笔记：旅行计划');
    await expect(mother.getByText('置顶', { exact: true })).toBeVisible();
    await expect(mother.getByText('其他', { exact: true })).toBeVisible();
  } finally {
    await mother.context().close();
  }
});

test('relabelling a note while someone writes it never stops their saving', async ({ browser }) => {
  const owner = await prepareAccount('label-owner', '妈妈');
  const member = await prepareAccount('label-member', '爸爸');
  const householdId = await createHousehold(owner.accessToken, '标签笔记之家');
  await addMembershipViaDb(householdId, member.userId);
  const created = await apiCall(owner.accessToken, 'POST', `/households/${householdId}/notes`, { title: '菜场', body: '- [ ] 排骨' });
  const noteId = created.body.id as string;
  const read = async () => (await apiCall(owner.accessToken, 'GET', `/households/${householdId}/notes/${noteId}`)).body;
  const path = `/households/${householdId}/notes/${noteId}`;
  const mother = await signedIn(browser, owner, path);
  const father = await signedIn(browser, member, path);
  try {
    await editor(mother).getByText('排骨', { exact: true }).click();
    await mother.keyboard.press('End');
    await mother.keyboard.type(' 两斤');
    await expect.poll(async () => (await read()).body).toBe('- [ ] 排骨 两斤');

    // He labels the note she is writing, from his own copy of it.
    await noteWindow(father).getByRole('button', { name: '标签', exact: true }).click();
    const picker = father.getByRole('dialog', { name: '标签', exact: true });
    await picker.getByRole('button', { name: '选择标签 采买', exact: true }).click();
    await picker.getByRole('button', { name: '完成', exact: true }).click();
    await expect(picker).toBeHidden();
    await expect(noteWindow(father).getByRole('button', { name: '标签：采买', exact: true })).toBeVisible();
    await expect.poll(async () => (await read()).labels.map((label: { name: string }) => label.name)).toEqual(['采买']);

    // She goes on writing against the version she opened: no conflict, nothing lost.
    await mother.keyboard.type('，要新鲜的');
    await expect.poll(async () => (await read()).body).toBe('- [ ] 排骨 两斤，要新鲜的');
    await expect(saveState(mother)).toHaveText('已保存');
    await expect(mother.getByRole('alert')).toHaveCount(0);
    expect(await read()).toMatchObject({ updatedBy: owner.userId, labels: [expect.objectContaining({ name: '采买' })] });
  } finally {
    await mother.context().close();
    await father.context().close();
  }
});

test('a label put on a note filters the list down to it, and a body search shows where it matched', async ({ page }) => {
  const owner = await prepareAccount('find-owner', '妈妈');
  const householdId = await createHousehold(owner.accessToken, '找得到之家');
  const notesPath = `/households/${encodeURIComponent(householdId)}/notes`;
  const shopping = (await apiCall(owner.accessToken, 'POST', `/households/${householdId}/notes`, { title: '周末采购', body: '- [x] 排骨\n- [ ] 小葱' })).body;
  await apiCall(owner.accessToken, 'POST', `/households/${householdId}/notes`, { title: '旅行计划', body: '七月去青岛，订海边的酒店，带上防晒霜和泳衣。' });

  await loginUsernameFixture(page, owner.username, password, notesPath);
  const cards = page.getByRole('button', { name: /^笔记：/ });
  await expect(cards).toHaveCount(2);
  // Nothing carries a label yet, so there is no label row.
  await expect(page.getByRole('radiogroup', { name: '按标签筛选' })).toHaveCount(0);

  await page.getByRole('button', { name: '笔记：周末采购，清单 1/2', exact: true }).click();
  await expect(editor(page).locator('h1.note-title')).toHaveText('周末采购');
  await noteWindow(page).getByRole('button', { name: '标签', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '标签', exact: true });
  await picker.getByRole('button', { name: '选择标签 采买', exact: true }).click();
  await picker.getByRole('button', { name: '完成', exact: true }).click();
  await expect(noteWindow(page).getByRole('button', { name: '标签：采买', exact: true })).toBeVisible();
  await expect.poll(async () => (await apiCall(owner.accessToken, 'GET', `/households/${householdId}/notes/${shopping.id}`)).body.labels.length).toBe(1);

  const row = page.getByRole('radiogroup', { name: '按标签筛选' });
  await expect(row.getByRole('radio', { name: '全部', exact: true })).toBeChecked();
  await row.getByRole('radio', { name: '采买', exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.nth(0)).toHaveAccessibleName('笔记：周末采购，清单 1/2，采买');
  await row.getByRole('radio', { name: '全部', exact: true }).click();
  await expect(cards).toHaveCount(2);

  // --- The search reads bodies too, and the row shows the words around the match ---
  await page.getByLabel('搜索笔记').fill('防晒');
  await expect(cards).toHaveCount(1);
  await expect(cards.nth(0)).toHaveAccessibleName('笔记：旅行计划');
  await expect(cards.nth(0).getByTestId('note-snippet')).toHaveText('…青岛，订海边的酒店，带上防晒霜和泳衣。');
  await expect(cards.nth(0).getByTestId('note-snippet').getByText('防晒', { exact: true })).toBeVisible();
});

test('a new note offers no pin or labels until its first save', async ({ page }) => {
  const owner = await prepareAccount('new-owner', '妈妈');
  const householdId = await createHousehold(owner.accessToken, '新笔记之家');
  const notesPath = `/households/${encodeURIComponent(householdId)}/notes`;

  await loginUsernameFixture(page, owner.username, password, notesPath);
  await page.getByRole('button', { name: '创建笔记' }).first().click();
  await expect(page).toHaveURL(new RegExp(`${notesPath}/new$`));
  await expect(editor(page)).toBeVisible();
  await expect(noteWindow(page).getByRole('button', { name: '置顶', exact: true })).toHaveCount(0);
  await expect(noteWindow(page).getByRole('button', { name: '标签', exact: true })).toHaveCount(0);

  await editor(page).locator('h1.note-title').click();
  await page.keyboard.type('开学要带的');
  await expect(saveState(page)).toHaveText('已保存');
  await expect(page).toHaveURL(new RegExp(`${notesPath}/[0-9a-f-]{36}$`));
  await expect(noteWindow(page).getByRole('button', { name: '置顶', exact: true })).toBeVisible();
  await expect(noteWindow(page).getByRole('button', { name: '标签', exact: true })).toBeVisible();
});
