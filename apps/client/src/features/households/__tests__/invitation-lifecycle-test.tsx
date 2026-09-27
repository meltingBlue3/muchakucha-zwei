import { fireEvent, render } from '@testing-library/react-native';

import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import { InvitationRow, MemberRow } from '../../../ui/household-components';

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
      <MuchakuchaThemeProvider>
        <MemberRow member={{
          membershipId: 'member-1', userId: 'user-1', displayName: '家人',
          username: 'family-member', role: 'MEMBER', isCurrentUser: false,
        }} />
        <InvitationRow
          invitation={{ ...pendingInvitation, username: 'another-member' }}
          canManage={true}
          onResend={onResend}
        />
      </MuchakuchaThemeProvider>,
    );
    expect(view.getByText('family-member')).toBeTruthy();
    expect(view.getByText('another-member')).toBeTruthy();
    fireEvent.press(view.getByLabelText('重新发送邀请给 another-member'));
    expect(onResend).toHaveBeenCalledWith('inv-1');
  });

  test('shows pending invitation status and resend/revoke actions', async () => {
    const onResend = jest.fn();
    const onRevoke = jest.fn();

    const view = await render(
      <MuchakuchaThemeProvider>
        <InvitationRow
          invitation={pendingInvitation}
          canManage={true}
          onResend={onResend}
          onRevoke={onRevoke}
        />
      </MuchakuchaThemeProvider>,
    );

    // Status label and email render
    expect(view.getByText('待接受')).toBeTruthy();
    expect(view.getByText('pending')).toBeTruthy();

    // Resend button
    const resendButton = view.getByLabelText('重新发送邀请给 pending');
    expect(resendButton).toBeTruthy();
    await fireEvent.press(resendButton);
    expect(onResend).toHaveBeenCalledWith('inv-1');

    // Revoke button
    const revokeButton = view.getByLabelText('撤销邀请 pending');
    expect(revokeButton).toBeTruthy();
    await fireEvent.press(revokeButton);
    expect(onRevoke).toHaveBeenCalledWith('inv-1', expect.objectContaining({
      props: expect.objectContaining({ accessibilityLabel: '撤销邀请 pending' }),
    }));
  });
});
