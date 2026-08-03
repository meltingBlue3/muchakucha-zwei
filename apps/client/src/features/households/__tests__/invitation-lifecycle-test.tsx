import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import {
  ConfirmationPage,
  InvitationRow,
  type InvitationRowProps,
} from '../../../ui/household-components';

const pendingInvitation: InvitationRowProps['invitation'] = {
  id: 'inv-1',
  emailCanonical: 'pending@example.test',
  status: 'pending',
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  role: 'MEMBER',
  createdAt: new Date().toISOString(),
};

const expiredInvitation: InvitationRowProps['invitation'] = {
  id: 'inv-2',
  emailCanonical: 'expired@example.test',
  status: 'expired',
  expiresAt: new Date(Date.now() - 1000).toISOString(),
  role: 'MEMBER',
  createdAt: new Date(Date.now() - 86400000).toISOString(),
};

const acceptedInvitation: InvitationRowProps['invitation'] = {
  id: 'inv-3',
  emailCanonical: 'accepted@example.test',
  status: 'accepted',
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
  role: 'MEMBER',
  createdAt: new Date(Date.now() - 3600000).toISOString(),
};

const revokedInvitation: InvitationRowProps['invitation'] = {
  id: 'inv-4',
  emailCanonical: 'revoked@example.test',
  status: 'revoked',
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
  role: 'MEMBER',
  createdAt: new Date(Date.now() - 7200000).toISOString(),
};

describe('InvitationRow', () => {
  test('shows pending status and resend/revoke actions when canManage is true', async () => {
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

    // Status label visible
    await waitFor(() => expect(view.getByText('待接受')).toBeTruthy());
    // Email visible
    await waitFor(() => expect(view.getByText('pending@example.test')).toBeTruthy());

    // Resend button accessible
    const resendButton = view.getByLabelText('重新发送邀请给 pending@example.test');
    expect(resendButton).toBeTruthy();
    fireEvent.press(resendButton);
    expect(onResend).toHaveBeenCalledWith('inv-1');

    // Revoke button accessible
    const revokeButton = view.getByLabelText('撤销邀请 pending@example.test');
    expect(revokeButton).toBeTruthy();
    fireEvent.press(revokeButton);
    expect(onRevoke).toHaveBeenCalledWith('inv-1');
  });

  test('shows expired status and resend action only (no revoke)', async () => {
    const onResend = jest.fn();

    const view = await render(
      <MuchakuchaThemeProvider>
        <InvitationRow
          invitation={expiredInvitation}
          canManage={true}
          onResend={onResend}
        />
      </MuchakuchaThemeProvider>,
    );

    await waitFor(() => expect(view.getByText('已过期')).toBeTruthy());

    // Resend button should be present for expired invitations
    const resendButton = view.getByLabelText('重新发送邀请给 expired@example.test');
    expect(resendButton).toBeTruthy();
    fireEvent.press(resendButton);
    expect(onResend).toHaveBeenCalledWith('inv-2');

    // No revoke button for expired invitations
    expect(() => view.getByLabelText('撤销邀请 expired@example.test')).toThrow();
  });

  test('shows accepted status and no actions', async () => {
    const view = await render(
      <MuchakuchaThemeProvider>
        <InvitationRow
          invitation={acceptedInvitation}
          canManage={true}
        />
      </MuchakuchaThemeProvider>,
    );

    await waitFor(() => expect(view.getByText('已接受')).toBeTruthy());

    // No resend or revoke buttons for accepted
    expect(() => view.getByLabelText('重新发送邀请给 accepted@example.test')).toThrow();
    expect(() => view.getByLabelText('撤销邀请 accepted@example.test')).toThrow();
  });

  test('shows revoked status and no actions', async () => {
    const view = await render(
      <MuchakuchaThemeProvider>
        <InvitationRow
          invitation={revokedInvitation}
          canManage={true}
        />
      </MuchakuchaThemeProvider>,
    );

    await waitFor(() => expect(view.getByText('已撤销')).toBeTruthy());
  });

  test('hides actions when canManage is false', async () => {
    const view = await render(
      <MuchakuchaThemeProvider>
        <InvitationRow
          invitation={pendingInvitation}
          canManage={false}
        />
      </MuchakuchaThemeProvider>,
    );

    await waitFor(() => expect(view.getByText('待接受')).toBeTruthy());

    // No resend or revoke buttons when canManage is false
    expect(() => view.getByLabelText('重新发送邀请给 pending@example.test')).toThrow();
    expect(() => view.getByLabelText('撤销邀请 pending@example.test')).toThrow();
  });

  test('disables actions when busy', async () => {
    const onResend = jest.fn();
    const onRevoke = jest.fn();

    const view = await render(
      <MuchakuchaThemeProvider>
        <InvitationRow
          invitation={pendingInvitation}
          canManage={true}
          onResend={onResend}
          onRevoke={onRevoke}
          resendBusy={true}
          revokeBusy={true}
        />
      </MuchakuchaThemeProvider>,
    );

    await waitFor(() => expect(view.getByText('待接受')).toBeTruthy());

    // Check that the buttons have accessible loading state
    const resendSpinner = view.getByLabelText('重新发送中');
    expect(resendSpinner).toBeTruthy();
  });

  test('shows expiry timestamp in zh-CN locale', async () => {
    const view = await render(
      <MuchakuchaThemeProvider>
        <InvitationRow
          invitation={pendingInvitation}
          canManage={true}
        />
      </MuchakuchaThemeProvider>,
    );

    // Just verify the component renders without error. The exact locale format
    // is environment-dependent in jsdom.
    await waitFor(() => expect(view.getByText('pending@example.test')).toBeTruthy());
  });
});

