import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// A note on a phone, from the Android acceptance run of 2026-11-25. The browser
// stands in for the WebView: a short window for the keyboard, and Chrome for
// Android's user agent where ProseMirror leaves Enter to the browser.

const householdId = '11111111-1111-4111-8111-111111111111';
const base = `/households/${householdId}`;
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 15; RMX3820) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Mobile Safari/537.36';

interface Label { id: string; name: string; color: string }
interface Note { id: string; householdId: string; title: string; body: string | null; createdBy: string; updatedBy: string; createdAt: string; updatedAt: string; pinnedAt: string | null; labels: Label[] }

/** Note ids are UUIDs, as the app expects in an address. */
const noteId = (n: number) => `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`;
const note = (id: string, title: string, body: string | null, labels: Label[] = []): Note => ({
  id, householdId, title, body, createdBy: 'user', updatedBy: 'user', createdAt: '2030-06-01T00:00:00Z', updatedAt: '2030-06-01T00:00:00Z', pinnedAt: null, labels,
});

/** Mocks one household of notes and labels; returns the note saves the page sends. */
async function setup(page: Page, notes: Note[], { labels = [], labelsSaved }: { labels?: Label[]; labelsSaved?: Promise<void> } = {}) {
  const known = [...labels];
  const saves: Array<{ title: string; body: string | null }> = [];
  await page.clock.setFixedTime(new Date('2030-06-15T04:00:00Z'));
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const household = { id: householdId, name: '周末的家', role: 'OWNER', memberCount: 1, ownerMembershipId: 'member' };
    const one = /\/notes\/([^/]+)(\/labels)?$/.exec(path);
    let body: unknown = {};
    if (path.endsWith('/auth/refresh')) body = { accessToken: 'mock-only' };
    else if (path.endsWith('/users/me')) body = { id: 'user', username: 'review', displayName: '小林' };
    else if (path.endsWith('/users/me/reminder-settings')) body = { taskMinutesBefore: 0, eventMinutesBefore: 15, dateOnlyTime: '09:00', alarm: false, households: [] };
    else if (path === '/api/v1/households') body = [household];
    else if (path.endsWith('/' + householdId)) body = { ...household, members: [{ membershipId: 'member', userId: 'user', displayName: '小林', role: 'OWNER', isCurrentUser: true }] };
    else if (path.endsWith('/invitations/inbox')) body = { invitations: [] };
    else if (path.endsWith('/events')) body = { events: [] };
    else if (path.endsWith('/tasks')) body = { tasks: [] };
    else if (path.endsWith('/notes')) body = { notes, total: notes.length };
    else if (one) {
      const index = notes.findIndex(item => item.id === one[1]);
      if (one[2] && method === 'PUT') {
        await labelsSaved;
        const ids = (route.request().postDataJSON() as { labelIds: string[] }).labelIds;
        notes[index] = { ...notes[index]!, labels: known.filter(label => ids.includes(label.id)) };
      } else if (method === 'PUT') {
        const sent = route.request().postDataJSON() as { title: string; body: string | null };
        saves.push({ title: sent.title, body: sent.body });
        notes[index] = { ...notes[index]!, title: sent.title, body: sent.body, updatedAt: new Date().toISOString() };
      }
      body = notes[index];
    } else if (path.endsWith('/labels')) {
      if (method === 'POST') { const created = { id: `label-${known.length}`, ...(route.request().postDataJSON() as object) } as Label; known.push(created); body = created; }
      else body = { labels: known };
    } else throw new Error(`Unexpected API ${method} ${path}`);
    await route.fulfill({ json: body });
  });
  return saves;
}

const editorOf = (page: Page) => page.getByRole('textbox', { name: '笔记内容', exact: true });

test('a note keeps its saved text when crossing the phone sheet breakpoint', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = noteId(2);
  const saves = await setup(page, [note(id, '买菜', '牛奶')]);
  await page.goto(`${base}/notes/${id}`);
  const editor = editorOf(page);
  await editor.getByText('牛奶', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.type('和面包');
  await expect.poll(() => saves.at(-1)?.body).toBe('牛奶和面包');
  await expect(page.getByTestId('note-save-state')).toContainText('已保存');

  await page.setViewportSize({ width: 650, height: 844 });
  await expect.poll(async () => (await page.getByTestId('app-dialog-panel').boundingBox())?.width ?? 0).toBeGreaterThan(500);
  await expect(editor).toContainText('牛奶和面包');
});

