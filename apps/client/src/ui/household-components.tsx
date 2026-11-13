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
import ChevronsUpDown from 'lucide-react-native/icons/chevrons-up-down';
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

import { usePathname, useRouter } from 'expo-router';
import React, { forwardRef, useCallback, useRef, useState, type RefObject } from 'react';
import { AnchoredPopover } from './anchored-popover';
import { desktopDetailWidth, useDesktop } from './use-desktop';
import { layoutTransition } from './motion';
import { useSidebarRail } from './sidebar-rail';
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
  Chip,
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
import { PageHeaderContext, type PageHeader } from './page-intro';
import { ActionNotice, useActionNoticeDismissal, type ActionNoticeProps } from './action-notice';
import { formatDateTime } from './date-values';
import { CardActionsMenu, type CardAction } from './card-actions-menu';
import { useTranslation } from '../i18n';

// ---- AppShell ----

interface AppShellProps {
  detailOpen?: boolean;
  /** Use the desktop notes layout with the list beside its reading pane. */
  notesLayout?: boolean;
  /** The width a pane beside the page takes, when it is not the usual detail width. */
  paneWidth?: number | undefined;
  aside?: React.ReactNode;
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
  /** Off for a desktop page whose columns carry their own headers, such as the assistant. */
  pageHeader?: boolean;
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
  aside,
  detailOpen = false,
  notesLayout = false,
  paneWidth,
  pageHeader: showPageHeader = true,
}: AppShellProps) => {
  const { t } = useTranslation('shared');
  const router = useRouter();
  const blurTarget = useRef<View>(null);
  const noticeDismissal = useActionNoticeDismissal(notice);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const desktop = useDesktop();
  const pathname = usePathname();
  const [pageHeader, setPageHeader] = useState<PageHeader | null>(null);
  const resourceWindow = /\/(tasks|events|notes|recurrence-rules|birthdays)\/[^/]+(?:\/edit)?$/.test(pathname);
  const reserved = desktop && (resourceWindow || detailOpen) && !notesLayout ? paneWidth ?? desktopDetailWidth(width) : 0;
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
      <View testID={desktop ? 'desktop-workspace' : undefined} style={{ flex: 1, minWidth: 0, ...(desktop ? { backgroundColor: theme.colors.surface, margin: theme.layout.workspaceInset, marginLeft: wideNavigation ? 0 : theme.layout.workspaceInset, borderWidth: theme.borderWidths.default, borderColor: theme.colors.separator, borderRadius: theme.layout.workspaceRadius, overflow: 'hidden' } : {}) }}>
      {desktop && showPageHeader ? <View testID="desktop-page-header" style={{ height: theme.layout.pageHeaderHeight, flexDirection: 'row', alignItems: 'center', gap: theme.spacing[4], paddingHorizontal: theme.spacing[6], borderBottomWidth: theme.borderWidths.default, borderBottomColor: theme.colors.separator }}>
        {showBack && !wideNavigation ? <IconButton label={t('back')} appearance="plain" icon={<ArrowLeft size={theme.controlSizes.icon} color={theme.colors.ink} />} onPress={handleBack} /> : null}
        <Heading variant="section" level={1} numberOfLines={1}>{pageHeader?.title ?? accessibilityLabel ?? title ?? ''}</Heading>
        {pageHeader?.subtitle ? <View style={{ flexShrink: 1 }}>{typeof pageHeader.subtitle === 'string' ? <Text variant="meta" numberOfLines={1}>{pageHeader.subtitle}</Text> : pageHeader.subtitle}</View> : null}
        {pageHeader?.controls ? <View style={{ marginLeft: theme.spacing[2] }}>{pageHeader.controls}</View> : null}
        <View style={{ flex: 1 }} />
        {pageHeader?.action}
        {floatingAction}
        {showProfile && !wideNavigation ? <>{showInbox ? <InboxButton /> : null}<AccountMenu /></> : null}
      </View> : null}
      {hasNav && !desktop ? (
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
                accessibilityLabel={t('back')}
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
      <PageHeaderContext.Provider value={setPageHeader}>
      <KeyboardArea style={{ flex: 1, minHeight: 0, ...(desktop ? { marginRight: reserved, ...layoutTransition('margin-right'), ...(notesLayout ? { width: theme.layout.notesListWidth, flex: undefined, flexGrow: 1, borderRightWidth: theme.borderWidths.default, borderRightColor: theme.colors.separator } : {}) } : {}) }} windowOffset={insets.top}>
        {layout === 'workspace' ? children : <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: desktop ? theme.layout.desktopColumnInset : wideNavigation ? theme.spacing[10] : inset,
            paddingTop: desktop ? theme.spacing[4] : wideNavigation ? theme.spacing[8] : hasNav ? theme.spacing[1] : theme.spacing[6],
            paddingBottom: floatingAction && !desktopActions ? theme.spacing[16] + theme.spacing[10] : theme.spacing[10],
            maxWidth: desktop ? undefined : Platform.OS === 'web' ? (contentWidth === 'reading' ? theme.layout.contentMaxWidth : theme.layout.householdMaxWidth) + (wideNavigation ? theme.spacing[10] * 2 : 0) : undefined,
            alignSelf: desktop ? 'stretch' : Platform.OS === 'web' ? 'center' : undefined,
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
          {children}
        </ScrollView>}
        {floatingAction && !desktopActions ? <View pointerEvents="box-none" style={{ position: 'absolute', right: theme.layout.mobileInset, bottom: theme.spacing[4] }}>{floatingAction}</View> : null}
        {notice ? <View pointerEvents="box-none" style={{ position: 'absolute', top: theme.spacing[2], left: theme.layout.mobileInset, right: theme.layout.mobileInset, alignItems: 'center' }}><ActionNotice {...notice} onTouchCapture={noticeDismissal.noticeCapture} /></View> : null}
      </KeyboardArea>
      </PageHeaderContext.Provider>
      {desktop && aside ? <View style={{ position: 'absolute', top: theme.layout.pageHeaderHeight, bottom: 0, left: theme.layout.notesListWidth, right: 0, backgroundColor: theme.colors.surface }}>{aside}</View> : null}
      </View>
      {!wideNavigation ? footer : null}
    </SafeAreaView>
    </BlurTargetView>
    </DialogBackground.Provider>
  );
};

// ---- InboxButton ----

/**
 * The personal inbox, where invitations to other households arrive. `count`
 * is the number waiting, drawn as a small ink badge on the tray.
 */
export const InboxButton = ({ count = 0 }: { count?: number }) => {
  const { t } = useTranslation(['households', 'profile']);
  const router = useRouter();
  const desktop = useDesktop();
  return <View>
    <IconButton appearance="plain" label={count ? t('inboxPending', { count }) : t('profile:links.inbox.label')} icon={<Inbox color={theme.colors.inkMuted} size={desktop ? theme.controlSizes.icon - 2 : theme.controlSizes.icon} strokeWidth={theme.controlSizes.iconStroke} />} onPress={() => router.push('/inbox')} />
    {count ? <View pointerEvents="none" style={{ position: 'absolute', top: theme.spacing[1] / 2, right: 0, minWidth: theme.spacing[4] - 1, height: theme.spacing[4] - 1, paddingHorizontal: theme.spacing[1] - 1, borderRadius: theme.borderRadii.full, backgroundColor: theme.colors.ink, alignItems: 'center', justifyContent: 'center' }}><Text variant="caption" color="surface" style={{ fontSize: theme.typography.tag.fontSize - 1.5, lineHeight: theme.spacing[4] - 1, fontFamily: theme.fontFamilies.numericStrong }}>{count > 99 ? '99+' : count}</Text></View> : null}
  </View>;
};

// ---- HouseholdHeader ----

interface HouseholdHeaderProps {
  trigger?: RefObject<View | null>;
  householdName: string;
  onOpenSwitcher: () => void;
  /** `sidebar` is the larger form at the top of the wide-screen navigation. */
  placement?: 'bar' | 'sidebar';
}

/** The current household's name with a chevron; it opens the household menu. */
export const HouseholdHeader = ({ householdName, onOpenSwitcher, placement = 'bar', trigger }: HouseholdHeaderProps) => {
  const { t } = useTranslation('households');
  const desktop = useDesktop();
  const { rail } = useSidebarRail();
  return (
  <Pressable
    ref={trigger}
    accessibilityLabel={t('current', { householdName })}
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
      minHeight: desktop ? theme.layout.desktopControl + theme.spacing[2] : theme.controlSizes.touchTarget,
      paddingHorizontal: theme.spacing[2],
      ...(desktop ? { gap: theme.spacing[2] + 2, borderRadius: theme.borderRadii.sm } : {}),
    })}
  >
    {desktop ? <View style={{ width: theme.controlSizes.avatar, height: theme.controlSizes.avatar, backgroundColor: theme.colors.ink, borderRadius: theme.borderRadii.sm, alignItems: 'center', justifyContent: 'center' }}><Text variant="label" color="surface" style={{ fontSize: theme.typography.meta.fontSize }}>{householdName.slice(0, 1)}</Text></View> : null}
    {!rail ? <Text
      numberOfLines={1}
      variant={placement === 'sidebar' ? desktop ? 'label' : 'section' : 'label'}
      color={placement === 'sidebar' ? 'ink' : 'inkMuted'}
      style={[{ flexShrink: 1 }, desktop ? { fontSize: theme.typography.button.fontSize } : null]}
    >
      {householdName}
    </Text> : null}
    {!rail ? desktop ? <ChevronsUpDown color={theme.colors.inkFaint} size={theme.controlSizes.icon - 6} strokeWidth={theme.controlSizes.iconStroke} /> : <ChevronDown color={theme.colors.inkMuted} size={theme.controlSizes.icon - theme.spacing[1]} strokeWidth={theme.controlSizes.iconStroke} /> : null}
  </Pressable>
); };

