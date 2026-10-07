import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const user = { id: 'ui-user', username: 'family_member', displayName: '小林', hasHousehold: false };

async function mockApi(page: Page, authenticated: boolean) {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown;
    let status = 200;
    if (path.endsWith('/auth/refresh')) {
      status = authenticated ? 200 : 401;
      body = authenticated ? { accessToken: 'ui-only-token' } : { error: { code: 'UNAUTHORIZED' } };
    } else if (path.endsWith('/users/me')) {
      body = route.request().method() === 'PATCH' ? { ...user, ...route.request().postDataJSON() } : user;
    } else if (path.endsWith('/invitations/inbox')) {
      body = { invitations: [] };
    } else if (path.endsWith('/households')) {
      body = [];
    } else {
      status = 404;
      body = { error: { code: 'NOT_FOUND' } };
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

async function checkLayout(page: Page) {
  const overflow = await page.evaluate(() => [...document.querySelectorAll('input, button, [role="button"], [role="heading"]')]
    .some((element) => { const r = element.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1); }));
  expect(overflow).toBe(false);
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
}

test('mobile sign-up keeps password controls inline and preserves the invitation destination', async ({ page }) => {
  await mockApi(page, false);
  await page.goto('/login?intended=%2Finbox');
  await page.getByRole('link', { name: '创建账户', exact: true }).click();
  await expect(page).toHaveURL(/register.*intended/);
  await page.getByRole('heading', { name: '创建你的账户' }).waitFor();
  const password = page.locator('input[aria-label="密码"]:visible');
  await password.fill('password-for-ui');
  await page.getByRole('button', { name: '显示密码', exact: true }).click();
  await expect(password).toHaveJSProperty('type', 'text');
  await page.getByRole('button', { name: '隐藏密码', exact: true }).click();
  await expect(password).toHaveAttribute('type', 'password');
  await checkLayout(page);
  await page.screenshot({ path: 'test-results/account-register-mobile.png', fullPage: true });
});

test('no-household onboarding offers both routes and profile access', async ({ page }) => {
  await mockApi(page, true);
  await page.goto('/household-handoff');
  await expect(page.getByRole('heading', { name: '开始设置你的家庭' })).toBeVisible();
  await checkLayout(page);
  await page.screenshot({ path: 'test-results/account-setup-mobile.png', fullPage: true });
  await page.getByRole('button', { name: '查看家庭邀请' }).click();
  await expect(page.getByText('暂无消息')).toBeVisible();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await page.getByRole('button', { name: '创建家庭', exact: true }).click();
  await expect(page.getByLabel('家庭名称', { exact: true })).toBeVisible();
  await checkLayout(page);
  await page.getByRole('button', { name: '关闭创建家庭', exact: true }).click();
  await page.getByRole('button', { name: '个人中心' }).click();
  await page.getByRole('menuitem', { name: '个人资料' }).click();
  await expect(page.getByRole('heading', { name: '个人资料' })).toBeVisible();
});

test('profile only enables saving changed input and announces success', async ({ page }) => {
  await mockApi(page, true);
  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: '个人资料' })).toBeVisible();
  await expect(page.getByText('family_member', { exact: true })).toBeVisible();
  await checkLayout(page);
  await page.screenshot({ path: 'test-results/account-profile-mobile.png', fullPage: true });
  // The nickname is a fact on the page; 编辑 opens the same window as the account menu.
  const edit = page.getByRole('button', { name: '编辑昵称' });
  await edit.click();
  const dialog = page.getByRole('dialog', { name: '个人资料', exact: true });
  // Opened by pointer, the window focuses its close button without a ring.
  await expect(dialog.getByRole('button', { name: '关闭个人资料' })).toBeFocused();
  await expect(dialog.getByRole('button', { name: '关闭个人资料' })).toHaveCSS('outline-style', 'none');
  const save = dialog.getByRole('button', { name: '保存', exact: true });
  await expect(dialog.getByLabel('昵称', { exact: true })).toHaveValue('小林');
  await expect(save).toBeDisabled();
  await dialog.getByLabel('昵称', { exact: true }).fill('小林的新昵称');
  await save.click();
  await expect(dialog.getByText('昵称已更新。')).toBeVisible();
  await expect(save).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(edit).toBeFocused();
  await expect(page.getByText('小林的新昵称', { exact: true })).toBeVisible();
  // A row in a grouped list draws its ring inside, where the group cannot clip it.
  const householdsRow = page.getByRole('button', { name: '我的家庭', exact: true });
  await page.keyboard.press('Shift');
  await householdsRow.focus();
  await expect(householdsRow).toHaveCSS('outline-color', 'rgb(194, 56, 28)');
  await expect(householdsRow).toHaveCSS('outline-offset', '-2px');
});

