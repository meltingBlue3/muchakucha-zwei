import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import { InvitationRow, MemberRow } from '../../../ui/household-components';

// The 「…」 menu places itself inside the safe area.
const Providers = ({ children }: { children: ReactNode }) => (
  <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}>
    <MuchakuchaThemeProvider>{children}</MuchakuchaThemeProvider>
  </SafeAreaProvider>
);

const pendingInvitation = {
  id: 'inv-1',
  username: 'pending',
  status: 'pending' as const,
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  role: 'MEMBER',
  createdAt: new Date().toISOString(),
};

describe('InvitationRow', () => {
  test('shows usernames for members and invitations without email', async () => {
    const onResend = jest.fn();
    const view = await render(
      <Providers>
        <MemberRow member={{
          membershipId: 'member-1', userId: 'user-1', displayName: '家人',
          username: 'family-member', role: 'MEMBER', isCurrentUser: false,
        }} />
        <InvitationRow
          invitation={{ ...pendingInvitation, username: 'another-member' }}
          canManage={true}
          onResend={onResend}
        />
      </Providers>,
    );
    expect(view.getByText('family-member')).toBeTruthy();
    expect(view.getByText('another-member')).toBeTruthy();
    // A member without governance actions has no menu.
    expect(view.queryByLabelText('更多操作：成员：家人')).toBeNull();
    await fireEvent.press(view.getByLabelText('更多操作：邀请：another-member'));
    await fireEvent.press(view.getByLabelText('重新发送邀请给 another-member'));
    await waitFor(() => expect(onResend).toHaveBeenCalledWith('inv-1'));
  });

  test('keeps member governance actions in the member menu', async () => {
    const onRemove = jest.fn();
    const view = await render(
      <Providers>
        <MemberRow member={{
          membershipId: 'member-1', userId: 'user-1', displayName: '家人',
          username: 'family-member', role: 'MEMBER', isCurrentUser: false,
        }} roleAction="promote" onRoleAction={jest.fn()} canRemoveMember onRemove={onRemove} />
      </Providers>,
    );
    await fireEvent.press(view.getByLabelText('更多操作：成员：家人'));
    expect(view.getByRole('menuitem', { name: '提升 家人' })).toBeTruthy();
    expect(view.queryByRole('menuitem', { name: '转移所有权给 家人' })).toBeNull();
    await fireEvent.press(view.getByRole('menuitem', { name: '移除 家人' }));
    await waitFor(() => expect(onRemove).toHaveBeenCalled());
  });

  test('shows pending invitation status and resend/revoke actions', async () => {
    const onResend = jest.fn();
    const onRevoke = jest.fn();

    const view = await render(
      <Providers>
        <InvitationRow
          invitation={pendingInvitation}
          canManage={true}
          onResend={onResend}
          onRevoke={onRevoke}
        />
      </Providers>,
    );

    // Status label and email render
    expect(view.getByText('待接受')).toBeTruthy();
    expect(view.getByText('pending')).toBeTruthy();

    // Resend and revoke live in the invitation's menu.
    const menu = view.getByLabelText('更多操作：邀请：pending');
    await fireEvent.press(menu);
    await fireEvent.press(view.getByRole('menuitem', { name: '重新发送邀请给 pending' }));
    await waitFor(() => expect(onResend).toHaveBeenCalledWith('inv-1'));

    await fireEvent.press(menu);
    await fireEvent.press(view.getByRole('menuitem', { name: '撤销邀请 pending' }));
    // The confirmation returns focus to the menu trigger.
    await waitFor(() => expect(onRevoke).toHaveBeenCalledWith('inv-1', expect.objectContaining({
      props: expect.objectContaining({ accessibilityLabel: '更多操作：邀请：pending' }),
    })));
  });
});
