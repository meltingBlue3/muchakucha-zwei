import type { CurrentUserDto } from '@muchakucha/api-client';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { LogoutAction } from '../../auth/logout-action';
import { createSessionStateStore } from '../../auth/session-state';
import type { SessionTransport } from '../../../platform/session/session-transport';
import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import { ProfileForm, type ProfileApi } from '../profile-form';

const currentUser: CurrentUserDto = {
  username: 'family_member',
  displayName: '家庭成员',
  email: 'member@example.test',
  emailVerified: true,
  hasHousehold: false,
  id: 'current-user',
};

function createTransport(): SessionTransport {
  return {
    acceptIssuedSession: jest.fn(),
    clear: jest.fn().mockResolvedValue(undefined),
    getAccessToken: jest.fn(() => 'current-access-token'),
    loadCurrentUser: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    restore: jest.fn(),
  } as SessionTransport;
}

function createProfileApi(): ProfileApi {
  return {
    getMe: jest.fn().mockResolvedValue(currentUser),
    updateMe: jest.fn(async (_token, body) => ({ ...currentUser, ...body })),
  };
}

async function renderProfile(overrides: Partial<React.ComponentProps<typeof ProfileForm>> = {}) {
  const apiClient = overrides.apiClient ?? createProfileApi();
  const sessionStateStore = overrides.sessionStateStore ?? createSessionStateStore();
  const sessionTransport = overrides.sessionTransport ?? createTransport();
  const view = await render(
    <MuchakuchaThemeProvider>
      <ProfileForm
        apiClient={apiClient}
        sessionStateStore={sessionStateStore}
        sessionTransport={sessionTransport}
      />
    </MuchakuchaThemeProvider>,
  );
  await waitFor(() => expect(view.getByLabelText('昵称').props.value).toBe(currentUser.displayName));
  return { apiClient, sessionStateStore, sessionTransport, view };
}

describe('profile nickname form contract', () => {
  test('loads only the authenticated subject profile and displays the current nickname', async () => {
    const { apiClient, view } = await renderProfile();
    expect(apiClient.getMe).toHaveBeenCalledWith('current-access-token', expect.any(AbortSignal));
    expect(view.getByLabelText('昵称').props.value).toBe('家庭成员');
    expect(view.getByText('family_member')).toBeTruthy();
    expect(JSON.stringify(view.toJSON())).not.toContain(currentUser.email);
  });

  test('validates nickname after interaction and submits only the allowed field', async () => {
    const { apiClient, view } = await renderProfile();
    const nickname = view.getByLabelText('昵称');
    await fireEvent.changeText(nickname, '   ');
    await fireEvent(nickname, 'blur');
    expect(await view.findByText('请输入昵称。')).toBeTruthy();

    await fireEvent.changeText(nickname, '  新昵称  ');
    await fireEvent.press(view.getByRole('button', { name: '保存昵称' }));
    await waitFor(() =>
      expect(apiClient.updateMe).toHaveBeenCalledWith(
        'current-access-token',
        { displayName: '新昵称' },
        expect.any(AbortSignal),
      ),
    );
  });

  test('allows duplicate display names while preserving the authenticated subject', async () => {
    const { apiClient, sessionStateStore, view } = await renderProfile();
    await fireEvent.changeText(view.getByLabelText('昵称'), '可重复的家庭昵称');
    await fireEvent.press(view.getByRole('button', { name: '保存昵称' }));

    const success = await view.findByText('昵称已更新。');
    expect(success.parent?.props.accessibilityLiveRegion).toBe('polite');
    expect(sessionStateStore.get()).toEqual({
      kind: 'authenticated',
      session: {
        accessToken: 'current-access-token',
        currentUser: { ...currentUser, displayName: '可重复的家庭昵称' },
      },
    });
    expect(apiClient.updateMe).toHaveBeenCalledTimes(1);
  });

  test('keeps the save label stable and prevents repeat submission while pending', async () => {
    let complete!: (user: CurrentUserDto) => void;
    const apiClient = createProfileApi();
    (apiClient.updateMe as jest.Mock).mockImplementation(
      () => new Promise<CurrentUserDto>((resolve) => (complete = resolve)),
    );
    const { view } = await renderProfile({ apiClient });
    await fireEvent.changeText(view.getByLabelText('昵称'), '等待保存');
    const save = view.getByRole('button', { name: '保存昵称' });
    await fireEvent.press(save);
    await waitFor(() =>
      expect(view.getByText('保存昵称').parent?.props.accessibilityState).toEqual({
        busy: true,
        disabled: true,
      }),
    );
    await fireEvent.press(save);
    expect(apiClient.updateMe).toHaveBeenCalledTimes(1);
    complete({ ...currentUser, displayName: '等待保存' });
    expect(await view.findByText('昵称已更新。')).toBeTruthy();
  });

  test('announces nickname success and maps safe field and form errors', async () => {
    const apiClient = createProfileApi();
    (apiClient.updateMe as jest.Mock)
      .mockRejectedValueOnce({
        body: { error: { details: [{ field: 'displayName' }] } },
        status: 400,
      })
      .mockRejectedValueOnce(new Error('private upstream detail'));
    const { view } = await renderProfile({ apiClient });
    await fireEvent.changeText(view.getByLabelText('昵称'), '字段错误');
    await fireEvent.press(view.getByRole('button', { name: '保存昵称' }));
    expect(await view.findByText('请输入 1–80 个字符的昵称。')).toBeTruthy();

    await fireEvent.changeText(view.getByLabelText('昵称'), '服务错误');
    await fireEvent.press(view.getByRole('button', { name: '保存昵称' }));
    expect(await view.findByText('这次没有完成。请检查网络后重试。')).toBeTruthy();
    expect(JSON.stringify(view.toJSON())).not.toContain('private upstream detail');
  });
});

