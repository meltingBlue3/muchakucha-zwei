import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

import { loginUsernameFixture } from '../support/auth';

// The stored dialect, rendered as the app reads it: markdown-it from the client package.
const MarkdownIt = createRequire(resolve(__dirname, '../../apps/client/package.json'))('markdown-it') as new (options: object) => { disable(rule: string): { render(source: string): string } };
const render = (source: string) => new MarkdownIt({ html: false, breaks: true }).disable('image').render(source).replace(/\s+/g, ' ').trim();

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:3000';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:8081';
const password = 'correct horse battery staple 2026';

async function api(accessToken: string, method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
  const response = await fetch(`${API_ORIGIN}/api/v1${path}`, {
    method,
    headers: { authorization: `Bearer ${accessToken}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text === '' ? null : JSON.parse(text) };
}

async function household(): Promise<{ username: string; token: string; id: string }> {
  const username = `ed-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
  const register = await fetch(`${API_ORIGIN}/api/v1/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json', origin: WEB_ORIGIN }, body: JSON.stringify({ username, password, confirmPassword: password, platform: 'web' }) });
  expect(register.status).toBe(202);
  const login = await fetch(`${API_ORIGIN}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: WEB_ORIGIN }, body: JSON.stringify({ username, password, platform: 'web' }) });
  const { accessToken } = (await login.json()) as { accessToken: string };
  const created = await api(accessToken, 'POST', '/households', { name: '编辑器之家' });
  expect(created.status).toBe(201);
  return { username, token: accessToken, id: created.body.id as string };
}

const editor = (page: Page) => page.getByRole('textbox', { name: '笔记内容', exact: true });
/** Note saves this page has sent. */
function countSaves(page: Page) {
  const saves: string[] = [];
  page.on('request', request => { if (/\/notes(\/[^/]+)?$/.test(new URL(request.url()).pathname) && ['POST', 'PUT'].includes(request.method())) saves.push(request.postData() ?? ''); });
  return saves;
}

const longNote = Array.from({ length: 12 }, (_, i) => `## 第 ${i + 1} 天\n\n上午去西湖边走走，中午在知味观吃小笼包。下午如果下雨就去博物馆，不下雨就去龙井村看茶园。\n\n- [ ] 带伞\n- [x] 订好酒店\n- [ ] 充电宝充满\n\n> 晚上 8 点前回酒店，小米第二天要早起。`).join('\n\n');
// The ten notes of the editor spike, docs/adr/0002-notes-editor.md.
const SAMPLES: Array<[string, string]> = [
  ['采购清单', '## 菜场\n\n- [x] 排骨 两斤\n- [x] 小葱\n- [ ] 西红柿 6 个\n- [ ] 鸡蛋 一盒\n\n## 超市\n\n- [ ] 牛奶（小米要的那种）\n- [ ] 洗衣液\n- [ ] 垃圾袋 **大号**\n\n> 周日上午爸爸去，顺路取快递。'],
  ['旧笔记换行', '访客网络：muchakucha-guest\n密码在路由器背面\n门锁备用电池：抽屉第二格\n\n物业电话 021-5555 0000\n报修 8 点到 20 点'],
  ['表格', '| 列 1 | 列 2 |\n| --- | --- |\n| 内容 | 内容 |\n| 内容 | 内容 |\n\n| 药 | 早 | 晚 |\n| :-- | :-: | --: |\n| 降压药 | 1 片 | — |\n| 维生素 D | — | 1 粒 |'],
  ['链接与强调', '[学校通知](<https://example.com/notice?id=1&term=2>) 里写了家长会。\n\n**粗体**、*斜体*、~~删掉~~ 和 `代码`。\n\n邮件：[联系老师](mailto:teacher@example.com)'],
  ['列表', '- 第一层\n  - 第二层\n    - 第三层\n- 回到第一层\n\n3. 从三开始\n4. 第四\n\n1. 有序\n   - 里面的无序\n   - [ ] 里面的清单'],
  ['字面量', '![照片](https://example.com/a.jpg)\n\n<b>不是粗体</b> <br> 也不是换行\n\n1\\. 不是列表\n\n\\*不是斜体\\*\n\n#不是标题\n\n价格 5*3=15，a_b_c'],
  ['代码块', '```js\nconst wifi = "guest";\nif (a < b) { console.log("ok\\n"); }\n```\n\n    缩进代码\n    第二行'],
  ['日文', '## 買い物リスト\n\n- [ ] 牛乳\n- [x] 卵（10個入り）\n- [ ] 食パン\n\n「来週の月曜日は祝日」なので、病院は火曜日に。'],
  ['助手写的', '## 体检提醒\n\n- 时间：11 月 28 日 9:00\n- 地点：社区医院二楼\n\n记得**空腹**，带上医保卡。\n\n---\n\n复查结果出来后告诉妈妈。'],
  ['长笔记', longNote],
];

test('the spike’s ten notes keep their reading after the editor writes them, and a second pass writes the same', async ({ page }) => {
  test.setTimeout(180_000);
  const home = await household();
  const saves = countSaves(page);
  await loginUsernameFixture(page, home.username, password, `/households/${home.id}/notes`);
  for (const [title, body] of SAMPLES) {
    const created = await api(home.token, 'POST', `/households/${home.id}/notes`, { title, body });
    const path = `/households/${home.id}/notes/${created.body.id}`;
    const read = async () => (await api(home.token, 'GET', path)).body;
    // Opening reports no change and saves nothing.
    await page.goto(path);
    await expect(editor(page).locator('h1.note-title')).toHaveText(title);
    const opened = saves.length;
    await page.waitForTimeout(1300);
    expect(saves.length, `${title}: opening saved`).toBe(opened);
    // A change and its undoing leave the content as the editor writes it.
    const pass = async () => {
      await editor(page).locator('h1.note-title').click();
      await page.keyboard.press('End');
      await page.keyboard.type('x');
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(1300);
      await expect(page.getByTestId('note-save-state')).toHaveText('已保存');
      return read();
    };
    const first = await pass();
    expect(render(first.body ?? ''), `${title}: reading changed`).toBe(render(body));
    await page.reload();
    await expect(editor(page).locator('h1.note-title')).toHaveText(title);
    const second = await pass();
    expect(second.body, `${title}: second pass differs`).toBe(first.body);
    expect(second.updatedAt, `${title}: second pass saved again`).toBe(first.updatedAt);
  }
});

test('Chinese and Japanese composition saves once, after the words are chosen', async ({ page }) => {
  const home = await household();
  const created = await api(home.token, 'POST', `/households/${home.id}/notes`, { title: '采购', body: '- [ ] 鸡蛋 一盒' });
  const path = `/households/${home.id}/notes/${created.body.id}`;
  const saves = countSaves(page);
  await loginUsernameFixture(page, home.username, password, path);
  await editor(page).getByText('鸡蛋 一盒', { exact: true }).click();
  await page.keyboard.press('End');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: 'liang', selectionStart: 5, selectionEnd: 5 });
  await cdp.send('Input.imeSetComposition', { text: "liang'ge", selectionStart: 8, selectionEnd: 8 });
  await page.waitForTimeout(1600);
  expect(saves).toHaveLength(0);
  await cdp.send('Input.insertText', { text: '（两个）' });
  await page.waitForTimeout(1600);
  expect(saves).toHaveLength(1);
  expect(saves[0]).not.toContain('liang');
  expect(JSON.parse(saves[0]!).body).toBe('- [ ] 鸡蛋 一盒（两个）');

  // Enter continues the checklist; Japanese kana are composed in the new item.
  await page.keyboard.press('Enter');
  await cdp.send('Input.imeSetComposition', { text: 'かいもの', selectionStart: 4, selectionEnd: 4 });
  await page.waitForTimeout(1300);
  expect(saves).toHaveLength(1);
  await cdp.send('Input.insertText', { text: '買い物袋' });
  await expect.poll(async () => (await api(home.token, 'GET', path)).body.body).toBe('- [ ] 鸡蛋 一盒（两个）\n- [ ] 買い物袋');
});

