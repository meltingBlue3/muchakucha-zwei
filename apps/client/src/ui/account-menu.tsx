import { AppDialog } from './app-dialog';
import { useRouter } from 'expo-router';
import Bell from 'lucide-react-native/icons/bell';
import CircleUserRound from 'lucide-react-native/icons/circle-user-round';
import LogOut from 'lucide-react-native/icons/log-out';
import Settings from 'lucide-react-native/icons/settings';

import { useCallback, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LogoutAction } from '../features/auth/logout-action';
import { sessionApiClient, sessionStateStore, sessionTransport } from '../features/auth/session-runtime';
import { useCurrentUser } from '../features/auth/use-current-user';
import { ProfileForm } from '../features/profile/profile-form';
import { useOverlayFocus } from '../platform/overlays/overlay-focus';
import { MemberAvatar } from './member-avatar';
import { Text } from './primitives';
import { theme } from './theme';
import { useDesktop } from './use-desktop';
import { useSidebarRail } from './sidebar-rail';
import { useTranslation } from '../i18n';

type AccountPanel = 'closed' | 'menu' | 'profile' | 'logout';

/**
 * The signed-in person's avatar, opening 个人资料, the 设置 and 提醒 pages and
 * 退出登录.
 * `row` is the sidebar form: avatar and name across the bottom of the
 * navigation.
 */
