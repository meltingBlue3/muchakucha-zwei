import type { GetHouseholdResponseDto, InvitationPreviewResponseDto } from '@muchakucha/api-client';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import { InvitationFlow, type InvitationFlowApi } from '../invitation-flow';

function createInvitationApi(overrides?: {
  previewResult?: InvitationPreviewResponseDto;
  acceptResult?: GetHouseholdResponseDto;
  acceptError?: Error;
}): InvitationFlowApi {
  return {
    previewInvitation: jest
      .fn()
      .mockResolvedValue(overrides?.previewResult ?? { kind: 'invalid' }),
    acceptInvitation: overrides?.acceptError
      ? jest.fn().mockRejectedValue(overrides.acceptError)
      : jest.fn().mockResolvedValue(
          overrides?.acceptResult ?? {
            id: 'hh-1',
            name: '温暖小家',
            ownerMembershipId: 'ms-1',
            createdAt: new Date().toISOString(),
            members: [],
          },
        ),
  };
}

const validPreview: InvitationPreviewResponseDto = {
  kind: 'valid',
  householdName: '温暖小家',
  inviterDisplayName: '家主',
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
};

describe('InvitationFlow', () => {
  test('shows loading state initially', async () => {
    const apiClient = createInvitationApi();
    // Delay the preview resolution to keep loading visible.
    (apiClient.previewInvitation as jest.Mock).mockImplementation(
      () => new Promise(() => {}),
    );

    const view = await render(
      <MuchakuchaThemeProvider>
        <InvitationFlow
          apiClient={apiClient}
          isAuthenticated={false}
          onLogin={jest.fn()}
          onRegister={jest.fn()}
          onSwitchAccount={jest.fn()}
          onEnterHousehold={jest.fn()}
          token="test-token"
        />
      </MuchakuchaThemeProvider>,
    );

    await waitFor(() =>
      expect(view.getByText('正在加载邀请')).toBeTruthy(),
    );
  });

  test('shows public preview when unauthenticated and invitation is valid', async () => {
    const apiClient = createInvitationApi({ previewResult: validPreview });

    const view = await render(
      <MuchakuchaThemeProvider>
        <InvitationFlow
          apiClient={apiClient}
          isAuthenticated={false}
          onLogin={jest.fn()}
          onRegister={jest.fn()}
          onSwitchAccount={jest.fn()}
          onEnterHousehold={jest.fn()}
          token="test-token"
        />
      </MuchakuchaThemeProvider>,
    );

    await waitFor(() =>
      expect(view.getByText('加入家庭')).toBeTruthy(),
    );

    // Household name and inviter are visible (D-07)
    expect(view.getByText('温暖小家')).toBeTruthy();
    expect(view.getByText('家主')).toBeTruthy();

    // Login and register buttons are present
    expect(view.getByText('登录并继续')).toBeTruthy();
    expect(view.getByText('创建账户并继续')).toBeTruthy();
  });

  test('shows accept button when authenticated and invitation is valid', async () => {
    const apiClient = createInvitationApi({ previewResult: validPreview });

    const view = await render(
      <MuchakuchaThemeProvider>
        <InvitationFlow
          apiClient={apiClient}
          isAuthenticated={true}
          accessToken="token-123"
          onLogin={jest.fn()}
          onRegister={jest.fn()}
          onSwitchAccount={jest.fn()}
          onEnterHousehold={jest.fn()}
          token="test-token"
        />
      </MuchakuchaThemeProvider>,
    );

    await waitFor(() =>
      expect(view.getAllByText('接受邀请').length).toBeGreaterThanOrEqual(1),
    );

    // Household name and inviter are visible
    expect(view.getByText('温暖小家')).toBeTruthy();
    expect(view.getByText('家主')).toBeTruthy();

    // Accept button is present (no auto-accept)
    expect(view.getAllByText('接受邀请').length).toBeGreaterThanOrEqual(1);

    // Login/register buttons are NOT present (already authenticated)
    expect(view.queryByText('登录并继续')).toBeNull();
    expect(view.queryByText('创建账户并继续')).toBeNull();
  });

  test('triggers accept and calls onEnterHousehold on success', async () => {
    const household: GetHouseholdResponseDto = {
      id: 'hh-1',
      name: '温暖小家',
      ownerMembershipId: 'ms-1',
      createdAt: new Date().toISOString(),
      members: [
        {
          membershipId: 'ms-2',
          userId: 'user-2',
          displayName: '被邀请人',
          email: 'invitee@example.test',
          role: 'MEMBER',
          isCurrentUser: true,
        },
      ],
    };

    const apiClient = createInvitationApi({
      previewResult: validPreview,
      acceptResult: household,
    });
    const onEnterHousehold = jest.fn();

    const view = await render(
      <MuchakuchaThemeProvider>
        <InvitationFlow
          apiClient={apiClient}
          isAuthenticated={true}
          accessToken="token-123"
          onLogin={jest.fn()}
          onRegister={jest.fn()}
          onSwitchAccount={jest.fn()}
          onEnterHousehold={onEnterHousehold}
          token="test-token"
        />
      </MuchakuchaThemeProvider>,
    );

    // Wait for the accept button to appear
    await waitFor(() =>
      expect(view.getAllByText('接受邀请').length).toBeGreaterThanOrEqual(1),
    );

    // Click accept
    fireEvent.press(view.getAllByText('接受邀请')[0]!);

    // Verify API was called
    await waitFor(() =>
      expect(apiClient.acceptInvitation).toHaveBeenCalledWith('token-123', {
        token: 'test-token',
      }),
    );

    // Verify success state
    await waitFor(() =>
      expect(view.getByText('邀请已接受')).toBeTruthy(),
    );

    // Click "进入家庭"
    fireEvent.press(view.getByText('进入家庭'));
    expect(onEnterHousehold).toHaveBeenCalledWith(household);
  });

  test('shows mismatch state on 403 error', async () => {
    const error = { status: 403, body: { code: 'INVITATION_EMAIL_MISMATCH' } };
    const apiClient = createInvitationApi({
      previewResult: validPreview,
      acceptError: error as unknown as Error,
    });

    const view = await render(
      <MuchakuchaThemeProvider>
        <InvitationFlow
          apiClient={apiClient}
          isAuthenticated={true}
          accessToken="token-123"
          onLogin={jest.fn()}
          onRegister={jest.fn()}
          onSwitchAccount={jest.fn()}
          onEnterHousehold={jest.fn()}
          token="test-token"
        />
      </MuchakuchaThemeProvider>,
    );

    // Wait for accept button
    await waitFor(() =>
      expect(view.getAllByText('接受邀请').length).toBeGreaterThanOrEqual(1),
    );

    // Click accept (will trigger 403)
    fireEvent.press(view.getAllByText('接受邀请')[0]!);

    // Should show mismatch state (D-08)
    await waitFor(() =>
      expect(view.getByText('此邀请发给了另一个邮箱')).toBeTruthy(),
    );

    // Switch account button is present
    expect(view.getByText('切换账户')).toBeTruthy();

    // Household name and inviter are hidden
    expect(view.queryByText('温暖小家')).toBeNull();
    expect(view.queryByText('家主')).toBeNull();
  });

  test('shows terminal state for invalid invitation', async () => {
    const apiClient = createInvitationApi({
      previewResult: { kind: 'invalid' },
    });

    const view = await render(
      <MuchakuchaThemeProvider>
        <InvitationFlow
          apiClient={apiClient}
          isAuthenticated={false}
          onLogin={jest.fn()}
          onRegister={jest.fn()}
          onSwitchAccount={jest.fn()}
          onEnterHousehold={jest.fn()}
          token="bad-token"
        />
      </MuchakuchaThemeProvider>,
    );

    await waitFor(() =>
      expect(view.getByText('无效的邀请链接')).toBeTruthy(),
    );

    expect(view.getByText('这个邀请无效或已失效。请联系家庭管理员重新发送。')).toBeTruthy();
  });

  test('shows terminal state for expired invitation', async () => {
    const apiClient = createInvitationApi({
      previewResult: { kind: 'expired' },
    });

    const view = await render(
      <MuchakuchaThemeProvider>
        <InvitationFlow
          apiClient={apiClient}
          isAuthenticated={false}
          onLogin={jest.fn()}
          onRegister={jest.fn()}
          onSwitchAccount={jest.fn()}
          onEnterHousehold={jest.fn()}
          token="expired-token"
        />
      </MuchakuchaThemeProvider>,
    );

    await waitFor(() =>
      expect(view.getByText('邀请链接已过期')).toBeTruthy(),
    );
  });

  test('shows terminal state for used invitation', async () => {
    const apiClient = createInvitationApi({
      previewResult: { kind: 'used' },
    });

    const view = await render(
      <MuchakuchaThemeProvider>
        <InvitationFlow
          apiClient={apiClient}
          isAuthenticated={false}
          onLogin={jest.fn()}
          onRegister={jest.fn()}
          onSwitchAccount={jest.fn()}
          onEnterHousehold={jest.fn()}
          token="used-token"
        />
      </MuchakuchaThemeProvider>,
    );

    await waitFor(() =>
      expect(view.getByText('邀请已经接受')).toBeTruthy(),
    );
  });
});
