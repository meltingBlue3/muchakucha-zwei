import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import { RegisterForm } from '../register-form';
import { createSessionStateStore } from '../session-state';

const validValues = {
  username: '家庭成员_01',
  password: 'family-password',
  confirmPassword: 'family-password',
};
const issuedSession = { code: 'REGISTRATION_ACCEPTED' as const, accessToken: 'access', refreshToken: 'native-refresh' };

type RenderView = Awaited<ReturnType<typeof render>>;

const renderForm = async (overrides: Partial<React.ComponentProps<typeof RegisterForm>> = {}) => {
  const apiClient = overrides.apiClient ?? { register: jest.fn().mockResolvedValue(issuedSession) };
  const sessionTransport = overrides.sessionTransport ?? {
    acceptIssuedSession: jest.fn().mockResolvedValue({ accessToken: 'access' }),
  };
  const sessionStateStore = createSessionStateStore();
  const onAuthenticated = jest.fn();
  const onLogin = jest.fn();
  const view = await render(
    <MuchakuchaThemeProvider>
      <RegisterForm
        apiClient={apiClient}
        onAuthenticated={onAuthenticated}
        onLogin={onLogin}
        platform="native"
        sessionStateStore={sessionStateStore}
        sessionTransport={sessionTransport}
        {...overrides}
      />
    </MuchakuchaThemeProvider>,
  );
  return { apiClient, onAuthenticated, onLogin, sessionStateStore, sessionTransport, view };
};

const fillValidForm = async (view: RenderView, username = validValues.username) => {
  await fireEvent.changeText(view.getByLabelText('用户名'), username);
  await fireEvent.changeText(view.getByLabelText('密码'), validValues.password);
  await fireEvent.changeText(view.getByLabelText('确认密码'), validValues.confirmPassword);
};

