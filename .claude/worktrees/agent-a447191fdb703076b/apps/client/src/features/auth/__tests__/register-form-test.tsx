import { fireEvent, render, waitFor } from '@testing-library/react-native';

import type { PendingProofStore } from '../../../platform/session/pending-proof';
import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import { RegisterForm } from '../register-form';

const validValues = {
  displayName: '共享日历成员',
  email: 'member@example.test',
  password: 'correct horse battery staple 2026',
};

type RenderView = Awaited<ReturnType<typeof render>>;

const renderForm = async (overrides: Partial<React.ComponentProps<typeof RegisterForm>> = {}) => {
  const apiClient = {
    register: jest.fn().mockResolvedValue({
      code: 'REGISTRATION_ACCEPTED',
      pendingProof: 'native-proof',
    }),
  };
  const pendingProofStore: PendingProofStore = {
    clear: jest.fn(),
    read: jest.fn(),
    write: jest.fn(),
  };
  const onAccepted = jest.fn();

  const view = await render(
    <MuchakuchaThemeProvider>
      <RegisterForm
        apiClient={apiClient}
        onAccepted={onAccepted}
        pendingProofStore={pendingProofStore}
        platform="native"
        {...overrides}
      />
    </MuchakuchaThemeProvider>,
  );

  return { apiClient, onAccepted, pendingProofStore, view };
};

const fillValidForm = async (view: RenderView) => {
  await fireEvent.changeText(view.getByLabelText('邮箱'), validValues.email);
  await fireEvent.changeText(view.getByLabelText('昵称'), validValues.displayName);
  await fireEvent.changeText(view.getByLabelText('密码'), validValues.password);
};

describe('registration form contract', () => {
  test('validates email, nickname, and password only after interaction or submit', async () => {
    const { view } = await renderForm();

    expect(view.queryByText('请输入有效的邮箱地址。')).toBeNull();
    await fireEvent.changeText(view.getByLabelText('邮箱'), 'invalid');
    await fireEvent(view.getByLabelText('邮箱'), 'blur');

    expect(await view.findByText('请输入有效的邮箱地址。')).toBeTruthy();
    expect(view.queryByText('请输入昵称。')).toBeNull();

    await fireEvent.press(view.getByRole('button', { name: '创建账户' }));
    expect(await view.findByText('请输入昵称。')).toBeTruthy();
    expect(await view.findByText('密码至少需要 12 个字符。')).toBeTruthy();
  });

  test('keeps one stable primary action while registration is pending', async () => {
    let resolveRegistration: ((value: { code: 'REGISTRATION_ACCEPTED'; pendingProof: string }) => void) | undefined;
    const apiClient = {
      register: jest.fn(
        () =>
          new Promise<{ code: 'REGISTRATION_ACCEPTED'; pendingProof: string }>((resolve) => {
            resolveRegistration = resolve;
          }),
      ),
    };
    const { onAccepted, view } = await renderForm({ apiClient });
    await fillValidForm(view);

    await fireEvent.press(view.getByRole('button', { name: '创建账户' }));

    await waitFor(() => {
      expect(view.getByText('创建账户').parent?.props.accessibilityState).toEqual({
        busy: true,
        disabled: true,
      });
    });
    expect(view.getByText('创建账户')).toBeTruthy();
    expect(apiClient.register).toHaveBeenCalledTimes(1);

    resolveRegistration?.({ code: 'REGISTRATION_ACCEPTED', pendingProof: 'proof' });
    await waitFor(() => expect(onAccepted).toHaveBeenCalledWith(validValues.email));
  });

  test('maps safe field errors and announces non-field API failures', async () => {
    const apiClient = {
      register: jest
        .fn()
        .mockRejectedValueOnce({
          body: {
            error: {
              code: 'VALIDATION_FAILED',
              details: [{ codes: ['isEmail'], field: 'email' }],
            },
          },
          status: 400,
        })
        .mockRejectedValueOnce(new Error('network unavailable')),
    };
    const { view } = await renderForm({ apiClient });
    await fillValidForm(view);

    await fireEvent.press(view.getByRole('button', { name: '创建账户' }));
    expect(await view.findByText('请输入有效的邮箱地址。')).toBeTruthy();

    await fireEvent.press(view.getByRole('button', { name: '创建账户' }));
    const banner = await view.findByText('这次没有完成。请检查网络后重试。');
    expect(banner.parent?.parent?.parent?.props.accessibilityLiveRegion).toBe('assertive');
  });

  test('D-06 writes the API-issued native registration pending proof before opening verification', async () => {
    const { onAccepted, pendingProofStore, view } = await renderForm();
    await fillValidForm(view);

    await fireEvent.press(view.getByRole('button', { name: '创建账户' }));

    await waitFor(() => expect(pendingProofStore.write).toHaveBeenCalledWith('native-proof'));
    expect(onAccepted).toHaveBeenCalledWith(validValues.email);
    expect((pendingProofStore.write as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      onAccepted.mock.invocationCallOrder[0]!,
    );
  });

  test('D-06 relies on the API-issued HttpOnly pending cookie on Web and never stores proof in JavaScript', async () => {
    const { apiClient, onAccepted, pendingProofStore, view } = await renderForm({
      pendingProofStore: undefined,
      platform: 'web',
    });
    apiClient.register.mockResolvedValueOnce({ code: 'REGISTRATION_ACCEPTED' });
    await fillValidForm(view);

    await fireEvent.press(view.getByRole('button', { name: '创建账户' }));

    await waitFor(() => expect(onAccepted).toHaveBeenCalledWith(validValues.email));
    expect(apiClient.register).toHaveBeenCalledWith(
      { ...validValues, platform: 'web' },
      expect.any(AbortSignal),
    );
    expect(pendingProofStore.write).not.toHaveBeenCalled();
  });

  test('continues to the verification-pending route with the original delivery address', async () => {
    const { onAccepted, view } = await renderForm();
    await fillValidForm(view);

    await fireEvent.press(view.getByRole('button', { name: '创建账户' }));

    await waitFor(() => expect(onAccepted).toHaveBeenCalledWith('member@example.test'));
  });
});
