import { fireEvent, render, waitFor } from '@testing-library/react-native';

import type { PendingProofStore } from '../../../platform/session/pending-proof';
import type { SessionTransport } from '../../../platform/session/session-transport';
import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import { createSessionStateStore } from '../session-state';
import {
  VerificationFlow,
  VerificationLanding,
  VerificationPending,
  type VerificationApi,
} from '../verification-flow';

const token = 'v'.repeat(43);

function createDependencies(outcome: Parameters<typeof renderFlow>[0] = 'verified_auto_login') {
  const apiClient: VerificationApi = {
    completeEmailVerification: jest.fn().mockResolvedValue({
      outcome,
      ...(outcome === 'verified_auto_login'
        ? { accessToken: 'access-secret', refreshToken: 'refresh-secret' }
        : {}),
    }),
    resendEmailVerification: jest.fn().mockResolvedValue({
      code: 'RESEND_ACCEPTED',
      retryAfterSeconds: 60,
    }),
  };
  const pendingProofStore: PendingProofStore = {
    clear: jest.fn().mockResolvedValue(undefined),
    read: jest.fn().mockResolvedValue('pending-secret'),
    write: jest.fn().mockResolvedValue(undefined),
  };
  const sessionTransport: SessionTransport = {
    acceptIssuedSession: jest.fn().mockResolvedValue({ accessToken: 'access-secret' }),
    clear: jest.fn().mockResolvedValue(undefined),
    getAccessToken: jest.fn().mockReturnValue(null),
    loadCurrentUser: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    restore: jest.fn(),
  };
  return {
    apiClient,
    onHouseholdHandoff: jest.fn(),
    onLogin: jest.fn(),
    pendingProofStore,
    sessionStateStore: createSessionStateStore(),
    sessionTransport,
  };
}

async function renderFlow(
  outcome:
    | 'verified_auto_login'
    | 'verified_login_required'
    | 'expired'
    | 'used'
    | 'invalid'
    | 'superseded' = 'verified_auto_login',
) {
  const dependencies = createDependencies(outcome);
  const view = await render(
    <MuchakuchaThemeProvider>
      <VerificationFlow
        {...dependencies}
        platform="native"
        token={token}
      />
    </MuchakuchaThemeProvider>,
  );
  return { ...dependencies, view };
}

describe('email verification continuation contract', () => {
  test('sanitizes the token-bearing landing URL before rendering or completing verification', async () => {
    const dependencies = createDependencies('verified_login_required');
    const replaceTokenBearingLocation = jest.fn();
    const view = await render(
      <MuchakuchaThemeProvider>
        <VerificationLanding
          {...dependencies}
          platform="web"
          replaceTokenBearingLocation={replaceTokenBearingLocation}
          token={token}
        />
      </MuchakuchaThemeProvider>,
    );

    await waitFor(() => expect(dependencies.apiClient.completeEmailVerification).toHaveBeenCalled());
    expect(replaceTokenBearingLocation).toHaveBeenCalledTimes(1);
    expect(replaceTokenBearingLocation.mock.invocationCallOrder[0]).toBeLessThan(
      (dependencies.apiClient.completeEmailVerification as jest.Mock).mock.invocationCallOrder[0]!,
    );
    expect(JSON.stringify(view.toJSON())).not.toContain(token);
  });

  test('D-06 reads and terminally clears the native registration pending proof exactly once', async () => {
    const { apiClient, pendingProofStore, view } = await renderFlow();

    await view.findByText('验证成功');
    expect(pendingProofStore.read).toHaveBeenCalledTimes(1);
    expect(pendingProofStore.clear).toHaveBeenCalledTimes(1);
    expect(apiClient.completeEmailVerification).toHaveBeenCalledWith(
      { pendingProof: 'pending-secret', platform: 'native', token },
      expect.any(AbortSignal),
    );
  });

  test('D-06 accepts the issued session, publishes authenticated state, then hands off', async () => {
    const {
      onHouseholdHandoff,
      pendingProofStore,
      sessionStateStore,
      sessionTransport,
      view,
    } = await renderFlow();
    const continueButton = await view.findByRole('button', { name: '继续' });

    expect(sessionTransport.acceptIssuedSession).toHaveBeenCalledWith({
      accessToken: 'access-secret',
      refreshToken: 'refresh-secret',
    });
    expect((pendingProofStore.clear as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (sessionTransport.acceptIssuedSession as jest.Mock).mock.invocationCallOrder[0]!,
    );
    expect(sessionStateStore.get()).toEqual({
      kind: 'authenticated',
      session: { accessToken: 'access-secret' },
    });
    await fireEvent.press(continueButton);
    expect(onHouseholdHandoff).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['expired', '验证链接已过期'],
    ['used', '邮箱已验证'],
    ['invalid', '无法验证此链接'],
    ['superseded', '请使用最新验证链接'],
  ] as const)('renders the distinct %s terminal outcome without exposing secrets', async (outcome, heading) => {
    const { pendingProofStore, view } = await renderFlow(outcome);

    await view.findByText(heading);
    expect(pendingProofStore.clear).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(view.toJSON())).not.toMatch(/pending-secret|refresh-secret|v{43}/);
  });

  test('requires login after cross-device verification instead of inventing a session', async () => {
    const dependencies = createDependencies('verified_login_required');
    const view = await render(
      <MuchakuchaThemeProvider>
        <VerificationFlow {...dependencies} platform="web" token={token} />
      </MuchakuchaThemeProvider>,
    );

    const login = await view.findByRole('button', { name: '前往登录' });
    expect(dependencies.pendingProofStore.read).not.toHaveBeenCalled();
    expect(dependencies.sessionTransport.acceptIssuedSession).not.toHaveBeenCalled();
    expect(dependencies.apiClient.completeEmailVerification).toHaveBeenCalledWith(
      { token },
      expect.any(AbortSignal),
    );
    await fireEvent.press(login);
    expect(dependencies.onLogin).toHaveBeenCalledTimes(1);
  });

  test('uses the server retry value for resend eligibility and live countdown state', async () => {
    const dependencies = createDependencies();
    const view = await render(
      <MuchakuchaThemeProvider>
        <VerificationPending
          apiClient={dependencies.apiClient}
          email="member@example.test"
          initialRetryAfterSeconds={0}
          onOpenEmail={jest.fn()}
        />
      </MuchakuchaThemeProvider>,
    );

    await fireEvent.press(view.getByRole('button', { name: '重新发送验证邮件' }));
    expect(await view.findByText('验证邮件已重新发送。请查看最新邮件。')).toBeTruthy();
    const countdown = view.getByText('60 秒后可重新发送');
    expect(countdown.props.accessibilityLiveRegion).toBe('polite');
    expect(view.getByRole('button', { name: '重新发送验证邮件' }).props.accessibilityState).toEqual({
      busy: false,
      disabled: true,
    });
  });
});
