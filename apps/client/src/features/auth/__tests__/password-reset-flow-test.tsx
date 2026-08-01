import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import {
  ForgotPasswordForm,
  ResetOutcomePanel,
  ResetPasswordForm,
  ResetPasswordLanding,
  ResetSuccess,
  type PasswordResetApi,
} from '../password-reset-flow';

const token = 'r'.repeat(43);
const strongPassword = 'another correct horse battery staple 2026';

function createApi(): PasswordResetApi {
  return {
    completePasswordReset: jest.fn().mockResolvedValue(undefined),
    requestPasswordReset: jest.fn().mockResolvedValue({
      code: 'PASSWORD_RESET_REQUEST_ACCEPTED',
    }),
  };
}

async function renderResetForm(overrides: Partial<React.ComponentProps<typeof ResetPasswordForm>> = {}) {
  const apiClient = createApi();
  const onInvalidLink = jest.fn();
  const onSuccess = jest.fn();
  const view = await render(
    <MuchakuchaThemeProvider>
      <ResetPasswordForm
        apiClient={apiClient}
        onInvalidLink={onInvalidLink}
        onSuccess={onSuccess}
        token={token}
        {...overrides}
      />
    </MuchakuchaThemeProvider>,
  );
  return { apiClient, onInvalidLink, onSuccess, view };
}

describe('password reset flow contract', () => {
  test('shows the same privacy-safe request confirmation for every email', async () => {
    const apiClient = createApi();
    const first = await render(
      <MuchakuchaThemeProvider>
        <ForgotPasswordForm apiClient={apiClient} onLogin={jest.fn()} />
      </MuchakuchaThemeProvider>,
    );
    await fireEvent.changeText(first.getByLabelText('邮箱'), 'member@example.test');
    await fireEvent.press(first.getByRole('button', { name: '发送重置链接' }));
    const firstCopy = await first.findByText('如果该邮箱已注册，我们会发送一封重置邮件。');
    expect(firstCopy).toBeTruthy();
    await first.unmount();

    const second = await render(
      <MuchakuchaThemeProvider>
        <ForgotPasswordForm apiClient={apiClient} onLogin={jest.fn()} />
      </MuchakuchaThemeProvider>,
    );
    await fireEvent.changeText(second.getByLabelText('邮箱'), 'absent@example.test');
    await fireEvent.press(second.getByRole('button', { name: '发送重置链接' }));
    expect(await second.findByText(firstCopy.props.children)).toBeTruthy();
    await second.unmount();
  });

  test('sanitizes the reset token before rendering the form or completing reset', async () => {
    const apiClient = createApi();
    const replaceTokenBearingLocation = jest.fn();
    const view = await render(
      <MuchakuchaThemeProvider>
        <ResetPasswordLanding
          apiClient={apiClient}
          onInvalidLink={jest.fn()}
          onRequestNew={jest.fn()}
          onSuccess={jest.fn()}
          replaceTokenBearingLocation={replaceTokenBearingLocation}
          token={token}
        />
      </MuchakuchaThemeProvider>,
    );

    expect(replaceTokenBearingLocation).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(view.toJSON())).not.toContain(token);
    expect(apiClient.completePasswordReset).not.toHaveBeenCalled();

    await fireEvent.changeText(view.getByLabelText('新密码'), strongPassword);
    await fireEvent.press(view.getByRole('button', { name: '更新密码' }));
    await waitFor(() => expect(apiClient.completePasswordReset).toHaveBeenCalled());
    expect(replaceTokenBearingLocation.mock.invocationCallOrder[0]).toBeLessThan(
      (apiClient.completePasswordReset as jest.Mock).mock.invocationCallOrder[0]!,
    );
  });

  test('validates the new password on blur and rejects the common-password error safely', async () => {
    const apiClient = createApi();
    (apiClient.completePasswordReset as jest.Mock).mockRejectedValue({
      body: {
        error: {
          code: 'VALIDATION_FAILED',
          details: [{ codes: ['COMMON_PASSWORD'], field: 'password' }],
        },
      },
      status: 400,
    });
    const { view } = await renderResetForm({ apiClient });

    await fireEvent.changeText(view.getByLabelText('新密码'), 'short');
    await fireEvent(view.getByLabelText('新密码'), 'blur');
    expect(await view.findByText('密码至少需要 12 个字符。')).toBeTruthy();

    await fireEvent.changeText(view.getByLabelText('新密码'), 'passwordpassword');
    await fireEvent.press(view.getByRole('button', { name: '更新密码' }));
    expect(await view.findByText('这个密码过于常见，请使用更强的密码。')).toBeTruthy();
    expect(JSON.stringify(view.toJSON())).not.toContain(token);
  });

  test('keeps the update action stable and prevents repeat submission while pending', async () => {
    let complete!: () => void;
    const apiClient = createApi();
    (apiClient.completePasswordReset as jest.Mock).mockImplementation(
      () => new Promise<void>((resolve) => (complete = resolve)),
    );
    const { onSuccess, view } = await renderResetForm({ apiClient });
    await fireEvent.changeText(view.getByLabelText('新密码'), strongPassword);
    const updateButton = view.getByRole('button', { name: '更新密码' });

    await fireEvent.press(updateButton);
    await waitFor(() =>
      expect(view.getByText('更新密码').parent?.props.accessibilityState).toEqual({
        busy: true,
        disabled: true,
      }),
    );
    await fireEvent.press(updateButton);
    expect(apiClient.completePasswordReset).toHaveBeenCalledTimes(1);

    complete();
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });

  test.each([
    ['expired', '重置链接已过期'],
    ['used', '重置链接已使用'],
    ['invalid', '无法使用此重置链接'],
  ] as const)('renders the distinct %s reset-link recovery state', async (outcome, heading) => {
    const view = await render(
      <MuchakuchaThemeProvider>
        <ResetOutcomePanel onAction={jest.fn()} outcome={outcome} />
      </MuchakuchaThemeProvider>,
    );
    expect(view.getByRole('header', { name: heading })).toBeTruthy();
    expect(JSON.stringify(view.toJSON())).not.toContain(token);
  });

  test('maps an invalid terminal credential to a safe recovery state', async () => {
    const apiClient = createApi();
    (apiClient.completePasswordReset as jest.Mock).mockRejectedValue({
      body: { error: { code: 'INVALID_PASSWORD_RESET_TOKEN' } },
      status: 400,
    });
    const replaceTokenBearingLocation = jest.fn();
    const view = await render(
      <MuchakuchaThemeProvider>
        <ResetPasswordLanding
          apiClient={apiClient}
          onInvalidLink={jest.fn()}
          onRequestNew={jest.fn()}
          onSuccess={jest.fn()}
          replaceTokenBearingLocation={replaceTokenBearingLocation}
          token={token}
        />
      </MuchakuchaThemeProvider>,
    );
    await fireEvent.changeText(view.getByLabelText('新密码'), strongPassword);
    await fireEvent.press(view.getByRole('button', { name: '更新密码' }));
    expect(await view.findByRole('header', { name: '无法使用此重置链接' })).toBeTruthy();
  });

  test('explains global session revocation and returns to login without auto-login', async () => {
    const onLogin = jest.fn();
    const view = await render(
      <MuchakuchaThemeProvider>
        <ResetSuccess onLogin={onLogin} />
      </MuchakuchaThemeProvider>,
    );

    expect(view.getByRole('header', { name: '密码已更新' })).toBeTruthy();
    expect(view.getByText('为保护账户安全，所有设备都需要重新登录。')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: '返回登录' }));
    expect(onLogin).toHaveBeenCalledTimes(1);
  });
});
