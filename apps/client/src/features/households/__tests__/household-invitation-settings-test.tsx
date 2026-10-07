import { ApiClientError } from '@muchakucha/api-client';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import { HouseholdSettings, type HouseholdSettingsApi, type HouseholdSettingsProps } from '../household-settings';

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
      members: [{ membershipId: 'membership-1', userId: 'owner', displayName: '家主', username: 'owner', role: 'OWNER', isCurrentUser: true }],
    }),
    updateHousehold: jest.fn(),
    sendHouseholdInvitation: jest.fn().mockResolvedValue({
      code: 'INVITATION_SENT', message: '邀请已发送到对方的收件箱。', invitationId: 'first',
    }),
    listInvitations: jest.fn().mockResolvedValue({ invitations: [{
      id: 'invitation-1', username: 'family-member', status: 'pending',
      role: 'MEMBER', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(),
    }] }),
    resendInvitation: jest.fn().mockResolvedValue({
      code: 'INVITATION_RESENT', message: '邀请已重新发送到对方的收件箱。', invitationId: 'replacement',
    }),
    revokeInvitation: jest.fn(),
  };
}

async function renderSettings(householdApi: HouseholdSettingsApi, props: Partial<HouseholdSettingsProps> = {}) {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}>
      <MuchakuchaThemeProvider>
        <HouseholdSettings
          householdId="household-1" householdName="家" showInvite
          deps={{ householdApi, getAccessToken: () => 'access-token' }}
          {...props}
        />
      </MuchakuchaThemeProvider>
    </SafeAreaProvider>,
  );
}

describe('username invitation settings', () => {
  test('accepts expanded username lookup and confirms inbox delivery after send and resend', async () => {
    const api = createApi();
    const view = await renderSettings(api);
    await fireEvent.press(await view.findByRole('button', { name: '邀请家人' }));
    const canonicalUsername = 'İ'.repeat(32).toLowerCase();
    await fireEvent.changeText(await view.findByLabelText('用户名'), ` ${canonicalUsername} `);
    await fireEvent.press(view.getByRole('button', { name: '发送邀请' }));
    await waitFor(() => expect(api.sendHouseholdInvitation).toHaveBeenCalledWith('access-token', 'household-1', { username: canonicalUsername }));
    expect(await view.findByText('邀请已发送到对方的收件箱。')).toBeTruthy();
    expect(view.queryByLabelText('邀请链接')).toBeNull();

    await fireEvent.press(view.getByLabelText('关闭邀请家人'));
    await fireEvent.press(view.getByLabelText('更多操作：邀请：family-member'));
    await fireEvent.press(view.getByLabelText('重新发送邀请给 family-member'));
    expect(await view.findByText('邀请已重新发送到对方的收件箱。')).toBeTruthy();
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

describe('renaming the household', () => {
  test('reports the name the server confirmed, so the household headers follow it', async () => {
    const api = createApi();
    jest.mocked(api.updateHousehold).mockResolvedValue({ ...(await api.getHousehold('access-token', 'household-1')), name: '新家' });
    const onRenamed = jest.fn();
    const view = await renderSettings(api, { showRename: true, onRenamed });
    await fireEvent.press(await view.findByRole('button', { name: '编辑家庭名称' }));
    await fireEvent.changeText(view.getByLabelText('家庭名称'), ' 新家 ');
    await fireEvent.press(view.getByRole('button', { name: '保存' }));
    expect(await view.findByText('家庭名称已更新。')).toBeTruthy();
    expect(onRenamed).toHaveBeenCalledWith('新家');
  });

  test('keeps the old name everywhere when the rename fails', async () => {
    const api = createApi();
    jest.mocked(api.updateHousehold).mockRejectedValue(new Error('offline'));
    const onRenamed = jest.fn();
    const view = await renderSettings(api, { showRename: true, onRenamed });
    await fireEvent.press(await view.findByRole('button', { name: '编辑家庭名称' }));
    await fireEvent.changeText(view.getByLabelText('家庭名称'), '新家');
    await fireEvent.press(view.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(api.updateHousehold).toHaveBeenCalled());
    expect(view.getByDisplayValue('新家')).toBeTruthy();
    expect(onRenamed).not.toHaveBeenCalled();
  });
});

describe('recovering from failed loads', () => {
  test('a failed member load offers a retry that brings the roster back', async () => {
    const api = createApi();
    (api.getHousehold as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    const view = await renderSettings(api);
    await fireEvent.press(await view.findByRole('button', { name: '重试加载成员' }));
    expect(await view.findByText('family-member')).toBeTruthy();
    expect(api.getHousehold).toHaveBeenCalledTimes(2);
  });

  test('a failed invitation list offers its own retry without reloading members', async () => {
    const api = createApi();
    (api.listInvitations as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    const view = await renderSettings(api);
    await fireEvent.press(await view.findByRole('button', { name: '重试加载邀请' }));
    expect(await view.findByText('family-member')).toBeTruthy();
    expect(api.getHousehold).toHaveBeenCalledTimes(1);
  });
});
