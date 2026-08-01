import type { ApiClient } from '@muchakucha/api-client';
import { useState } from 'react';

import type { SessionStateStore } from './session-state';
import type { SessionTransport } from '../../platform/session/session-transport';
import { Banner, Button, Heading, Stack, Text } from '../../ui/primitives';

const LOGOUT_ERROR = '暂时无法退出。请检查网络后重试。';

export interface LogoutActionProps {
  apiClient: Pick<ApiClient, 'logout'>;
  onLoggedOut(): void;
  sessionStateStore: SessionStateStore;
  sessionTransport: SessionTransport;
}

export const LogoutAction = ({
  apiClient,
  onLoggedOut,
  sessionStateStore,
  sessionTransport,
}: LogoutActionProps) => {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const logout = async (): Promise<void> => {
    if (pending) return;
    const accessToken = sessionTransport.getAccessToken();
    if (accessToken === null) {
      setError(LOGOUT_ERROR);
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      await apiClient.logout(accessToken, new AbortController().signal);
      await sessionTransport.clear();
      sessionStateStore.enterUnauthenticated();
      onLoggedOut();
    } catch {
      setConfirming(false);
      setError(LOGOUT_ERROR);
    } finally {
      setPending(false);
    }
  };

  return (
    <Stack gap={4}>
      {error ? <Banner title="退出未完成">{error}</Banner> : null}
      <Button label="退出登录" onPress={() => setConfirming(true)} />
      {confirming ? (
        <Stack
          accessibilityViewIsModal
          aria-modal
          gap={4}
          role={'dialog' as never}
        >
          <Heading>退出这台设备？</Heading>
          <Text>只会结束这台设备上的登录，其他设备不会退出。</Text>
          <Button
            disabled={pending}
            label="退出登录"
            loading={pending}
            onPress={() => void logout()}
          />
          <Button disabled={pending} label="取消" onPress={() => setConfirming(false)} />
        </Stack>
      ) : null}
    </Stack>
  );
};