test('blur validation leaves focus where the pointer sent it; only a submit moves it', async ({ page }) => {
  await mockApi(page, false);
  await page.goto('/register');
  await page.getByRole('heading', { name: '创建你的账户' }).waitFor();
  const username = page.locator('input[aria-label="用户名"]:visible');
  const password = page.locator('input[aria-label="密码"]:visible');
  // An empty field left behind is not flagged yet.
  await username.click();
  await password.click();
  await expect(username).toHaveAttribute('aria-invalid', 'false');
  await username.fill('ab');
  await password.click();
  await expect(page.getByText('用户名至少需要 3 个字符。')).toBeVisible();
  // Typing after the error appeared still lands in the field the user clicked.
  await page.keyboard.type('password-for-ui');
  await expect(password).toHaveValue('password-for-ui');
  await expect(username).toHaveValue('ab');
  await expect(password).toBeFocused();
  // The shown error follows the correction as the user types.
  await username.fill('abc');
  await expect(page.getByText('用户名至少需要 3 个字符。')).toHaveCount(0);
  await username.fill('ab');
  await page.getByRole('button', { name: '创建账户', exact: true }).click();
  await expect(username).toBeFocused();
});

test('authentication layouts fit small phones and desktop', async ({ page }) => {
  await mockApi(page, false);
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/login');
    await page.getByRole('heading', { name: '欢迎回来' }).waitFor();
    await checkLayout(page);
    await page.screenshot({ path: `test-results/account-login-${width}.png`, fullPage: true });
  }
});

for (const width of [320, 390, 1440]) {
  test(`account menu and profile dialog preserve focus and layout at ${width}px`, async ({ page }) => {
    await mockApi(page, true);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/household-handoff');
    const trigger = page.getByRole('button', { name: '个人中心', exact: true });
    await trigger.click();
    await expect(page.getByRole('menuitem', { name: '个人资料' })).toBeFocused();
    await page.screenshot({ path: `test-results/account-menu-${width}.png` });
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: '退出登录' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.getByRole('menuitem', { name: '个人资料' }).click();
    const dialog = page.getByRole('dialog', { name: '个人资料', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: '关闭个人资料' })).toBeFocused();
    await expect(dialog.getByLabel('昵称', { exact: true })).toHaveValue('小林');
    await expect(page.getByTestId('app-dialog-blur')).toHaveCSS('backdrop-filter', /blur/);
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByLabel('昵称', { exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: '关闭个人资料' })).toBeFocused();
    // Keyboard focus draws the vermilion ring (the global :focus-visible rule).
    await expect(dialog.getByRole('button', { name: '关闭个人资料' })).toHaveCSS('outline-color', 'rgb(194, 56, 28)');
    await checkLayout(page);
    await page.screenshot({ path: `test-results/account-dialog-profile-${width}.png` });
    await dialog.getByLabel('昵称', { exact: true }).fill('新的昵称');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog.getByText('昵称已更新。')).toBeVisible();
    await expect(page).toHaveURL(/household-handoff$/);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.getByRole('menuitem', { name: '个人资料' }).click();
    await expect(dialog).toBeVisible();
    await page.getByTestId('app-dialog-dismiss').click({ position: { x: 4, y: 4 } });
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}

test('logout answers sit side by side on a 360px phone', async ({ page }) => {
  await mockApi(page, true);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/household-handoff');
  await page.getByRole('button', { name: '个人中心', exact: true }).click();
  await page.getByRole('menuitem', { name: '退出登录' }).click();
  const dialog = page.getByRole('dialog', { name: '退出登录', exact: true });
  const cancel = (await dialog.getByRole('button', { name: '取消退出登录' }).boundingBox())!;
  const confirm = (await dialog.getByRole('button', { name: '确认退出登录' }).boundingBox())!;
  expect(Math.abs(cancel.y - confirm.y)).toBeLessThan(2);
  expect(confirm.x).toBeGreaterThan(cancel.x + cancel.width);
});

test('logout dialog cancels, retains failed sessions, and only exits after confirmation', async ({ page }) => {
  await mockApi(page, true);
  let logoutCalls = 0;
  let finishLogout: (() => void) | undefined;
  await page.route('**/api/v1/auth/logout', async (route) => {
    logoutCalls++;
    if (logoutCalls === 1) await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    else {
      await new Promise<void>((resolve) => { finishLogout = resolve; });
      await route.fulfill({ status: 204 });
    }
  });
  await page.goto('/household-handoff');
  const trigger = page.getByRole('button', { name: '个人中心', exact: true });
  const open = async () => { await trigger.click(); await page.getByRole('menuitem', { name: '退出登录' }).click(); };
  await open();
  const dialog = page.getByRole('dialog', { name: '退出登录', exact: true });
  await expect(dialog.getByRole('button', { name: '关闭退出登录' })).toBeFocused();
  await dialog.getByRole('button', { name: '取消退出登录' }).click();
  await expect(dialog).toHaveCount(0);
  expect(logoutCalls).toBe(0);
  await expect(trigger).toBeFocused();
  await open();
  await checkLayout(page);
  await page.screenshot({ path: 'test-results/account-dialog-logout.png' });
  await dialog.getByRole('button', { name: '确认退出登录' }).click();
  await expect(dialog.getByText('暂时无法退出。请检查网络后重试。')).toBeVisible();
  await expect(page).toHaveURL(/household-handoff$/);
  await dialog.getByRole('button', { name: '确认退出登录' }).click();
  await expect(dialog.getByRole('button', { name: '确认退出登录' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  expect(logoutCalls).toBe(2);
  finishLogout!();
  await expect(page).toHaveURL(/login/);
});
