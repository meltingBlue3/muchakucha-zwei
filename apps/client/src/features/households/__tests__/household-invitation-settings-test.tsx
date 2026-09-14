import { ApiClientError } from '@muchakucha/api-client';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import { HouseholdSettings, type HouseholdSettingsApi } from '../household-settings';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = jest.requireActual<typeof import('react')>('react');
    React.useEffect(effect, [effect]);
  },
}));

function createApi(): HouseholdSettingsApi {
  return {
    getHousehold: jest.fn().mockResolvedValue({
      id: 'household-1', name: '家', ownerMembershipId: 'membership-1', createdAt: new Date().toISOString(),
      members: [{ membershipId: 'membership-1', userId: 'owner', displayName: '家主', username: 'owner', email: '', role: 'OWNER', isCurrentUser: true }],
    }),
    updateHousehold: jest.fn(),
    sendHouseholdInvitation: jest.fn().mockResolvedValue({
      code: 'INVITATION_SENT', message: '邀请链接已生成，请发给家人。', invitationUrl: 'https://family.test/invite/first',
    }),
    listInvitations: jest.fn().mockResolvedValue({ invitations: [{
      id: 'invitation-1', emailCanonical: '', username: 'family-member', status: 'pending',
      role: 'MEMBER', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(),
    }] }),
    resendInvitation: jest.fn().mockResolvedValue({
      code: 'INVITATION_RESENT', message: '邀请链接已更新，请发给家人。', invitationUrl: 'https://family.test/invite/replacement',
    }),
    revokeInvitation: jest.fn(),
  };
}

async function renderSettings(householdApi: HouseholdSettingsApi) {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}>
      <MuchakuchaThemeProvider>
        <HouseholdSettings
          householdId="household-1" householdName="家" onOpenSwitcher={jest.fn()} showInvite
          deps={{ householdApi, getAccessToken: () => 'access-token' }}
        />
      </MuchakuchaThemeProvider>
    </SafeAreaProvider>,
  );
}

describe('username invitation settings', () => {
  test('accepts expanded username lookup and shows selectable links after send and resend', async () => {
    const api = createApi();
    const view = await renderSettings(api);
    await fireEvent.press(await view.findByRole('button', { name: '邀请家人' }));
    const canonicalUsername = 'İ'.repeat(32).toLowerCase();
    await fireEvent.changeText(await view.findByLabelText('用户名'), ` ${canonicalUsername} `);
    await fireEvent.press(view.getByRole('button', { name: '发送邀请' }));
    await waitFor(() => expect(api.sendHouseholdInvitation).toHaveBeenCalledWith('access-token', 'household-1', { username: canonicalUsername }));
    expect(await view.findByText('https://family.test/invite/first')).toBeTruthy();
    expect(view.getByLabelText('邀请链接').props.selectable).toBe(true);

    await fireEvent.press(view.getByLabelText('关闭邀请家人'));
    await fireEvent.press(view.getByLabelText('重新发送邀请给 family-member'));
    expect(await view.findByText('https://family.test/invite/replacement')).toBeTruthy();
    expect(view.queryByText('https://family.test/invite/first')).toBeNull();
  });

  test('shows an unknown username error and retains the input', async () => {
    const api = createApi();
    jest.mocked(api.sendHouseholdInvitation).mockRejectedValue(new ApiClientError(400, { error: { code: 'INVITATION_USER_NOT_FOUND' } }));
    const view = await renderSettings(api);
    await fireEvent.press(await view.findByRole('button', { name: '邀请家人' }));
    await fireEvent.changeText(await view.findByLabelText('用户名'), 'missing-family-member');
    await fireEvent.press(view.getByRole('button', { name: '发送邀请' }));
    expect(await view.findByText('未找到这个用户名，请让家人先注册账户。')).toBeTruthy();
    expect(view.getByDisplayValue('missing-family-member')).toBeTruthy();
    expect(view.queryByLabelText('邀请链接')).toBeNull();
  });
});
