import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import CircleUserRound from 'lucide-react-native/icons/circle-user-round';
import LogOut from 'lucide-react-native/icons/log-out';
import X from 'lucide-react-native/icons/x';
import { useCallback, useRef, useState, type RefObject } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LogoutAction } from '../features/auth/logout-action';
import { sessionApiClient, sessionStateStore, sessionTransport } from '../features/auth/session-runtime';
import { ProfileForm } from '../features/profile/profile-form';
import { useOverlayFocus } from '../platform/overlays/overlay-focus';
import { Heading, Inline, Text } from './primitives';
import { theme } from './theme';

type AccountPanel = 'closed' | 'menu' | 'profile' | 'logout';

export function AccountMenu({ blurTarget }: { blurTarget: RefObject<View | null> }) {
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
  const focusInitial = useOverlayFocus({ mode, panel, initial, trigger, onClose: close });
  const isMenu = mode === 'menu';
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
      {mode !== 'closed' ? (
        <Modal transparent visible animationType="none" onShow={focusInitial} onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
          <View style={{ flex: 1 }}>
            {!isMenu ? <BlurView testID="account-dialog-blur" pointerEvents="none" blurTarget={blurTarget} blurMethod="dimezisBlurView" intensity={theme.blur.dialog} tint="light" style={StyleSheet.absoluteFill} /> : null}
            <Pressable
              accessible={false}
              tabIndex={-1}
              testID="account-overlay-dismiss"
              onPress={close}
              style={[StyleSheet.absoluteFill, { backgroundColor: isMenu ? theme.colors.transparent : theme.colors.dialogOverlay }]}
            />
            {isMenu ? (
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
            ) : (
              <KeyboardAvoidingView pointerEvents="box-none" behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: theme.spacing[5], paddingTop: insets.top + theme.spacing[5], paddingBottom: insets.bottom + theme.spacing[5] }}>
                <View
                  ref={panel}
                  role={Platform.OS === 'web' ? 'dialog' : undefined}
                  aria-modal
                  accessibilityViewIsModal
                  accessibilityLabel={title}
                  style={{ width: '100%', maxWidth: theme.layout.dialogMaxWidth, maxHeight: '100%', backgroundColor: theme.colors.surface, borderRadius: theme.borderRadii.xl, borderColor: theme.colors.separator, borderWidth: theme.borderWidths.default, padding: theme.spacing[6], gap: theme.spacing[4] }}
                >
                  <Inline style={{ justifyContent: 'space-between' }}>
                    <Heading style={{ flex: 1 }}>{title}</Heading>
                    <Pressable ref={initial} accessibilityRole="button" accessibilityLabel={`关闭${title}`} disabled={busy} accessibilityState={{ disabled: busy }} onPress={close} style={({ pressed }) => ({ alignItems: 'center', justifyContent: 'center', minHeight: theme.controlSizes.touchTarget, minWidth: theme.controlSizes.touchTarget, borderRadius: theme.borderRadii.full, backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surfaceSubtle })}>
                      <X color={theme.colors.inkMuted} size={theme.controlSizes.icon} />
                    </Pressable>
                  </Inline>
                  <ScrollView keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }}>
                    {mode === 'profile' ? (
                      <ProfileForm showHeading={false} onBusyChange={setBusy} apiClient={sessionApiClient} sessionStateStore={sessionStateStore} sessionTransport={sessionTransport} />
                    ) : (
                      <LogoutAction confirmationOnly onCancel={close} onBusyChange={setBusy} apiClient={sessionApiClient} onLoggedOut={() => router.replace('/login')} sessionStateStore={sessionStateStore} sessionTransport={sessionTransport} />
                    )}
                  </ScrollView>
                </View>
              </KeyboardAvoidingView>
            )}
          </View>
        </Modal>
      ) : null}
    </>
  );
}