test('Enter in checklists and the title, Markdown shortcuts and undo behave like a document', async ({ page }) => {
  const home = await household();
  const created = await api(home.token, 'POST', `/households/${home.id}/notes`, { title: '周末', body: '- [ ] 买菜' });
  const path = `/households/${home.id}/notes/${created.body.id}`;
  const read = async () => (await api(home.token, 'GET', path)).body.body as string;
  await loginUsernameFixture(page, home.username, password, path);

  // Enter at the end of the title goes to the start of the body, without splitting the title.
  await editor(page).locator('h1.note-title').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('先');
  await expect.poll(read).toBe('- [ ] 先买菜');
  await expect(editor(page).locator('h1.note-title')).toHaveText('周末');

  // Enter adds an item; Enter on an empty item leaves the list.
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('洗车');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('其他事');
  await expect.poll(read).toBe('- [ ] 先买菜\n- [ ] 洗车\n\n其他事');

  // Undo takes back the last words.
  await page.keyboard.press('Control+z');
  await expect.poll(read).not.toContain('其他事');

  // Typing Markdown at the start of a line makes the format.
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('[ ] 输入规则');
  await expect.poll(read).toContain('- [ ] 输入规则');
  await expect(editor(page).getByRole('checkbox', { name: '未勾选：输入规则', exact: true })).toBeVisible();
});