export function AccountMenu({ variant = 'icon' }: { variant?: 'icon' | 'row' }) {
  const router = useRouter();
  const { t } = useTranslation(['profile', 'auth', 'settings']);
  const user = useCurrentUser();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const desktop = useDesktop();
  const sidebarRail = useSidebarRail().rail;
  const rail = desktop && variant === 'row' && sidebarRail;
  const trigger = useRef<View>(null);
  const panel = useRef<View>(null);
  const initial = useRef<View>(null);
  const [mode, setMode] = useState<AccountPanel>('closed');
  const [busy, setBusy] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, top: insets.top + theme.controlSizes.touchTarget, bottom: 0 });
  const close = useCallback(() => { if (!busy) setMode('closed'); }, [busy]);
  const focusInitial = useOverlayFocus({ mode: mode === 'menu' ? 'menu' : 'closed', panel, initial, trigger, onClose: close });

  const title = mode === 'profile' ? t('title') : t('auth:logout.action');
  const open = mode !== 'closed';

  const openMenu = () => {
    setBusy(false);
    trigger.current?.measureInWindow((x, y, _width, triggerHeight) => setAnchor({ x, top: y + triggerHeight, bottom: y }));
    setMode('menu');
  };

  const avatar = user
    ? <MemberAvatar id={user.id} name={user.displayName} />
    : <CircleUserRound color={theme.colors.ink} size={theme.controlSizes.icon + theme.spacing[1]} strokeWidth={theme.controlSizes.iconStroke} />;
  const menuWidth = Math.min(theme.layout.accountMenuWidth, width - theme.layout.mobileInset * 2);
  // The sidebar trigger sits at the bottom left, so its menu opens upward from it.
  const placement = variant === 'row'
    ? { left: anchor.x, bottom: Math.max(insets.bottom, height - anchor.bottom + theme.spacing[2]) }
    : { right: theme.layout.mobileInset, top: Math.max(insets.top, Math.min(anchor.top + theme.spacing[2], height - insets.bottom - theme.layout.accountMenuHeight)) };

  return (
    <>
      <Pressable
        ref={trigger}
        accessibilityRole="button"
        accessibilityLabel={t('pageTitle')}
        accessibilityState={{ expanded: open }}
        aria-haspopup="menu"
        onPress={openMenu}
        style={({ pressed }) => variant === 'row'
          ? { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: desktop ? theme.spacing[2] + 2 : theme.spacing[3], minHeight: desktop ? theme.spacing[10] + theme.spacing[1] : theme.controlSizes.touchTarget, paddingHorizontal: theme.spacing[2], borderRadius: desktop ? theme.borderRadii.sm : theme.borderRadii.md, backgroundColor: pressed || open ? theme.colors.surfaceMuted : theme.colors.transparent }
          : { alignItems: 'center', justifyContent: 'center', minHeight: theme.controlSizes.touchTarget, minWidth: theme.controlSizes.touchTarget, borderRadius: theme.borderRadii.full, opacity: pressed ? 0.7 : 1 }}
      >
        {avatar}
        {variant === 'row' && !rail ? <View style={{ flex: 1, minWidth: 0 }}><Text variant={desktop ? 'label' : 'bodySm'} color="ink" numberOfLines={1} style={desktop ? { fontSize: theme.typography.meta.fontSize, lineHeight: theme.typography.meta.lineHeight } : undefined}>{user?.displayName ?? t('pageTitle')}</Text>{user?.username ? <Text variant={desktop ? 'caption' : 'meta'} color={desktop ? 'inkFaint' : 'inkMuted'} numberOfLines={1} style={desktop ? { fontFamily: theme.fontFamilies.numeric, fontWeight: '400' } : undefined}>{user.username}</Text> : null}</View> : null}
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
              accessibilityLabel={t('accountMenu')}
              accessibilityViewIsModal
              style={{ position: 'absolute', ...placement, width: menuWidth, backgroundColor: theme.colors.surface, borderRadius: theme.borderRadii.lg, padding: theme.spacing[2], boxShadow: theme.shadow.soft }}
            >
              {user ? (
                <View style={{ paddingHorizontal: theme.spacing[3], paddingTop: theme.spacing[2], paddingBottom: theme.spacing[3], marginBottom: theme.spacing[1], borderBottomWidth: theme.borderWidths.default, borderBottomColor: theme.colors.separator }}>
                  <Text variant="label" numberOfLines={1}>{user.displayName}</Text>
                  <Text variant="caption" numberOfLines={1}>{user.username}</Text>
                </View>
              ) : null}
              {([
                { key: 'profile', label: t('title'), icon: CircleUserRound },
                { key: 'settings', label: t('settings:title'), icon: Settings },
                { key: 'reminders', label: t('links.reminders.label'), icon: Bell },
                { key: 'logout', label: t('auth:logout.action'), icon: LogOut },
              ] as const).map(({ key, label, icon: Icon }, index) => (
                <Pressable
                  key={key}
                  ref={index === 0 ? initial : undefined}
                  accessibilityRole="menuitem"
                  accessibilityLabel={label}
                  onPress={() => {
                    if (desktop && key === 'profile') { setMode('closed'); router.push('/profile'); return; }
                    if (key === 'profile' || key === 'logout') { setMode(key); return; }
                    setMode('closed');
                    router.push(`/${key}`);
                  }}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3], minHeight: theme.controlSizes.touchTarget, paddingHorizontal: theme.spacing[3], borderRadius: theme.borderRadii.md, backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.transparent })}
                >
                  <Icon color={key === 'logout' ? theme.colors.destructive : theme.colors.inkMuted} size={theme.controlSizes.icon} strokeWidth={theme.controlSizes.iconStroke} />
                  <Text variant="bodySm" color={key === 'logout' ? 'destructive' : 'ink'}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Modal>
      ) : null}
      {mode === 'profile' || mode === 'logout' ? (
        <AppDialog title={title} busy={busy} onClose={close} trigger={trigger}>
          {mode === 'profile' ? (
            <ProfileForm onBusyChange={setBusy} apiClient={sessionApiClient} sessionStateStore={sessionStateStore} sessionTransport={sessionTransport} />
          ) : (
            <LogoutAction confirmationOnly onCancel={close} onBusyChange={setBusy} apiClient={sessionApiClient} onLoggedOut={() => router.replace('/login')} sessionStateStore={sessionStateStore} sessionTransport={sessionTransport} />
          )}
        </AppDialog>
      ) : null}
    </>
  );
}
