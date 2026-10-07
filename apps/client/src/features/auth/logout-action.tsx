import type { ApiClient } from '@muchakucha/api-client';
import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import LogOut from 'lucide-react-native/icons/log-out';

import type { SessionStateStore } from './session-state';
import type { SessionTransport } from '../../platform/session/session-transport';
import { AppDialog } from '../../ui/app-dialog';
import { Banner, ConfirmActions, Stack, Text } from '../../ui/primitives';
import type { Theme } from '../../ui/theme';

const LOGOUT_ERROR = '暂时无法退出。请检查网络后重试。';

export interface LogoutActionProps {
  apiClient: Pick<ApiClient, 'logout'>;
  onLoggedOut(): void;
  sessionStateStore: SessionStateStore;
  sessionTransport: SessionTransport;
  /** Render only the confirmation, inside a window the host already owns. */
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
  const trigger = useRef<View>(null);
  const [confirming, setConfirming] = useState(false);
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
      setError(LOGOUT_ERROR);
    } finally {
      setPending(false);
      pendingRef.current = false;
      onBusyChange?.(false);
    }
  };

  const cancel = () => {
    setError(undefined);
    if (confirmationOnly) onCancel?.();
    else setConfirming(false);
  };

  const confirmation = (
    <Stack gap={4}>
      {error ? <Banner title="退出未完成">{error}</Banner> : null}
      <Text>只会结束这台设备上的登录，其他设备不会退出。</Text>
      <ConfirmActions
        cancelAccessibilityLabel="取消退出登录"
        confirmLabel="确认退出"
        confirmAccessibilityLabel="确认退出登录"
        destructive
        busy={pending}
        onCancel={cancel}
        onConfirm={() => void logout()}
      />
    </Stack>
  );

  if (confirmationOnly) return confirmation;

  return (
    <>
      {/* Drawn like 「离开家庭」 at the foot of 家庭设置: a quiet red entry, not a boxed button. */}
      <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel="退出登录" onPress={() => setConfirming(true)} style={({ pressed }) => ({ minHeight: activeTheme.controlSizes.touchTarget, flexDirection: 'row', gap: activeTheme.spacing[2], justifyContent: 'center', alignItems: 'center', borderRadius: activeTheme.borderRadii.lg, backgroundColor: pressed ? activeTheme.colors.destructiveSoft : activeTheme.colors.transparent })}>
        <LogOut size={activeTheme.controlSizes.icon} color={activeTheme.colors.destructive} strokeWidth={activeTheme.controlSizes.iconStroke} />
        <Text variant="label" color="destructive">退出登录</Text>
      </Pressable>
      {confirming ? <AppDialog title="退出这台设备？" busy={pending} onClose={cancel} trigger={trigger}>{confirmation}</AppDialog> : null}
    </>
  );
};