// ---- HouseholdContextNote ----

interface HouseholdContextNoteProps {
  householdName: string;
}

export const HouseholdContextNote = ({ householdName }: HouseholdContextNoteProps) => {
  const { t } = useTranslation('households');
  return (
    <Inline gap={1}>
      <Building2 color={theme.colors.inkMuted} size={theme.controlSizes.icon} strokeWidth={theme.controlSizes.iconStroke} />
      <Text variant="bodySm">{t('saveTo', { householdName })}</Text>
    </Inline>
  );
};

// ---- HouseholdCard ----

interface HouseholdCardProps {
  household: ListMyHouseholdsItemDto;
  isCurrent?: boolean;
  onSelect?: (id: string) => void;
  primaryAction?: { label: string; onPress: () => void };
}

export const HouseholdCard = ({ household, isCurrent = false, onSelect, primaryAction }: HouseholdCardProps) => {
  const { t } = useTranslation('households');
  const roleText = t(`role.${household.role}`);
  const memberLabel = t('memberCount', { count: household.memberCount });

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
              accessibilityLabel={t('householdName', { name: household.name })}
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
  trigger?: RefObject<View | null>;
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
  ({ households, currentHouseholdId, onSelect, onCreateNew, visible, onClose, links = [], trigger }, ref) => {
    const { t } = useTranslation(['households', 'common']);
    const headingRef = useRef<View>(null);
    const desktop = useDesktop();
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
          width: desktop ? '100%' : Platform.OS === 'web' ? theme.layout.switcherWidth : '100%',
          ...(Platform.OS === 'web' && !desktop
            ? { boxShadow: theme.shadow.raised as string }
            : {}),
          overflow: 'hidden',
        }}
      >
        {!desktop ? <View
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
          <Heading ref={headingRef} variant="section" level={1}>{t('switch')}</Heading>
          <Pressable
            accessibilityLabel={t('common:close', { title: t('switch') })}
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
        </View> : null}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: theme.spacing[3] + insets.bottom }}>
          {households.map((household) => {
            const current = household.id === currentHouseholdId;
            const role = t(`role.${household.role}`);
            return (
              <Pressable
                accessibilityLabel={t('householdAndRole', { name: household.name, role })}
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
                    {role} · {t('memberCount', { count: household.memberCount })}
                  </Text>
                </View>
                {current ? (
                  <Check color={theme.colors.ink} size={theme.controlSizes.icon} strokeWidth={theme.focus.width} />
                ) : null}
              </Pressable>
            );
          })}
          <Pressable accessibilityRole="button" accessibilityLabel={t('create')} onPress={() => { rememberRouteTrigger(); onCreateNew(); }} style={rowStyle}>
            <View style={iconSlot}>
              <HousePlus color={theme.colors.inkMuted} size={theme.controlSizes.icon} strokeWidth={theme.controlSizes.iconStroke} />
            </View>
            <Text variant="body" color="inkMuted">{t('create')}</Text>
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

    if (desktop && trigger) return <AnchoredPopover title={t('switch')} trigger={trigger} onClose={onClose}>{content}</AnchoredPopover>;
    if (Platform.OS === 'web') {
      return (
        <Modal
          animationType="fade"
          onRequestClose={onClose}
          transparent
          aria-label={t('switch')}
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
}: AccessChangedPanelProps) => {
  const { t } = useTranslation('households');
  return (
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
        <Heading>{t('accessChanged')}</Heading>
        <Text>
          {householdName !== undefined
            ? t('accessLost', { householdName })
            : t('accessChangedDetail')}
        </Text>
        {hasOtherHouseholds ? (
          <Button label={t('chooseOther')} onPress={onChooseOther} />
        ) : (
          <Button label={t('setupAction')} onPress={onCreateNew} />
        )}
      </Stack>
    </View>
  );
};