test('the / menu inserts a format at the start of a line, by keyboard or pointer, and Escape only closes it', async ({ page }) => {
  const home = await household();
  const created = await api(home.token, 'POST', `/households/${home.id}/notes`, { title: '插入', body: '第一段' });
  const path = `/households/${home.id}/notes/${created.body.id}`;
  const read = async () => (await api(home.token, 'GET', path)).body.body as string;
  await loginUsernameFixture(page, home.username, password, path);
  await editor(page).getByText('第一段', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/');
  const menu = page.getByRole('listbox', { name: '插入', exact: true });
  await expect(menu.getByRole('option')).toHaveText(['待办清单- [ ]', '列表-', '编号列表1.', '小标题##', '引用>', '分隔线---', '表格| |', '代码块```', '链接[ ]( )']);
  await expect(menu.getByRole('option', { name: /^待办清单/ })).toHaveAttribute('aria-selected', 'true');

  // Escape closes the menu and leaves the note open.
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(editor(page)).toBeFocused();
  await expect(page.getByRole('region', { name: '笔记', exact: true })).toBeVisible();

  // Typing narrows it; arrows and Enter choose.
  await page.keyboard.press('Backspace');
  await page.keyboard.type('/列');
  await expect(menu.getByRole('option')).toHaveText(['列表-', '编号列表1.']);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.keyboard.type('第一项');
  await expect.poll(read).toBe('第一段\n\n1. 第一项');

  // A pointer works too; 表格 asks for its size in the window.
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/');
  await menu.getByRole('option', { name: /^表格/ }).click();
  const step = page.getByRole('region', { name: '插入表格', exact: true });
  await step.getByLabel('列数（1–6）').fill('3');
  await step.getByLabel('数据行数（1–20）').fill('1');
  await step.getByRole('button', { name: '插入表格', exact: true }).click();
  await expect(editor(page).getByRole('table')).toBeVisible();
  await page.keyboard.type('药');
  // The header row starts with column names, and the first one is selected.
  await expect.poll(read).toContain('| 药 | 列 2 | 列 3 |\n| --- | --- | --- |');

  // Not in the middle of a word.
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('a/b');
  await expect(menu).toBeHidden();
});

test('the title may stay empty: the note is saved under its first line', async ({ page }) => {
  const home = await household();
  await loginUsernameFixture(page, home.username, password, `/households/${home.id}/notes/new`);
  await editor(page).locator('h1.note-title').click();
  await page.keyboard.press('Enter');
  await page.keyboard.type('牛奶两盒');
  await expect(page.getByTestId('note-save-state')).toHaveText('已保存');
  const listed = await api(home.token, 'GET', `/households/${home.id}/notes`);
  expect(listed.body.notes).toEqual([expect.objectContaining({ title: '牛奶两盒', body: '牛奶两盒' })]);
});
