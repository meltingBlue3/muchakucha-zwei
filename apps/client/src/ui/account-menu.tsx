import { AppDialog } from './app-dialog';
import { useRouter } from 'expo-router';
import CircleUserRound from 'lucide-react-native/icons/circle-user-round';
import LogOut from 'lucide-react-native/icons/log-out';

import { useCallback, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LogoutAction } from '../features/auth/logout-action';
import { sessionApiClient, sessionStateStore, sessionTransport } from '../features/auth/session-runtime';
import { ProfileForm } from '../features/profile/profile-form';
import { useOverlayFocus } from '../platform/overlays/overlay-focus';
import { Text } from './primitives';
import { theme } from './theme';

type AccountPanel = 'closed' | 'menu' | 'profile' | 'logout';

export function AccountMenu() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const trigger = useRef<View>(null);
  const panel = useRef<View>(null);
  const initial = useRef<View>(null);
  const [mode, setMode] = useState<AccountPanel>('closed');
  const [busy, setBusy] = useState(false);
  const [anchorBottom, setAnchorBottom] = useState(insets.top + theme.controlSizes.touchTarget);
  const close = useCallback(() => { if (!busy) setMode('closed'); }, [busy]);
  const focusInitial = useOverlayFocus({ mode: mode === 'menu' ? 'menu' : 'closed', panel, initial, trigger, onClose: close });

  const title = mode === 'profile' ? '个人资料' : '退出登录';

  const openMenu = () => {
    setBusy(false);
    trigger.current?.measureInWindow((_x, y, _width, triggerHeight) => setAnchorBottom(y + triggerHeight));
    setMode('menu');
  };

  return (
    <>
      <Pressable
        ref={trigger}
        accessibilityRole="button"
        accessibilityLabel="个人中心"
        accessibilityState={{ expanded: mode !== 'closed' }}
        aria-haspopup="menu"
        onPress={openMenu}
        style={({ pressed }) => ({ alignItems: 'center', justifyContent: 'center', minHeight: theme.controlSizes.touchTarget, minWidth: theme.controlSizes.touchTarget, borderRadius: theme.borderRadii.full, backgroundColor: pressed || mode !== 'closed' ? theme.colors.coralSoft : theme.colors.transparent })}
      >
        <CircleUserRound color={mode !== 'closed' ? theme.colors.link : theme.colors.ink} size={theme.controlSizes.icon} strokeWidth={theme.controlSizes.iconStroke} />
      </Pressable>
      {mode === 'menu' ? (
        <Modal transparent visible animationType="none" onShow={focusInitial} onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
          <View style={{ flex: 1 }}>
            <Pressable
              accessible={false}
              tabIndex={-1}
              testID="account-overlay-dismiss"
              onPress={close}
              style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.transparent }]}
            />

              <View
                ref={panel}
                accessibilityRole="menu"
                accessibilityLabel="账户菜单"
                accessibilityViewIsModal
                style={{ position: 'absolute', top: Math.max(insets.top, Math.min(anchorBottom + theme.spacing[2], height - insets.bottom - theme.layout.accountMenuHeight)), right: theme.layout.mobileInset, width: Math.min(theme.layout.accountMenuWidth, width - theme.layout.mobileInset * 2), backgroundColor: theme.colors.surface, borderRadius: theme.borderRadii.lg, borderWidth: theme.borderWidths.default, borderColor: theme.colors.separator, padding: theme.spacing[2], boxShadow: theme.shadow.soft }}
              >
                {([
                  { key: 'profile', label: '个人资料', icon: CircleUserRound },
                  { key: 'logout', label: '退出登录', icon: LogOut },
                ] as const).map(({ key, label, icon: Icon }, index) => (
                  <Pressable
                    key={key}
                    ref={index === 0 ? initial : undefined}
                    accessibilityRole="menuitem"
                    accessibilityLabel={label}
                    onPress={() => setMode(key)}
                    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3], minHeight: theme.controlSizes.touchTarget, paddingHorizontal: theme.spacing[3], borderRadius: theme.borderRadii.md, backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.transparent })}
                  >
                    <Icon color={key === 'logout' ? theme.colors.destructive : theme.colors.ink} size={theme.controlSizes.icon} />
                    <Text variant="label" color={key === 'logout' ? 'destructive' : 'ink'}>{label}</Text>
                  </Pressable>
                ))}
              </View>

          </View>
        </Modal>
      ) : null}
      {mode === 'profile' || mode === 'logout' ? (
        <AppDialog title={title} busy={busy} onClose={close} trigger={trigger}>
          {mode === 'profile' ? (
            <ProfileForm showHeading={false} onBusyChange={setBusy} apiClient={sessionApiClient} sessionStateStore={sessionStateStore} sessionTransport={sessionTransport} />
          ) : (
            <LogoutAction confirmationOnly onCancel={close} onBusyChange={setBusy} apiClient={sessionApiClient} onLoggedOut={() => router.replace('/login')} sessionStateStore={sessionStateStore} sessionTransport={sessionTransport} />
          )}
        </AppDialog>
      ) : null}
    </>
  );
}