describe('username registration form', () => {
  test('requires username, password, and confirmation only after interaction or submission', async () => {
    const { apiClient, view } = await renderForm();
    expect(view.queryByText('用户名至少需要 3 个字符。')).toBeNull();
    expect(view.queryByLabelText('邮箱')).toBeNull();
    expect(view.queryByLabelText('昵称')).toBeNull();
    await fireEvent.changeText(view.getByLabelText('用户名'), 'ab');
    await fireEvent(view.getByLabelText('用户名'), 'blur');
    expect(await view.findByText('用户名至少需要 3 个字符。')).toBeTruthy();
    expect(view.queryByText('请再次输入密码。')).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: '创建账户' }));
    expect(await view.findByText('密码至少需要 8 个字符。')).toBeTruthy();
    expect(view.getByText('请再次输入密码。')).toBeTruthy();
    expect(apiClient.register).not.toHaveBeenCalled();
  });

  test.each([
    ['family member', '用户名只能包含字母、数字、点、下划线和短横线。'],
    ['family@example.test', '用户名只能包含字母、数字、点、下划线和短横线。'],
    ['x'.repeat(33), '用户名不能超过 32 个字符。'],
  ])('rejects invalid username %s before calling the API', async (username, error) => {
    const { apiClient, view } = await renderForm();
    await fillValidForm(view, username);
    await fireEvent.press(view.getByRole('button', { name: '创建账户' }));
    expect(await view.findByText(error)).toBeTruthy();
    expect(apiClient.register).not.toHaveBeenCalled();
  });

  test('requires matching passwords and accepts an eight-character password', async () => {
    const { apiClient, view } = await renderForm();
    await fillValidForm(view);
    await fireEvent.changeText(view.getByLabelText('密码'), '12345678');
    await fireEvent.press(view.getByRole('button', { name: '创建账户' }));
    expect(await view.findByText('两次输入的密码不一致。')).toBeTruthy();
    expect(apiClient.register).not.toHaveBeenCalled();
    await fireEvent.changeText(view.getByLabelText('确认密码'), '12345678');
    await fireEvent.press(view.getByRole('button', { name: '创建账户' }));
    await waitFor(() => expect(apiClient.register).toHaveBeenCalledWith(
      { username: validValues.username, password: '12345678', confirmPassword: '12345678', platform: 'native' },
      expect.any(AbortSignal),
    ));
  });

  test('normalizes the username and publishes a session only after native acceptance succeeds', async () => {
    const { apiClient, onAuthenticated, sessionStateStore, sessionTransport, view } = await renderForm();
    jest.mocked(sessionTransport.acceptIssuedSession).mockImplementationOnce(async () => {
      expect(sessionStateStore.get().kind).toBe('booting');
      expect(onAuthenticated).not.toHaveBeenCalled();
      return { accessToken: 'access' };
    });
    await fillValidForm(view, '  Cafe\u0301.家庭  ');
    await fireEvent.press(view.getByRole('button', { name: '创建账户' }));
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledTimes(1));
    expect(apiClient.register).toHaveBeenCalledWith(
      { ...validValues, username: 'Café.家庭', platform: 'native' },
      expect.any(AbortSignal),
    );
    expect(sessionTransport.acceptIssuedSession).toHaveBeenCalledWith({ accessToken: 'access', refreshToken: 'native-refresh' });
    expect(sessionStateStore.get()).toEqual({ kind: 'authenticated', session: { accessToken: 'access' } });
    expect(view.queryByText('去邮箱完成验证')).toBeNull();
  });

  test.each([
    [4, '密码至少需要 8 个字符。'],
    [129, '密码不能超过 128 个字符。'],
  ])('counts Unicode characters when rejecting a %s-character password', async (length, message) => {
    const { apiClient, view } = await renderForm();
    await fillValidForm(view);
    await fireEvent.changeText(view.getByLabelText('密码'), '😀'.repeat(length));
    await fireEvent.changeText(view.getByLabelText('确认密码'), '😀'.repeat(length));
    await fireEvent.press(view.getByRole('button', { name: '创建账户' }));
    expect(await view.findByText(message)).toBeTruthy();
    expect(apiClient.register).not.toHaveBeenCalled();
  });

  test('accepts 128 Unicode characters even when they occupy more UTF-16 code units', async () => {
    const { apiClient, view } = await renderForm();
    const password = '😀'.repeat(128);
    await fillValidForm(view);
    await fireEvent.changeText(view.getByLabelText('密码'), password);
    await fireEvent.changeText(view.getByLabelText('确认密码'), password);
    await fireEvent.press(view.getByRole('button', { name: '创建账户' }));
    await waitFor(() => expect(apiClient.register).toHaveBeenCalledWith(
      { ...validValues, password, confirmPassword: password, platform: 'native' },
      expect.any(AbortSignal),
    ));
  });

  test('accepts a Web access token while leaving refresh credentials in the HttpOnly cookie', async () => {
    const apiClient = { register: jest.fn().mockResolvedValue({ code: 'REGISTRATION_ACCEPTED', accessToken: 'access' }) };
    const { onAuthenticated, sessionTransport, view } = await renderForm({ apiClient, platform: 'web' });
    await fillValidForm(view);
    await fireEvent.press(view.getByRole('button', { name: '创建账户' }));
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledTimes(1));
    expect(apiClient.register).toHaveBeenCalledWith({ ...validValues, platform: 'web' }, expect.any(AbortSignal));
    expect(sessionTransport.acceptIssuedSession).toHaveBeenCalledWith({ accessToken: 'access' });
  });

  test('does not publish a session or navigate when secure acceptance fails', async () => {
    const sessionTransport = { acceptIssuedSession: jest.fn().mockRejectedValue(new Error('storage failure')) };
    const { onAuthenticated, sessionStateStore, view } = await renderForm({ sessionTransport });
    await fillValidForm(view);
    await fireEvent.press(view.getByRole('button', { name: '创建账户' }));
    expect(await view.findByText('这次没有完成。请检查网络后重试。')).toBeTruthy();
    expect(onAuthenticated).not.toHaveBeenCalled();
    expect(sessionStateStore.get().kind).not.toBe('authenticated');
  });

  test('keeps the primary action stable and prevents duplicate submission while pending', async () => {
    let resolveRegistration!: (value: typeof issuedSession) => void;
    const apiClient = { register: jest.fn(() => new Promise<typeof issuedSession>((resolve) => { resolveRegistration = resolve; })) };
    const { onAuthenticated, view } = await renderForm({ apiClient });
    await fillValidForm(view);
    await fireEvent.press(view.getByRole('button', { name: '创建账户' }));
    await waitFor(() => expect(view.getByText('创建账户').parent?.props.accessibilityState).toEqual({ busy: true, disabled: true }));
    await fireEvent.press(view.getByText('创建账户'));
    expect(apiClient.register).toHaveBeenCalledTimes(1);
    resolveRegistration(issuedSession);
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledTimes(1));
  });

  test('shows duplicate usernames, safe field errors, and network failures without clearing the form', async () => {
    const apiClient = { register: jest.fn()
      .mockRejectedValueOnce({ status: 409, body: { error: { code: 'USERNAME_TAKEN' } } })
      .mockRejectedValueOnce({ status: 400, body: { error: { details: [{ field: 'username' }] } } })
      .mockRejectedValueOnce(new Error('network unavailable')) };
    const { view } = await renderForm({ apiClient });
    await fillValidForm(view);
    await fireEvent.press(view.getByRole('button', { name: '创建账户' }));
    expect(await view.findByText('这个用户名已被使用，请换一个。')).toBeTruthy();
    expect(view.getByLabelText('用户名').props.value).toBe(validValues.username);
    await fireEvent.press(view.getByRole('button', { name: '创建账户' }));
    expect(await view.findByText('请检查用户名后重试。')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: '创建账户' }));
    const banner = await view.findByText('这次没有完成。请检查网络后重试。');
    expect(banner.parent?.parent?.parent?.props.accessibilityLiveRegion).toBe('assertive');
  });

  test('offers login for an existing account', async () => {
    const { onLogin, view } = await renderForm();
    await fireEvent.press(view.getByText('已有账户？登录'));
    expect(onLogin).toHaveBeenCalledTimes(1);
  });
});