// ---- RoleBadge ----

interface RoleBadgeProps {
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
}

export const RoleBadge = ({ role }: RoleBadgeProps) => {
  const { t } = useTranslation('households');
  const label = t(`role.${role}`);
  const RoleIcon = role === 'OWNER' ? Crown : role === 'ADMIN' ? Shield : undefined;

  return (
    <View
      accessibilityLabel={t('roleName', { role: label })}
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
  const { t } = useTranslation(['households', 'profile']);
  const desktop = useDesktop();
  const roleLabel = t(`role.${member.role}`);
  const name = member.displayName;
  const memberLabel = t(member.isCurrentUser ? 'currentMemberAndRole' : 'memberAndRole', { name, role: roleLabel });
  const subject = t('memberName', { name });
  const actions: CardAction[] = [];
  if (roleAction !== undefined && onRoleAction) {
    const promote = roleAction === 'promote';
    actions.push({ label: t(promote ? 'promote' : 'demote'), icon: promote ? CircleArrowUp : CircleArrowDown, accessibilityLabel: t(promote ? 'promoteName' : 'demoteName', { name }), onPress: onRoleAction });
  }
  if (canTransferTo && onTransfer) actions.push({ label: t('transfer'), icon: Crown, accessibilityLabel: t('transferTo', { name }), onPress: onTransfer });
  if (canRemoveMember && onRemove) actions.push({ label: t('remove'), icon: UserMinus, destructive: true, accessibilityLabel: t('removeMember', { name }), onPress: onRemove });
  if (desktop) return <View accessibilityLabel={memberLabel} style={{ minHeight: theme.layout.desktopRowHeight + theme.spacing[2], flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3] }}><View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3] }}><MemberAvatar id={member.userId} name={member.displayName} /><Text variant="bodySm" color="ink" numberOfLines={1} style={{ flexShrink: 1 }}>{member.displayName}</Text>{member.isCurrentUser ? <Chip>{t('profile:form.me')}</Chip> : null}</View><Text variant="meta" numberOfLines={1} style={{ width: theme.layout.memberUsernameColumn, fontFamily: theme.fontFamilies.numeric }}>{member.username}</Text><View style={{ width: theme.layout.memberRoleColumn, flexDirection: 'row', alignItems: 'center', gap: theme.spacing[1] }}>{member.role === 'OWNER' ? <Crown size={theme.controlSizes.icon - 6} color={theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} /> : member.role === 'ADMIN' ? <Shield size={theme.controlSizes.icon - 6} color={theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} /> : <View style={{ width: theme.controlSizes.icon - 6 }} />}<Text variant="meta" color="ink">{roleLabel}</Text></View>{/* The menu keeps its slot when it is empty, so every row's columns line up with the header. */}<View style={{ width: theme.layout.desktopControl, alignItems: 'center' }}><CardActionsMenu subject={subject} actions={actions} /></View></View>;

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
        accessibilityLabel={memberLabel}
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
                {t('profile:form.me')}
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

      <CardActionsMenu subject={subject} actions={actions} />
    </View>
  );
};

