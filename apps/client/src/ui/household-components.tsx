import { rememberRouteTrigger } from '../platform/overlays/route-trigger';
import { BlurTargetView } from 'expo-blur';
import Inbox from 'lucide-react-native/icons/inbox';
import { AccountMenu } from './account-menu';
import { DialogBackground } from './dialog-background';
import { DialogBackdrop } from './dialog-backdrop';
import type { GetHouseholdMemberDto, ListMyHouseholdsItemDto } from '@muchakucha/api-client';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import Building2 from 'lucide-react-native/icons/building-2';
import X from 'lucide-react-native/icons/x';
import Check from 'lucide-react-native/icons/check';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import HousePlus from 'lucide-react-native/icons/house-plus';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import Crown from 'lucide-react-native/icons/crown';
import Shield from 'lucide-react-native/icons/shield';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';
import Clock from 'lucide-react-native/icons/clock';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import Ban from 'lucide-react-native/icons/ban';
import Mail from 'lucide-react-native/icons/mail';
import CircleArrowUp from 'lucide-react-native/icons/circle-arrow-up';
import CircleArrowDown from 'lucide-react-native/icons/circle-arrow-down';
import UserMinus from 'lucide-react-native/icons/user-minus';

import { useRouter } from 'expo-router';
import React, { forwardRef, useCallback, useRef } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  IconButton,
  Heading,
  Inline,
  LoadError,
  Spinner,
  Stack,
  Text,
} from './primitives';
import { theme } from './theme';
import { KeyboardArea, scrollKeyboardDismissMode } from './keyboard-area';
import { MemberAvatar } from './member-avatar';
import { PageCreateActionContext } from './page-intro';
import { ActionNotice, useActionNoticeDismissal, type ActionNoticeProps } from './action-notice';
import { formatDateTime } from './date-values';
import { CardActionsMenu, type CardAction } from './card-actions-menu';

// ---- AppShell ----

interface AppShellProps {
  children: React.ReactNode;
  accessibilityLabel?: string;
  refreshing?: boolean;
  onRefresh?: () => void;
  title?: string | undefined;
  showBack?: boolean;
  onBack?: () => void;
  showProfile?: boolean;
  /** Off on the inbox itself, so the header never links to the page you are on. */
  showInbox?: boolean;
  footer?: React.ReactNode;
  headerContent?: React.ReactNode;
  floatingAction?: React.ReactNode;
  /** A notice floating at the top of the content; a touch anywhere else dismisses it. */
  notice?: ActionNoticeProps | null;
  /** A workspace owns its scrolling areas and persistent composer. */
  layout?: 'document' | 'workspace';
  /**
   * How wide the page grows on a large screen: `reading` keeps a single
   * column of lists or text comfortable; `wide` leaves room for two columns.
   */
  width?: 'reading' | 'wide';
}

