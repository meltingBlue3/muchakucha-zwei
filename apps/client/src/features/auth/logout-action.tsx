import type { ApiClient } from '@muchakucha/api-client';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';

import type { SessionStateStore } from './session-state';
import type { SessionTransport } from '../../platform/session/session-transport';
import { Banner, Heading, Stack, Text } from '../../ui/primitives';
import type { Theme } from '../../ui/theme';

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
  const activeTheme = useTheme<Theme>();
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
      {/* Only one of the trigger / confirm step is ever mounted at a time —
          having both visible together previously meant two identically
          labelled "退出登录" buttons on screen at once, which is confusing
          both visually and for screen readers (duplicate accessible names). */}
      {!confirming ? (
        <Pressable accessibilityRole="button" accessibilityLabel="退出登录" onPress={() => setConfirming(true)} style={({ pressed }) => ({ minHeight: activeTheme.controlSizes.touchTarget, justifyContent: 'center', alignItems: 'center', borderWidth: activeTheme.borderWidths.default, borderColor: activeTheme.colors.border, borderRadius: activeTheme.borderRadii.md, backgroundColor: pressed ? activeTheme.colors.surfaceMuted : activeTheme.colors.surface })}><Text variant="label" color="destructive">退出登录</Text></Pressable>
      ) : (
        <Stack
          accessibilityLabel="退出这台设备？"
          accessibilityViewIsModal
          aria-modal
          gap={4}
          role={'dialog' as never}
        >
          <Heading>退出这台设备？</Heading>
          <Text>只会结束这台设备上的登录，其他设备不会退出。</Text>
          {/* Cancel-then-confirm ordering and outline-vs-filled styling match
              the delete-confirmation pattern used across events/tasks/notes. */}
          <View style={{ flexDirection: 'row', gap: activeTheme.spacing[3] }}>
            <Pressable
              disabled={pending}
              onPress={() => setConfirming(false)}
              hitSlop={activeTheme.spacing[1]}
              accessibilityRole="button"
              accessibilityLabel="取消退出登录"
              style={({ pressed }) => ({
                flex: 1,
                alignItems: 'center',
                paddingVertical: activeTheme.spacing[3],
                borderRadius: activeTheme.borderRadii.sm,
                borderWidth: 1,
                borderColor: activeTheme.colors.border,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text variant="button" color="ink">取消</Text>
            </Pressable>
            <Pressable
              disabled={pending}
              onPress={() => void logout()}
              hitSlop={activeTheme.spacing[1]}
              accessibilityRole="button"
              accessibilityLabel="确认退出登录"
              accessibilityState={{ busy: pending, disabled: pending }}
              style={({ pressed }) => ({
                flex: 1,
                alignItems: 'center',
                paddingVertical: activeTheme.spacing[3],
                borderRadius: activeTheme.borderRadii.sm,
                backgroundColor: pending ? activeTheme.colors.disabled : activeTheme.colors.coral,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text variant="button" color="surface">
                {pending ? '退出中…' : '确认退出'}
              </Text>
            </Pressable>
          </View>
        </Stack>
      )}
    </Stack>
  );
};
