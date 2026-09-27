import type { ApiClient } from '@muchakucha/api-client';
import { useRef, useState } from 'react';
import { Pressable } from 'react-native';
import { useTheme } from '@shopify/restyle';

import type { SessionStateStore } from './session-state';
import type { SessionTransport } from '../../platform/session/session-transport';
import { Banner, ConfirmActions, Heading, Stack, Text } from '../../ui/primitives';
import type { Theme } from '../../ui/theme';

const LOGOUT_ERROR = '暂时无法退出。请检查网络后重试。';

export interface LogoutActionProps {
  apiClient: Pick<ApiClient, 'logout'>;
  onLoggedOut(): void;
  sessionStateStore: SessionStateStore;
  sessionTransport: SessionTransport;
  confirmationOnly?: boolean;
  onCancel?: () => void;
  onBusyChange?: (busy: boolean) => void;
}

export const LogoutAction = ({
  apiClient,
  onLoggedOut,
  sessionStateStore,
  sessionTransport,
  confirmationOnly = false,
  onCancel,
  onBusyChange,
}: LogoutActionProps) => {
  const activeTheme = useTheme<Theme>();
  const [confirming, setConfirming] = useState(confirmationOnly);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState<string>();

  const logout = async (): Promise<void> => {
    if (pendingRef.current) return;
    const accessToken = sessionTransport.getAccessToken();
    if (accessToken === null) {
      setError(LOGOUT_ERROR);
      return;
    }
    pendingRef.current = true;
    // Tell the host window at once, not after the next render: an Escape in
    // between must not close the window while the request is in flight.
    onBusyChange?.(true);
    setPending(true);
    setError(undefined);
    try {
      await apiClient.logout(accessToken, new AbortController().signal);
      await sessionTransport.clear();
      sessionStateStore.enterUnauthenticated();
      onLoggedOut();
    } catch {
      if (!confirmationOnly) setConfirming(false);
      setError(LOGOUT_ERROR);
    } finally {
      setPending(false);
      pendingRef.current = false;
      onBusyChange?.(false);
    }
  };

  return (
    <Stack gap={4}>
      {error ? <Banner title="退出未完成">{error}</Banner> : null}
      {/* Only one of the trigger / confirm step is ever mounted at a time —
          having both visible together previously meant two identically
          labelled "退出登录" buttons on screen at once, which is confusing
          both visually and for screen readers (duplicate accessible names). */}
      {!confirming ? (
        <Pressable accessibilityRole="button" accessibilityLabel="退出登录" onPress={() => setConfirming(true)} style={({ pressed }) => ({ minHeight: activeTheme.controlSizes.touchTarget, justifyContent: 'center', alignItems: 'center', borderWidth: activeTheme.borderWidths.default, borderColor: activeTheme.colors.border, borderRadius: activeTheme.borderRadii.md, backgroundColor: pressed ? activeTheme.colors.surfaceMuted : activeTheme.colors.surface })}><Text variant="label" color="destructive">退出登录</Text></Pressable>
      ) : (
        <Stack
          accessibilityLabel={confirmationOnly ? undefined : '退出这台设备？'}
          accessibilityViewIsModal={!confirmationOnly}
          aria-modal={confirmationOnly ? undefined : true}
          gap={4}
          role={confirmationOnly ? undefined : 'dialog' as never}
        >
          {!confirmationOnly ? <Heading>退出这台设备？</Heading> : null}
          <Text>只会结束这台设备上的登录，其他设备不会退出。</Text>
          <ConfirmActions
            cancelAccessibilityLabel="取消退出登录"
            confirmLabel="确认退出"
            confirmAccessibilityLabel="确认退出登录"
            destructive
            busy={pending}
            onCancel={() => confirmationOnly ? onCancel?.() : setConfirming(false)}
            onConfirm={() => void logout()}
          />
        </Stack>
      )}
    </Stack>
  );
};