describe('current-device logout contract', () => {
  test('confirms, calls generated logout, then clears only local transport state', async () => {
    const order: string[] = [];
    const apiClient = { logout: jest.fn(async () => void order.push('server')) };
    const sessionTransport = createTransport();
    (sessionTransport.clear as jest.Mock).mockImplementation(async () => void order.push('local'));
    const sessionStateStore = createSessionStateStore();
    const onLoggedOut = jest.fn(() => order.push('route'));
    const view = await render(
      <MuchakuchaThemeProvider>
        <LogoutAction
          apiClient={apiClient}
          onLoggedOut={onLoggedOut}
          sessionStateStore={sessionStateStore}
          sessionTransport={sessionTransport}
        />
      </MuchakuchaThemeProvider>,
    );

    await fireEvent.press(view.getByRole('button', { name: '退出登录' }));
    expect(view.getByText('退出这台设备？')).toBeTruthy();
    // The trigger button is unmounted once the confirm step is showing —
    // it must not still be reachable, and there must be exactly one
    // confirm affordance (previously both stayed mounted with the same
    // "退出登录" label, which was ambiguous for screen readers and easy to
    // misclick).
    expect(view.queryByRole('button', { name: '退出登录' })).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: '确认退出登录' }));
    await waitFor(() => expect(onLoggedOut).toHaveBeenCalledTimes(1));
    expect(apiClient.logout).toHaveBeenCalledWith('current-access-token', expect.any(AbortSignal));
    expect(order).toEqual(['server', 'local', 'route']);
    expect(sessionStateStore.get()).toEqual({ kind: 'unauthenticated' });
  });

  test('retains the active credential when the server outcome is unavailable', async () => {
    const apiClient = { logout: jest.fn().mockRejectedValue(new Error('network detail')) };
    const sessionTransport = createTransport();
    const view = await render(
      <MuchakuchaThemeProvider>
        <LogoutAction
          apiClient={apiClient}
          onLoggedOut={jest.fn()}
          sessionStateStore={createSessionStateStore()}
          sessionTransport={sessionTransport}
        />
      </MuchakuchaThemeProvider>,
    );
    await fireEvent.press(view.getByRole('button', { name: '退出登录' }));
    await fireEvent.press(view.getByRole('button', { name: '确认退出登录' }));
    expect(await view.findByText('暂时无法退出。请检查网络后重试。')).toBeTruthy();
    expect(sessionTransport.clear).not.toHaveBeenCalled();
  });
});