// ---- InvitationRow ----

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
  const { t } = useTranslation('households');
  const recipient = invitation.username;
  const statusLabel = t(`invitationStatus.${invitation.status}`);
  const isPending = invitation.status === 'pending';
  const isExpired = invitation.status === 'expired';
  const actions: CardAction[] = [];
  if ((isPending || isExpired) && canManage && onResend) actions.push({ label: t('resend'), icon: RefreshCw, accessibilityLabel: t('resendTo', { recipient }), onPress: () => onResend(invitation.id) });
  if (isPending && canManage && onRevoke) actions.push({ label: t('revoke'), icon: Ban, destructive: true, accessibilityLabel: t('revokeInvitation', { recipient }), onPress: trigger => onRevoke(invitation.id, trigger) });

  const expiresDate = new Date(invitation.expiresAt);
  const expiryText = formatDateTime(expiresDate);
  const desktop = useDesktop();
  if (desktop) return (
    <View accessibilityLabel={t('invitationWithStatus', { recipient, statusLabel })} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3], minHeight: theme.layout.desktopRowHeight + theme.spacing[4], paddingHorizontal: theme.spacing[1] }}>
      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3] }}>
        <View accessibilityLabel={t('invitationFor', { recipient })} accessibilityRole="image" style={{ width: theme.controlSizes.avatar + 4, height: theme.controlSizes.avatar + 4, borderRadius: theme.borderRadii.full, backgroundColor: theme.colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}><Mail color={theme.colors.inkMuted} size={theme.controlSizes.icon - 5} strokeWidth={theme.controlSizes.iconStroke} /></View>
        <Text variant="bodySm" color="ink" numberOfLines={1} style={{ flexShrink: 1 }}>{recipient}</Text>
      </View>
      <Text variant="meta" numberOfLines={1} style={{ width: theme.layout.memberUsernameColumn, fontFamily: theme.fontFamilies.numeric }}>{t('expires', { expiryText })}</Text>
      <View accessibilityLabel={t('status', { statusLabel })} style={{ width: theme.layout.memberRoleColumn, flexDirection: 'row', alignItems: 'center', gap: theme.spacing[1] }}><Clock color={theme.colors.inkMuted} size={theme.controlSizes.icon - 6} strokeWidth={theme.controlSizes.iconStroke} /><Text variant="meta" color="ink">{statusLabel}</Text></View>
      <View style={{ width: theme.layout.desktopControl, alignItems: 'center' }}>{resendBusy ? <Spinner label={t('resending')} /> : <CardActionsMenu subject={t('invitation', { recipient })} actions={actions} />}</View>
    </View>
  );

  return (
    <View
      accessibilityLabel={t('invitationWithStatus', { recipient, statusLabel })}
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
        accessibilityLabel={t('invitationFor', { recipient })}
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
            accessibilityLabel={t('status', { statusLabel })}
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
            {t('expiry', { expiryText })}
          </Text>
        </Inline>
      </Stack>

      {resendBusy ? (
        <View style={{ alignItems: 'center', justifyContent: 'center', minHeight: theme.controlSizes.touchTarget, minWidth: theme.controlSizes.touchTarget }}>
          <Spinner label={t('resending')} />
        </View>
      ) : (
        <CardActionsMenu subject={t('invitation', { recipient })} actions={actions} />
      )}
    </View>
  );
};

// ---- SwitchErrorBanner ----

interface SwitchErrorBannerProps {
  householdName: string;
  onRetry: () => void;
}

export const SwitchErrorBanner = ({ householdName, onRetry }: SwitchErrorBannerProps) => {
  const { t } = useTranslation('households');
  return <LoadError message={t('switchFailed', { householdName })} onRetry={onRetry} />;
};