export const AppShell = ({
  children,
  accessibilityLabel,
  refreshing = false,
  onRefresh,
  title,
  showBack = false,
  onBack,
  showProfile = false,
  showInbox = true,
  footer,
  headerContent,
  floatingAction,
  notice,
  layout = 'document',
  width: contentWidth = 'wide',
}: AppShellProps) => {
  const router = useRouter();
  const blurTarget = useRef<View>(null);
  const noticeDismissal = useActionNoticeDismissal(notice);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const desktopActions = Platform.OS === 'web' && width >= theme.layout.navigationBreakpoint;
  const wideNavigation = width >= theme.layout.navigationBreakpoint && footer !== undefined;

  const handleBack = useCallback(() => {
    if (onBack !== undefined) {
      onBack();
    } else {
      router.back();
    }
  }, [onBack, router]);

  // With the sidebar open, the household switch and the account live in it,
  // so a destination page needs no header row of its own.
  const hasNav = (title !== undefined || showBack || showProfile) && !(wideNavigation && headerContent !== undefined && !showBack);
  const inset = width < theme.breakpoints.mobile ? theme.layout.compactInset : theme.layout.mobileInset;

  return (
    <DialogBackground.Provider value={blurTarget}>
    <BlurTargetView ref={blurTarget} style={{ flex: 1 }}>
    <SafeAreaView
      accessibilityLabel={accessibilityLabel}
      role={Platform.OS === 'web' ? 'main' : undefined}
      {...(notice ? { onStartShouldSetResponderCapture: noticeDismissal.pageCapture, ...(noticeDismissal.pageTouchEnd ? { onTouchEnd: noticeDismissal.pageTouchEnd, onTouchCancel: noticeDismissal.pageTouchEnd } : {}) } : {})}
      style={{ backgroundColor: theme.colors.canvas, flex: 1, flexDirection: wideNavigation ? 'row' : 'column' }}
    >
      {wideNavigation ? footer : null}
      <View style={{ flex: 1, minWidth: 0 }}>
      {hasNav ? (
        <View
          style={{
            alignItems: 'center',
            backgroundColor: theme.colors.canvas,
            flexDirection: 'row',
            justifyContent: 'space-between',
            minHeight: theme.controlSizes.touchTarget + theme.spacing[2],
            paddingLeft: showBack ? theme.spacing[1] : inset,
            paddingRight: theme.spacing[2],
          }}
        >
          {/* Left: back button */}
          {headerContent === undefined || showBack ? <View style={{ width: showProfile && headerContent === undefined ? theme.controlSizes.touchTarget * 2 : theme.controlSizes.touchTarget, alignItems: 'flex-start' }}>
            {showBack ? (
              <Pressable
                accessibilityLabel="返回"
                accessibilityRole="button"
                onPress={handleBack}
                style={{
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: theme.controlSizes.touchTarget,
                  minWidth: theme.controlSizes.touchTarget,
                }}
              >
                <ArrowLeft
                  color={theme.colors.ink}
                  size={theme.controlSizes.icon}
                  strokeWidth={theme.controlSizes.iconStroke}
                />
              </Pressable>
            ) : null}
          </View> : null}

          {/* Center: title */}
          {headerContent === undefined ? <Text
            numberOfLines={1}
            style={{ flex: 1, textAlign: 'center' }}
            variant="section"
          >
            {title ?? ''}
          </Text> : <View style={{ flex: 1, minWidth: 0, paddingRight: theme.spacing[4] }}>{headerContent}</View>}

          {/* Global destinations: inbox directly precedes the account menu. */}
          <View style={{ minWidth: theme.controlSizes.touchTarget, flexDirection: 'row', alignItems: 'center' }}>
            {showProfile ? <>{showInbox ? <InboxButton /> : null}<AccountMenu /></> : null}
          </View>
        </View>
      ) : null}
      {/* Its parent starts below the status bar, which the keyboard view cannot see. */}
      <KeyboardArea style={{ flex: 1 }} windowOffset={insets.top}>
        {layout === 'workspace' ? children : <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: wideNavigation ? theme.spacing[10] : inset,
            paddingTop: wideNavigation ? theme.spacing[8] : hasNav ? theme.spacing[1] : theme.spacing[6],
            paddingBottom: floatingAction && !desktopActions ? theme.spacing[16] + theme.spacing[10] : theme.spacing[10],
            maxWidth: Platform.OS === 'web' ? (contentWidth === 'reading' ? theme.layout.contentMaxWidth : theme.layout.householdMaxWidth) + (wideNavigation ? theme.spacing[10] * 2 : 0) : undefined,
            alignSelf: Platform.OS === 'web' ? 'center' : undefined,
            width: '100%',
          }}
          keyboardDismissMode={scrollKeyboardDismissMode}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh !== undefined ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[theme.colors.inkMuted]}
                tintColor={theme.colors.inkMuted}
              />
            ) : undefined
          }
        >
          <PageCreateActionContext.Provider value={desktopActions ? floatingAction : null}>{children}</PageCreateActionContext.Provider>
        </ScrollView>}
        {floatingAction && !desktopActions ? <View pointerEvents="box-none" style={{ position: 'absolute', right: theme.layout.mobileInset, bottom: theme.spacing[4] }}>{floatingAction}</View> : null}
        {notice ? <View pointerEvents="box-none" style={{ position: 'absolute', top: theme.spacing[2], left: theme.layout.mobileInset, right: theme.layout.mobileInset, alignItems: 'center' }}><ActionNotice {...notice} onTouchCapture={noticeDismissal.noticeCapture} /></View> : null}
      </KeyboardArea>
      </View>
      {!wideNavigation ? footer : null}
    </SafeAreaView>
    </BlurTargetView>
    </DialogBackground.Provider>
  );
};

// ---- InboxButton ----