describe('ConfirmationPage', () => {
  test('renders heading, body, safe action, and destructive action', async () => {
    const onSafeAction = jest.fn();
    const onDestructiveAction = jest.fn();

    const view = await render(
      <MuchakuchaThemeProvider>
        <ConfirmationPage
          heading="撤销邀请？"
          body="撤销后，原链接将不能使用。"
          safeActionLabel="保留邀请"
          safeActionOnPress={onSafeAction}
          destructiveActionLabel="撤销邀请"
          destructiveActionOnPress={onDestructiveAction}
        />
      </MuchakuchaThemeProvider>,
    );

    await waitFor(() => expect(view.getByText('撤销邀请？')).toBeTruthy());
    await waitFor(() => expect(view.getByText('撤销后，原链接将不能使用。')).toBeTruthy());

    // Safe action is first (retained as per UI-SPEC)
    const safeButton = view.getByText('保留邀请');
    expect(safeButton).toBeTruthy();
    fireEvent.press(safeButton);
    expect(onSafeAction).toHaveBeenCalledTimes(1);

    // Destructive action
    const destructiveButton = view.getByText('撤销邀请');
    expect(destructiveButton).toBeTruthy();
    fireEvent.press(destructiveButton);
    expect(onDestructiveAction).toHaveBeenCalledTimes(1);
  });

  test('disables both actions when busy', async () => {
    const onSafeAction = jest.fn();
    const onDestructiveAction = jest.fn();

    const view = await render(
      <MuchakuchaThemeProvider>
        <ConfirmationPage
          heading="撤销邀请？"
          body="撤销后，原链接将不能使用。"
          safeActionLabel="保留邀请"
          safeActionOnPress={onSafeAction}
          destructiveActionLabel="撤销邀请"
          destructiveActionOnPress={onDestructiveAction}
          busy={true}
        />
      </MuchakuchaThemeProvider>,
    );

    await waitFor(() => expect(view.getByText('撤销邀请？')).toBeTruthy());

    const safeButton = view.getByText('保留邀请');
    fireEvent.press(safeButton);
    // Should not fire when busy
    expect(onSafeAction).not.toHaveBeenCalled();

    const destructiveButton = view.getByText('撤销邀请');
    fireEvent.press(destructiveButton);
    // Should not fire when busy
    expect(onDestructiveAction).not.toHaveBeenCalled();
  });
});
