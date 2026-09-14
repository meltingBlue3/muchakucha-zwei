import { fireEvent, render, waitFor } from '@testing-library/react-native';

import type { SessionTransport } from '../../../platform/session/session-transport';
import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import { LoginForm } from '../login-form';
import { createSessionStateStore } from '../session-state';

async function renderLogin() {
  const sessionStateStore = createSessionStateStore();
  const sessionTransport: SessionTransport = {
    acceptIssuedSession: jest.fn(),
    clear: jest.fn().mockResolvedValue(undefined),
    getAccessToken: jest.fn(),
    loadCurrentUser: jest.fn(),
    login: jest.fn().mockResolvedValue({ kind: 'authenticated', session: { accessToken: 'login-access' } }),
    refresh: jest.fn(),
    restore: jest.fn(),
  };
  const onAuthenticated = jest.fn();
  const onRegister = jest.fn();
  const onOffline = jest.fn();
  const view = await render(
    <MuchakuchaThemeProvider>
      <LoginForm
        onAuthenticated={onAuthenticated}
        onRegister={onRegister}
        onOffline={onOffline}
        sessionStateStore={sessionStateStore}
        sessionTransport={sessionTransport}
      />
    </MuchakuchaThemeProvider>,
  );
  return { onAuthenticated, onRegister, onOffline, sessionStateStore, sessionTransport, view };
}

const fillLogin = async (view: Awaited<ReturnType<typeof render>>, username = '家庭成员') => {
  await fireEvent.changeText(view.getByLabelText('用户名'), username);
  await fireEvent.changeText(view.getByLabelText('密码'), 'family-password');
};

describe('username login form', () => {
  test('requires a username and password and offers registration without an email recovery flow', async () => {
    const { onRegister, sessionTransport, view } = await renderLogin();
    expect(view.queryByLabelText('邮箱')).toBeNull();
    expect(view.queryByText('忘记密码')).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: '登录' }));
    expect(await view.findByText('请输入用户名。')).toBeTruthy();
    expect(view.getByText('请输入密码。')).toBeTruthy();
    expect(sessionTransport.login).not.toHaveBeenCalled();
    await fireEvent.press(view.getByText('创建账户'));
    expect(onRegister).toHaveBeenCalledTimes(1);
  });

  test('normalizes the username, preserves the password, and enters the authenticated flow', async () => {
    const { onAuthenticated, sessionStateStore, sessionTransport, view } = await renderLogin();
    await fillLogin(view, '  Cafe\u0301.家庭  ');
    await fireEvent.changeText(view.getByLabelText('密码'), '  exact password  ');
    await fireEvent.press(view.getByRole('button', { name: '登录' }));
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledTimes(1));
    expect(sessionTransport.login).toHaveBeenCalledWith({ username: 'Café.家庭', password: '  exact password  ' });
    expect(sessionStateStore.get()).toEqual({ kind: 'authenticated', session: { accessToken: 'login-access' } });
  });

  test('keeps credentials for retry and reports incorrect username or password', async () => {
    const { onAuthenticated, sessionTransport, view } = await renderLogin();
    jest.mocked(sessionTransport.login).mockRejectedValueOnce({ status: 401 });
    await fillLogin(view);
    await fireEvent.press(view.getByRole('button', { name: '登录' }));
    expect(await view.findByText('用户名或密码不正确，请重新输入。')).toBeTruthy();
    expect(view.getByLabelText('用户名').props.value).toBe('家庭成员');
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  test('reports a failed network request without inventing a session', async () => {
    const { onAuthenticated, sessionStateStore, sessionTransport, view } = await renderLogin();
    jest.mocked(sessionTransport.login).mockRejectedValueOnce(new TypeError('Network request failed'));
    await fillLogin(view);
    await fireEvent.press(view.getByRole('button', { name: '登录' }));
    expect(await view.findByText('这次没有完成。请检查网络后重试。')).toBeTruthy();
    expect(sessionStateStore.get().kind).not.toBe('authenticated');
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  test('preserves an issued credential if the follow-up request is offline', async () => {
    const { onOffline, sessionStateStore, sessionTransport, view } = await renderLogin();
    jest.mocked(sessionTransport.login).mockResolvedValueOnce({ kind: 'offline', retainedCredential: true });
    await fillLogin(view);
    await fireEvent.press(view.getByRole('button', { name: '登录' }));
    await waitFor(() => expect(onOffline).toHaveBeenCalledTimes(1));
    expect(sessionTransport.clear).not.toHaveBeenCalled();
    expect(sessionStateStore.get()).toEqual({ kind: 'offlineWaiting', retainedCredential: true });
  });
});