/** The personal inbox, where invitations to other households arrive. */
export const InboxButton = () => {
  const router = useRouter();
  return <IconButton appearance="plain" label="收件箱" icon={<Inbox color={theme.colors.inkMuted} size={theme.controlSizes.icon} strokeWidth={theme.controlSizes.iconStroke} />} onPress={() => router.push('/inbox')} />;
};

// ---- HouseholdHeader ----

interface HouseholdHeaderProps {
  householdName: string;
  onOpenSwitcher: () => void;
  /** `sidebar` is the larger form at the top of the wide-screen navigation. */
  placement?: 'bar' | 'sidebar';
}

/** The current household's name with a chevron; it opens the household menu. */
export const HouseholdHeader = ({ householdName, onOpenSwitcher, placement = 'bar' }: HouseholdHeaderProps) => (
  <Pressable
    accessibilityLabel={`当前家庭：${householdName}，切换家庭`}
    accessibilityRole="button"
    onPress={onOpenSwitcher}
    style={({ pressed }) => ({
      alignItems: 'center',
      alignSelf: placement === 'sidebar' ? 'stretch' : 'flex-start',
      backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.transparent,
      borderRadius: theme.borderRadii.md,
      flexDirection: 'row',
      flexShrink: 1,
      gap: theme.spacing[1],
      marginLeft: placement === 'bar' ? -theme.spacing[2] : 0,
      maxWidth: '100%',
      minHeight: theme.controlSizes.touchTarget,
      paddingHorizontal: theme.spacing[2],
    })}
  >
    <Text
      numberOfLines={1}
      variant={placement === 'sidebar' ? 'section' : 'label'}
      color={placement === 'sidebar' ? 'ink' : 'inkMuted'}
      style={{ flexShrink: 1 }}
    >
      {householdName}
    </Text>
    <ChevronDown color={theme.colors.inkMuted} size={theme.controlSizes.icon - theme.spacing[1]} strokeWidth={theme.controlSizes.iconStroke} />
  </Pressable>
);

// ---- HouseholdContextNote ----

interface HouseholdContextNoteProps {
  householdName: string;
}

export const HouseholdContextNote = ({ householdName }: HouseholdContextNoteProps) => (
  <Inline gap={1}>
    <Building2 color={theme.colors.inkMuted} size={theme.controlSizes.icon} strokeWidth={theme.controlSizes.iconStroke} />
    <Text variant="bodySm">保存到：{householdName}</Text>
  </Inline>
);

// ---- HouseholdCard ----

interface HouseholdCardProps {
  household: ListMyHouseholdsItemDto;
  isCurrent?: boolean;
  onSelect?: (id: string) => void;
  primaryAction?: { label: string; onPress: () => void };
}

export const HouseholdCard = ({ household, isCurrent = false, onSelect, primaryAction }: HouseholdCardProps) => {
  const roleText = household.role === 'OWNER' ? '所有者' : household.role === 'ADMIN' ? '管理员' : '成员';
  const memberLabel = `${household.memberCount} 位成员`;

  return (
    <View style={{
      backgroundColor: theme.colors.surface,
      borderColor: isCurrent ? theme.colors.primary : theme.colors.transparent,
      borderRadius: theme.borderRadii.lg,
      borderWidth: theme.borderWidths.default,
      overflow: 'hidden',
      padding: theme.spacing[4],
    }}>
      <Stack gap={2}>
        <Pressable
          accessibilityRole={onSelect !== undefined ? 'button' : 'none'}
          onPress={onSelect !== undefined ? () => onSelect(household.id) : undefined}
          style={({ pressed }) => ({ borderRadius: theme.borderRadii.md, backgroundColor: pressed ? theme.colors.surfaceSubtle : theme.colors.transparent })}
        >
        <Inline gap={2} style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Stack gap={1} style={{ flex: 1 }}>
            <Text
              numberOfLines={1}
              variant="body"
              style={{ fontWeight: '600' as const }}
              accessibilityLabel={`家庭：${household.name}`}
            >
              {household.name}
            </Text>
            <Inline gap={2}>
              <Text variant="bodySm">{roleText}</Text>
              <Text variant="bodySm">{memberLabel}</Text>
            </Inline>
          </Stack>
          {isCurrent ? (
            <Check color={theme.colors.ink} size={theme.controlSizes.icon} strokeWidth={theme.controlSizes.iconStroke} />
          ) : null}
        </Inline>
        </Pressable>
        {primaryAction !== undefined ? (
          <Button
            label={primaryAction.label}
            onPress={primaryAction.onPress}
          />
        ) : null}
      </Stack>
    </View>
  );
};