test.describe('with Chrome for Android', () => {
  test.use({ userAgent: ANDROID_CHROME });

  test('Enter in the middle of the title goes to the body and leaves the title whole', async ({ page }) => {
    const saves = await setup(page, [note(noteId(1), '周末采买清单', '牛奶\n鸡蛋')]);
    await page.goto(`${base}/notes/${noteId(1)}`);
    const title = editorOf(page).locator('h1.note-title');
    await title.click();
    await page.keyboard.press('Home');
    for (let step = 0; step < 3; step++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await page.keyboard.type('先');
    await expect.poll(() => saves.at(-1)).toEqual({ title: '周末采买清单', body: '先牛奶\n鸡蛋' });
    await expect(title).toHaveText('周末采买清单');
  });
});

test('a short note takes a tap anywhere on its page, not only on its lines', async ({ page }) => {
  const saves = await setup(page, [note(noteId(2), '买菜', '牛奶')]);
  await page.goto(`${base}/notes/${noteId(2)}`);
  const editor = editorOf(page);
  await expect(editor).toContainText('牛奶');
  const pane = (await page.locator('.note-editor').boundingBox())!;
  // Low on the empty page, well away from the two lines of text.
  await page.mouse.click(pane.x + pane.width - 24, pane.y + pane.height * 0.8);
  await expect(editor).toBeFocused();
  await page.keyboard.type('和面包');
  await expect.poll(() => saves.at(-1)).toEqual({ title: '买菜', body: '牛奶和面包' });
});

test('the / menu fits the room the keyboard leaves, on the side that has it', async ({ page }) => {
  await setup(page, [note(noteId(2), '买菜', '牛奶\n\n鸡蛋\n\n面包')]);
  await page.setViewportSize({ width: 390, height: 400 });
  await page.goto(`${base}/notes/${noteId(2)}`);
  await editorOf(page).getByText('面包', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/');
  const menu = page.getByRole('listbox', { name: '插入', exact: true });
  await expect(menu).toBeVisible();
  const box = (await menu.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(400);
  // Low on the page it opens above the line with most of its height, not squeezed below it.
  const line = (await editorOf(page).locator('p').last().boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(line.y);
  expect(box.height).toBeGreaterThan(200);
  // Every command is still there: the menu scrolls inside the room it has.
  await expect(menu.getByRole('option')).toHaveCount(9);
  // It is drawn above the note's window, so a finger can pick from it.
  await menu.getByRole('option', { name: '待办清单', exact: true }).click();
  await expect(editorOf(page).getByRole('checkbox')).toHaveCount(1);
});

test('the line being written stays in sight when the keyboard takes the lower half', async ({ page }) => {
  const body = Array.from({ length: 40 }, (_, index) => `第 ${index + 1} 行`).join('\n\n');
  await setup(page, [note(noteId(3), '长笔记', body)]);
  await page.goto(`${base}/notes/${noteId(3)}`);
  await editorOf(page).getByText('第 40 行', { exact: true }).click();
  await page.keyboard.press('End');
  await page.setViewportSize({ width: 390, height: 420 });
  await expect.poll(() => page.evaluate(() => {
    const range = getSelection()!.getRangeAt(0);
    const caret = range.getClientRects()[0] ?? range.getBoundingClientRect();
    const pane = document.querySelector('.note-editor')!.getBoundingClientRect();
    return caret.top >= pane.top && caret.bottom <= pane.bottom;
  })).toBe(true);
});

test('新建标签 in a note’s label step is a step of its own, and the new label shows on the note at once', async ({ page }) => {
  let saveLabels!: () => void;
  const labelsSaved = new Promise<void>(resolve => { saveLabels = resolve; });
  await setup(page, [note(noteId(2), '买菜', '牛奶')], { labels: [{ id: 'chores', name: '家务', color: '#277A72' }], labelsSaved });
  await page.goto(`${base}/notes/${noteId(2)}`);
  await page.getByRole('button', { name: '标签', exact: true }).click();
  const choice = page.getByRole('dialog', { name: '标签', exact: true });
  await choice.getByRole('button', { name: '新建标签', exact: true }).click();
  const create = page.getByRole('dialog', { name: '新建标签', exact: true });
  // The label list and its 完成 wait behind this step instead of sharing the window with it.
  await expect(create.getByLabel('标签名称', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '选择标签 家务', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: '完成', exact: true })).toBeHidden();
  await create.getByLabel('标签名称', { exact: true }).fill('旅行');
  await create.getByRole('button', { name: '创建并选中', exact: true }).click();
  await expect(choice.getByRole('button', { name: '取消选择标签 旅行', exact: true })).toBeVisible();
  await choice.getByRole('button', { name: '完成', exact: true }).click();
  // On the note before its labels are saved.
  await expect(page.getByRole('button', { name: '标签：旅行', exact: true })).toBeVisible();
  saveLabels();
  await expect(page.getByRole('button', { name: '标签：旅行', exact: true })).toBeVisible();
});

test('a pending refresh keeps a newly created note label selected and saves it on 完成', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = noteId(2);
  const chores = { id: 'chores', name: '家务', color: '#277A72' };
  const other = { id: 'school', name: '学校', color: '#4C7537' };
  let finishRefresh!: () => void;
  const pendingRefresh = new Promise<void>(resolve => { finishRefresh = resolve; });
  let delay = false;
  await setup(page, [note(id, '买菜', '牛奶', [chores])], { labels: [chores] });
  const labelsUrl = `**/api/v1/households/${householdId}/labels`;
  await page.route(labelsUrl, async route => {
    if (!delay || route.request().method() !== 'GET') return route.fallback();
    await pendingRefresh;
    await route.fulfill({ json: { labels: [chores, other] } });
  });
  await page.goto(`${base}/notes/${id}`);
  const labelsButton = page.getByRole('button', { name: '标签', exact: true });
  const choice = page.getByRole('dialog', { name: '标签', exact: true });
  await labelsButton.click();
  await expect(choice.getByRole('button', { name: '取消选择标签 家务' })).toBeVisible();
  await choice.getByRole('button', { name: '取消', exact: true }).click();

  delay = true;
  const refresh = page.waitForRequest(request => request.url().endsWith(`/${householdId}/labels`) && request.method() === 'GET');
  await labelsButton.click();
  await refresh;
  await choice.getByRole('button', { name: '新建标签', exact: true }).click();
  const create = page.getByRole('dialog', { name: '新建标签', exact: true });
  await create.getByLabel('标签名称', { exact: true }).fill('旅行');
  await create.getByRole('button', { name: '创建并选中', exact: true }).click();
  const selected = choice.getByRole('button', { name: '取消选择标签 旅行' });
  await expect(selected).toBeVisible();

  finishRefresh();
  await expect(choice.getByRole('button', { name: '选择标签 学校', exact: true })).toBeVisible();
  await expect(selected).toBeVisible();
  const saved = page.waitForResponse(response => response.url().endsWith(`/notes/${id}/labels`) && response.request().method() === 'PUT');
  await choice.getByRole('button', { name: '完成', exact: true }).click();
  expect((await (await saved).json() as Note).labels.map(label => label.name)).toEqual(['家务', '旅行']);
  await expect(page.getByRole('button', { name: '标签：家务、旅行', exact: true })).toBeVisible();
});

test('the label filter scrolls under the page’s side margins to the screen edges', async ({ page }) => {
  const labels = ['家务', '采买', '旅行', '学校', '医院', '生日', '装修'].map((name, index) => ({ id: `label-${index}`, name, color: '#277A72' }));
  await setup(page, labels.map((label, index) => note(noteId(10 + index), `笔记 ${index + 1}`, '内容', [label])), { labels });
  await page.goto(`${base}/notes`);
  const filter = page.getByRole('radiogroup', { name: '按标签筛选', exact: true });
  await expect(filter.getByRole('radio')).toHaveCount(labels.length + 1);
  const geometry = await filter.evaluate(node => {
    let scroller = node.parentElement!;
    while (getComputedStyle(scroller).overflowX === 'visible') scroller = scroller.parentElement!;
    const frame = scroller.getBoundingClientRect();
    return { left: frame.left, right: frame.right, first: node.querySelector('[role="radio"]')!.getBoundingClientRect().left, overflow: scroller.scrollWidth > scroller.clientWidth };
  });
  expect(geometry.overflow).toBe(true);
  expect(geometry.left).toBe(0);
  expect(geometry.right).toBe(390);
  // At rest the first chip still starts on the page's text line.
  const heading = (await page.getByRole('heading', { name: '笔记', exact: true }).boundingBox())!;
  expect(geometry.first).toBeCloseTo(heading.x, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('opening 标签 on a phone keeps the note behind the blur, guards 完成 while loading, and reuses cached labels', async ({ page }) => {
  let releaseFirstLabels!: () => void;
  const firstLabels = new Promise<void>(resolve => { releaseFirstLabels = resolve; });
  let releaseSecondLabels!: () => void;
  const secondLabels = new Promise<void>(resolve => { releaseSecondLabels = resolve; });
  let labelsGate: Promise<void> | null = firstLabels;

  await setup(page, [note(noteId(20), 'LangChain & LangGraph', null)], {
    labels: [{ id: 'health', name: '健康', color: '#4C7537' }, { id: 'chores', name: '家务', color: '#2C716C' }],
  });
  await page.route(`**/api/v1/households/${householdId}/labels`, async route => {
    const gate = labelsGate;
    if (gate) await gate;
    await route.fallback();
  });

  await page.goto(`${base}/notes/${noteId(20)}`);
  await expect(editorOf(page).locator('h1.note-title')).toHaveText('LangChain & LangGraph');
  // A phone never marks the underlying list row with the desktop selected state.
  await expect(page.locator('[aria-current="true"]')).toHaveCount(0);

  await page.getByRole('button', { name: '标签', exact: true }).click();
  const choice = page.getByRole('dialog', { name: '标签', exact: true });
  await expect(choice.getByText('加载标签中…', { exact: true })).toBeVisible();
  await expect(choice.getByRole('button', { name: '完成', exact: true })).toBeDisabled();
  // The note sheet stays mounted and laid out behind the blurred overlay instead of collapsing to display:none.
  const editorHidden = await page.evaluate(() => {
    const el = document.querySelector('.note-editor');
    return !el || getComputedStyle(el).display === 'none' || el.getBoundingClientRect().height === 0;
  });
  expect(editorHidden).toBe(false);

  labelsGate = null;
  releaseFirstLabels();
  await expect(choice.getByRole('button', { name: '选择标签 健康', exact: true })).toBeVisible();
  await expect(choice.getByRole('button', { name: '完成', exact: true })).toBeEnabled();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await choice.getByRole('button', { name: '关闭标签', exact: true }).click();
  await expect(editorOf(page).locator('h1.note-title')).toBeVisible();

  // Reopening 标签 shows the cached labels right away while the background refresh is still pending.
  labelsGate = secondLabels;
  await page.getByRole('button', { name: '标签', exact: true }).click();
  await expect(choice.getByRole('button', { name: '选择标签 健康', exact: true })).toBeVisible();
  await expect(choice.getByText('加载标签中…', { exact: true })).toHaveCount(0);
  await choice.getByRole('button', { name: '选择标签 健康', exact: true }).click();
  await choice.getByRole('button', { name: '完成', exact: true }).click();
  labelsGate = null;
  releaseSecondLabels();

  const labelButton = page.getByRole('button', { name: '标签：健康', exact: true });
  await expect(labelButton).toBeVisible();
  const [chipBox, titleBox] = await Promise.all([
    labelButton.boundingBox(),
    editorOf(page).locator('h1.note-title').boundingBox(),
  ]);
  expect(titleBox!.y - (chipBox!.y + chipBox!.height)).toBeLessThan(28);
});