// ---- HouseholdSwitcher ----

interface HouseholdSwitcherProps {
  households: ListMyHouseholdsItemDto[];
  currentHouseholdId: string | null;
  onSelect: (id: string) => void;
  onCreateNew: () => void;
  visible: boolean;
  onClose: () => void;
  /** The household's own pages, listed under the households on a phone. */
  links?: Array<{ label: string; icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>; onPress: () => void }>;
}

/**
 * The household menu: every household to switch between, creating another
 * one, and the current household's own pages. A bottom sheet on phones, a
 * centered panel on Web.
 */
export const HouseholdSwitcher = forwardRef<View, HouseholdSwitcherProps>(
  ({ households, currentHouseholdId, onSelect, onCreateNew, visible, onClose, links = [] }, ref) => {
    const headingRef = useRef<View>(null);
    // The panel is pinned flush to the physical bottom edge (see the height:'75%'
    // comment below), which on Android puts the last row right under the
    // gesture-nav bar unless we pad for it explicitly.
    const insets = useSafeAreaInsets();

    const handleSelect = useCallback((id: string) => {
      onSelect(id);
      onClose();
    }, [onSelect, onClose]);

    // React Native Web keeps a closed Modal subtree in the DOM. Unmounting it
    // prevents duplicate hidden household labels from polluting navigation and
    // accessibility queries while the switcher is inactive.
    if (!visible) return null;

    const rowStyle = ({ pressed }: { pressed: boolean }) => ({
      alignItems: 'center' as const,
      backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surface,
      flexDirection: 'row' as const,
      gap: theme.spacing[3],
      minHeight: theme.controlSizes.touchTarget + theme.spacing[2],
      paddingHorizontal: theme.spacing[5],
    });
    const iconSlot = { alignItems: 'center' as const, justifyContent: 'center' as const, width: theme.controlSizes.avatar, height: theme.controlSizes.avatar };

    const content = (
      <View
        ref={ref}
        style={{
          backgroundColor: theme.colors.surface,
          borderTopLeftRadius: theme.borderRadii.xl,
          borderTopRightRadius: theme.borderRadii.xl,
          ...(Platform.OS === 'web' ? { borderRadius: theme.borderRadii.xl } : {}),
          // Native needs a definite (not max-only) height here: the header
          // above is intrinsically sized and the household ScrollView below
          // is flex:1, so without a concrete height to allocate, Yoga gives
          // the ScrollView 0px and only the header renders.
          ...(Platform.OS === 'web'
            ? { maxHeight: theme.layout.switcherMaxHeight }
            : { height: '75%' as unknown as number }),
          width: Platform.OS === 'web' ? theme.layout.switcherWidth : '100%',
          ...(Platform.OS === 'web'
            ? { boxShadow: theme.shadow.raised as string }
            : {}),
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'space-between',
            paddingLeft: theme.spacing[5],
            paddingRight: theme.spacing[2],
            paddingTop: theme.spacing[3],
            paddingBottom: theme.spacing[1],
          }}
        >
          <Heading ref={headingRef} variant="section" level={1}>切换家庭</Heading>
          <Pressable
            accessibilityLabel="关闭切换家庭"
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => ({
              alignItems: 'center',
              backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.transparent,
              borderRadius: theme.borderRadii.full,
              justifyContent: 'center',
              minHeight: theme.controlSizes.touchTarget,
              minWidth: theme.controlSizes.touchTarget,
            })}
          >
            <X color={theme.colors.inkMuted} size={theme.controlSizes.icon} strokeWidth={theme.controlSizes.iconStroke} />
          </Pressable>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: theme.spacing[3] + insets.bottom }}>
          {households.map((household) => {
            const current = household.id === currentHouseholdId;
            return (
              <Pressable
                accessibilityLabel={`${household.name}，${ROLE_LABELS[household.role] ?? household.role}`}
                accessibilityRole="button"
                accessibilityState={{ selected: current }}
                key={household.id}
                onPress={() => handleSelect(household.id)}
                style={rowStyle}
              >
                <View style={{ ...iconSlot, borderRadius: theme.borderRadii.sm, backgroundColor: current ? theme.colors.primary : theme.colors.surfaceMuted }}>
                  <Text variant="label" color={current ? 'surface' : 'inkMuted'}>{[...household.name.trim()][0] ?? '?'}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} variant="body" style={current ? { fontWeight: '600' } : undefined}>
                    {household.name}
                  </Text>
                  <Text variant="meta">
                    {ROLE_LABELS[household.role] ?? household.role} · {household.memberCount} 位成员
                  </Text>
                </View>
                {current ? (
                  <Check color={theme.colors.ink} size={theme.controlSizes.icon} strokeWidth={theme.focus.width} />
                ) : null}
              </Pressable>
            );
          })}
          <Pressable accessibilityRole="button" accessibilityLabel="创建家庭" onPress={() => { rememberRouteTrigger(); onCreateNew(); }} style={rowStyle}>
            <View style={iconSlot}>
              <HousePlus color={theme.colors.inkMuted} size={theme.controlSizes.icon} strokeWidth={theme.controlSizes.iconStroke} />
            </View>
            <Text variant="body" color="inkMuted">创建家庭</Text>
          </Pressable>
          {links.length > 0 ? (
            <View style={{ borderTopWidth: theme.borderWidths.default, borderTopColor: theme.colors.separator, marginTop: theme.spacing[2], paddingTop: theme.spacing[2] }}>
              {links.map(({ label, icon: LinkIcon, onPress }) => (
                <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} onPress={() => { onClose(); onPress(); }} style={rowStyle}>
                  <View style={iconSlot}>
                    <LinkIcon color={theme.colors.inkMuted} size={theme.controlSizes.icon} strokeWidth={theme.controlSizes.iconStroke} />
                  </View>
                  <Text variant="body" style={{ flex: 1 }}>{label}</Text>
                  <ChevronRight color={theme.colors.inkFaint} size={theme.controlSizes.icon} strokeWidth={theme.controlSizes.iconStroke} />
                </Pressable>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </View>
    );

    if (Platform.OS === 'web') {
      return (
        <Modal
          animationType="fade"
          onRequestClose={onClose}
          transparent
          visible={visible}
        >
          <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center', padding: theme.spacing[6] }}>
            <DialogBackdrop onPress={onClose} />
            {content}
          </View>
        </Modal>
      );
    }

    return (
      <Modal
        animationType="slide"
        onRequestClose={onClose}
        transparent
        visible={visible}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <DialogBackdrop onPress={onClose} />
          {content}
        </View>
      </Modal>
    );
  },
);

HouseholdSwitcher.displayName = 'HouseholdSwitcher';

// ---- AccessChangedPanel ----

interface AccessChangedPanelProps {
  householdName?: string;
  hasOtherHouseholds: boolean;
  onChooseOther: () => void;
  onCreateNew: () => void;
}

export const AccessChangedPanel = ({
  householdName,
  hasOtherHouseholds,
  onChooseOther,
  onCreateNew,
}: AccessChangedPanelProps) => (
  <View
    accessibilityLiveRegion="assertive"
    accessibilityRole="alert"
    style={{
      backgroundColor: theme.colors.destructiveSoft,
      borderRadius: theme.borderRadii.lg,
      padding: theme.spacing[6],
    }}
  >
    <Stack gap={4}>
      <TriangleAlert color={theme.colors.destructive} size={theme.spacing[6]} strokeWidth={theme.controlSizes.iconStroke} />
      <Heading>家庭访问权已变化</Heading>
      <Text>
        {householdName !== undefined
          ? `你已不能继续访问「${householdName}」。请选择其他家庭继续。`
          : '你的家庭访问权已发生变化。请选择其他家庭继续。'}
      </Text>
      {hasOtherHouseholds ? (
        <Button label="选择其他家庭" onPress={onChooseOther} />
      ) : (
        <Button label="设置家庭" onPress={onCreateNew} />
      )}
    </Stack>
  </View>
);

// ---- RoleBadge ----

const ROLE_LABELS: Record<string, string> = Object.freeze({
  OWNER: '所有者',
  ADMIN: '管理员',
  MEMBER: '成员',
});

interface RoleBadgeProps {
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
}

export const RoleBadge = ({ role }: RoleBadgeProps) => {
  const label = ROLE_LABELS[role] ?? role;
  const RoleIcon = role === 'OWNER' ? Crown : role === 'ADMIN' ? Shield : undefined;

  return (
    <View
      accessibilityLabel={`角色：${label}`}
      style={{
        alignItems: 'center',
        backgroundColor: theme.colors.surfaceMuted,
        borderRadius: theme.borderRadii.sm,
        flexDirection: 'row',
        gap: theme.spacing[1],
        paddingHorizontal: theme.spacing[2],
        paddingVertical: theme.spacing[1] / 2,
      }}
    >
      {RoleIcon !== undefined ? (
        <RoleIcon
          color={theme.colors.inkMuted}
          size={theme.controlSizes.icon - 4}
          strokeWidth={theme.controlSizes.iconStroke}
        />
      ) : null}
      <Text variant="bodySm">{label}</Text>
    </View>
  );
};

// ---- MemberRow ----

interface MemberRowProps {
  member: GetHouseholdMemberDto;
  /** Present when the actor may promote (target is MEMBER) or demote (target is ADMIN) this member. */
  roleAction?: 'promote' | 'demote';
  onRoleAction?: () => void;
  canRemoveMember?: boolean;
  onRemove?: () => void;
  /** Only ever true for the current owner acting on a non-self member. */
  canTransferTo?: boolean;
  onTransfer?: () => void;
}

/** One member: avatar, name and role, with the governance actions in a 「…」 menu. */
export const MemberRow = ({
  member,
  roleAction,
  onRoleAction,
  canRemoveMember = false,
  onRemove,
  canTransferTo = false,
  onTransfer,
}: MemberRowProps) => {
  const roleLabel = ROLE_LABELS[member.role] ?? member.role;
  const actions: CardAction[] = [];
  if (roleAction !== undefined && onRoleAction) {
    const promote = roleAction === 'promote';
    actions.push({ label: promote ? '提升为管理员' : '降级为成员', icon: promote ? CircleArrowUp : CircleArrowDown, accessibilityLabel: `${promote ? '提升' : '降级'} ${member.displayName}`, onPress: onRoleAction });
  }
  if (canTransferTo && onTransfer) actions.push({ label: '转移所有权', icon: Crown, accessibilityLabel: `转移所有权给 ${member.displayName}`, onPress: onTransfer });
  if (canRemoveMember && onRemove) actions.push({ label: '移除', icon: UserMinus, destructive: true, accessibilityLabel: `移除 ${member.displayName}`, onPress: onRemove });

  return (
    <View
      style={{
        alignItems: 'center',
        flexDirection: 'row',
        gap: theme.spacing[3],
        minHeight: theme.controlSizes.touchTarget + theme.spacing[4],
        paddingVertical: theme.spacing[2],
      }}
    >
      <View
        accessibilityLabel={`${member.displayName}，${roleLabel}${member.isCurrentUser ? '，本人' : ''}`}
        style={{ alignItems: 'center', flex: 1, flexDirection: 'row', gap: theme.spacing[3], minWidth: 0 }}
      >
        <MemberAvatar id={member.userId} name={member.displayName} size="lg" />

        {/* Name, username, role */}
        <Stack gap={1} style={{ flex: 1, minWidth: 0 }}>
          <Inline gap={2} style={{ alignItems: 'center' }}>
            <Text
              numberOfLines={1}
              style={{ flexShrink: 1 }}
              variant="body"
            >
              {member.displayName}
            </Text>
            {member.isCurrentUser ? (
              <Text
                style={{ fontWeight: '600' as const }}
                variant="bodySm"
              >
                我
              </Text>
            ) : null}
          </Inline>
          {/* The role sits under the name like an invitation's status, so the name keeps the width. */}
          <Inline gap={2} style={{ alignItems: 'center' }}>
            <RoleBadge role={member.role} />
            <Text
              numberOfLines={1}
              style={{ flexShrink: 1 }}
              variant="caption"
            >
              {member.username}
            </Text>
          </Inline>
        </Stack>
      </View>

      <CardActionsMenu subject={`成员：${member.displayName}`} actions={actions} />
    </View>
  );
};

// ---- InvitationRow ----

const INVITATION_STATUS_LABELS: Record<string, string> = Object.freeze({
  pending: '待接受',
  expired: '已过期',
  accepted: '已接受',
  revoked: '已撤销',
  declined: '已拒绝',
});

export interface InvitationRowProps {
  invitation: {
    id: string;
    username: string;
    status: 'pending' | 'expired' | 'accepted' | 'revoked' | 'declined';
    expiresAt: string;
    role: string;
    createdAt: string;
  };
  /** Whether the current user can manage invitations (owner/admin). */
  canManage: boolean;
  onResend?: (invitationId: string) => void;
  /** Receives the 「…」 trigger, so the confirmation can return focus to it. */
  onRevoke?: (invitationId: string, trigger: View | null) => void;
  resendBusy?: boolean;
}

/** One invitation: recipient, status and expiry, with resend and revoke in a 「…」 menu. */
export const InvitationRow = ({
  invitation,
  canManage,
  onResend,
  onRevoke,
  resendBusy = false,
}: InvitationRowProps) => {
  const recipient = invitation.username;
  const statusLabel = INVITATION_STATUS_LABELS[invitation.status] ?? invitation.status;
  const isPending = invitation.status === 'pending';
  const isExpired = invitation.status === 'expired';
  const actions: CardAction[] = [];
  if ((isPending || isExpired) && canManage && onResend) actions.push({ label: '重新发送', icon: RefreshCw, accessibilityLabel: `重新发送邀请给 ${recipient}`, onPress: () => onResend(invitation.id) });
  if (isPending && canManage && onRevoke) actions.push({ label: '撤销', icon: Ban, destructive: true, accessibilityLabel: `撤销邀请 ${recipient}`, onPress: trigger => onRevoke(invitation.id, trigger) });

  const expiresDate = new Date(invitation.expiresAt);
  const expiryText = formatDateTime(expiresDate);

  return (
    <View
      accessibilityLabel={`邀请：${recipient}，${statusLabel}`}
      style={{
        alignItems: 'center',
        flexDirection: 'row',
        gap: theme.spacing[3],
        minHeight: theme.controlSizes.touchTarget + theme.spacing[4],
        paddingVertical: theme.spacing[2],
      }}
    >
      {/* Recipient icon */}
      <View
        accessibilityLabel={`${recipient}的邀请`}
        accessibilityRole="image"
        style={{
          alignItems: 'center',
          backgroundColor: theme.colors.surfaceMuted,
          borderRadius: theme.borderRadii.full,
          height: theme.controlSizes.touchTarget,
          justifyContent: 'center',
          width: theme.controlSizes.touchTarget,
        }}
      >
        <Mail color={theme.colors.inkMuted} size={theme.controlSizes.icon} strokeWidth={theme.controlSizes.iconStroke} />
      </View>

      {/* Username, status, expiry */}
      <Stack gap={1} style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          variant="body"
        >
          {recipient}
        </Text>
        <Inline gap={2} style={{ flexWrap: 'wrap' }}>
          <View
            accessibilityLabel={`状态：${statusLabel}`}
            style={{
              alignItems: 'center',
              backgroundColor: theme.colors.surfaceMuted,
              borderRadius: theme.borderRadii.sm,
              flexDirection: 'row',
              gap: theme.spacing[1],
              paddingHorizontal: theme.spacing[2],
              paddingVertical: theme.spacing[1] / 2,
            }}
          >
            <Clock color={theme.colors.inkMuted} size={theme.controlSizes.icon - 4} strokeWidth={theme.controlSizes.iconStroke} />
            <Text variant="bodySm">{statusLabel}</Text>
          </View>
          <Text variant="caption">
            失效：{expiryText}
          </Text>
        </Inline>
      </Stack>

      {resendBusy ? (
        <View style={{ alignItems: 'center', justifyContent: 'center', minHeight: theme.controlSizes.touchTarget, minWidth: theme.controlSizes.touchTarget }}>
          <Spinner label="重新发送中" />
        </View>
      ) : (
        <CardActionsMenu subject={`邀请：${recipient}`} actions={actions} />
      )}
    </View>
  );
};

// ---- SwitchErrorBanner ----

interface SwitchErrorBannerProps {
  householdName: string;
  onRetry: () => void;
}

export const SwitchErrorBanner = ({ householdName, onRetry }: SwitchErrorBannerProps) => (
  <LoadError message={`暂时无法切换家庭。当前仍在「${householdName}」。`} onRetry={onRetry} />
);
