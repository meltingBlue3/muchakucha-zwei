import type { GetHouseholdMemberDto, ListMyHouseholdsItemDto } from '@muchakucha/api-client';
import Building2 from 'lucide-react-native/icons/building-2';
import X from 'lucide-react-native/icons/x';
import Check from 'lucide-react-native/icons/check';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import Crown from 'lucide-react-native/icons/crown';
import Shield from 'lucide-react-native/icons/shield';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';
import Clock from 'lucide-react-native/icons/clock';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import Ban from 'lucide-react-native/icons/ban';
import Mail from 'lucide-react-native/icons/mail';

import React, { forwardRef, useCallback, useRef } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Button,
  Heading,
  Inline,
  Spinner,
  Stack,
  Text,
} from './primitives';
import { theme } from './theme';

// ---- AppShell ----

interface AppShellProps {
  children: React.ReactNode;
  accessibilityLabel?: string;
  refreshing?: boolean;
  onRefresh?: () => void;
}

export const AppShell = ({ children, accessibilityLabel, refreshing = false, onRefresh }: AppShellProps) => (
  <SafeAreaView
    accessibilityLabel={accessibilityLabel}
    role={Platform.OS === 'web' ? 'main' : undefined}
    style={{ backgroundColor: theme.colors.canvas, flex: 1 }}
  >
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        paddingHorizontal: theme.layout.mobileInset,
        paddingVertical: theme.spacing[6],
        maxWidth: Platform.OS === 'web' ? theme.layout.householdMaxWidth : undefined,
        alignSelf: Platform.OS === 'web' ? 'center' : undefined,
        width: '100%',
      }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh !== undefined ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.colors.coral]}
            tintColor={theme.colors.coral}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  </SafeAreaView>
);

// ---- HouseholdHeader ----

interface HouseholdHeaderProps {
  householdName: string;
  onOpenSwitcher: () => void;
}

export const HouseholdHeader = ({ householdName, onOpenSwitcher }: HouseholdHeaderProps) => (
  <View
    accessibilityLabel={`当前家庭：${householdName}，切换家庭`}
    accessibilityRole="button"
    style={{
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: theme.controlSizes.touchTarget + 8,
      paddingVertical: theme.spacing[2],
    }}
  >
    <View style={{ flex: 1 }}>
      <Text variant="caption">当前家庭</Text>
      <Text
        numberOfLines={2}
        variant="body"
        style={{ fontWeight: '600' as const }}
      >
        {householdName}
      </Text>
    </View>
    <Pressable
      accessible={false}
      hitSlop={theme.spacing[2]}
      onPress={onOpenSwitcher}
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: theme.controlSizes.touchTarget,
        minWidth: theme.controlSizes.touchTarget,
      }}
    >
      <ChevronDown color={theme.colors.ink} size={theme.controlSizes.icon} strokeWidth={theme.controlSizes.iconStroke} />
    </Pressable>
  </View>
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
      borderColor: isCurrent ? theme.colors.coral : theme.colors.border,
      borderRadius: theme.borderRadii.lg,
      borderWidth: theme.borderWidths.default,
      overflow: 'hidden',
      padding: theme.spacing[4],
    }}>
      <Stack gap={2}>
        <Pressable
          accessibilityRole={onSelect !== undefined ? 'button' : 'none'}
          onPress={onSelect !== undefined ? () => onSelect(household.id) : undefined}
          style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
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
            <Check color={theme.colors.coral} size={theme.controlSizes.icon} strokeWidth={theme.controlSizes.iconStroke} />
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
}

export const HouseholdSwitcher = forwardRef<View, HouseholdSwitcherProps>(
  ({ households, currentHouseholdId, onSelect, onCreateNew, visible, onClose }, ref) => {
    const headingRef = useRef<View>(null);

    const handleSelect = useCallback((id: string) => {
      onSelect(id);
      onClose();
    }, [onSelect, onClose]);

    // React Native Web keeps a closed Modal subtree in the DOM. Unmounting it
    // prevents duplicate hidden household labels from polluting navigation and
    // accessibility queries while the switcher is inactive.
    if (!visible) return null;

    const content = (
      <View
        ref={ref}
        style={{
          backgroundColor: theme.colors.surface,
          borderRadius: Platform.OS === 'web' ? theme.borderRadii.lg : 0,
          maxHeight: Platform.OS === 'web'
            ? theme.layout.switcherMaxHeight
            : '75%' as unknown as number,
          width: Platform.OS === 'web' ? theme.layout.switcherWidth : '100%',
          ...(Platform.OS === 'web'
            ? { boxShadow: theme.elevation.softWeb as string }
            : {}),
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            alignItems: 'center',
            borderBottomColor: theme.colors.border,
            borderBottomWidth: theme.borderWidths.default,
            flexDirection: 'row',
            justifyContent: 'space-between',
            padding: theme.spacing[4],
          }}
        >
          <Heading ref={headingRef}>切换家庭</Heading>
          <Pressable
            accessibilityLabel="关闭切换家庭"
            onPress={onClose}
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: theme.controlSizes.touchTarget,
              minWidth: theme.controlSizes.touchTarget,
            }}
          >
            <X color={theme.colors.ink} size={theme.controlSizes.icon} strokeWidth={theme.controlSizes.iconStroke} />
          </Pressable>
        </View>
        <ScrollView style={{ flex: 1 }}>
          {households.map((household) => (
            <Pressable
              accessibilityLabel={`${household.name}，${household.role === 'ADMIN' ? '管理员' : '成员'}`}
              accessibilityRole="button"
              accessibilityState={{ selected: household.id === currentHouseholdId }}
              key={household.id}
              onPress={() => handleSelect(household.id)}
              style={({ pressed }) => ({
                alignItems: 'center',
                backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surface,
                flexDirection: 'row',
                justifyContent: 'space-between',
                minHeight: 72,
                paddingHorizontal: theme.spacing[4],
                paddingVertical: theme.spacing[2],
              })}
            >
              <Stack gap={1} style={{ flex: 1 }}>
                <Text numberOfLines={1} variant="body">
                  {household.name}
                </Text>
                <Inline gap={2}>
                  <Text variant="caption">
                    {household.role === 'ADMIN' ? '管理员' : '成员'}
                  </Text>
                  <Text variant="caption">
                    {household.memberCount} 位成员
                  </Text>
                </Inline>
              </Stack>
              {household.id === currentHouseholdId ? (
                <Check color={theme.colors.coral} size={theme.controlSizes.icon} strokeWidth={theme.controlSizes.iconStroke} />
              ) : null}
            </Pressable>
          ))}
          <View style={{ padding: theme.spacing[4] }}>
            <Button label="创建家庭" onPress={onCreateNew} />
          </View>
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
          <Pressable
            onPress={onClose}
            style={{
              alignItems: 'center',
              backgroundColor: theme.colors.overlay,
              flex: 1,
              justifyContent: 'center',
              padding: theme.spacing[6],
            }}
          >
            <Pressable onPress={() => undefined}>
              {content}
            </Pressable>
          </Pressable>
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
          <Pressable
            onPress={onClose}
            style={{
              backgroundColor: theme.colors.overlay,
              flex: 1,
            }}
          />
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
      borderColor: theme.colors.destructive,
      borderRadius: theme.borderRadii.lg,
      borderWidth: theme.borderWidths.default,
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
}

export const MemberRow = ({ member }: MemberRowProps) => {
  const roleLabel = ROLE_LABELS[member.role] ?? member.role;
  const avatarChar = [...member.displayName.trim().normalize('NFC')][0] ?? '?';

  return (
    <View
      accessibilityLabel={`${member.displayName}，${roleLabel}${member.isCurrentUser ? '，本人' : ''}`}
      style={{
        alignItems: 'center',
        borderBottomColor: theme.colors.border,
        borderBottomWidth: theme.borderWidths.default,
        flexDirection: 'row',
        gap: theme.spacing[3],
        minHeight: 72,
        paddingVertical: theme.spacing[2],
      }}
    >
      {/* Avatar placeholder */}
      <View
        accessibilityLabel={`${member.displayName}的头像`}
        style={{
          alignItems: 'center',
          backgroundColor: theme.colors.surfaceMuted,
          borderRadius: theme.borderRadii.full,
          height: theme.controlSizes.touchTarget,
          justifyContent: 'center',
          width: theme.controlSizes.touchTarget,
        }}
      >
        <Text
          style={{ fontWeight: '600' as const }}
          variant="body"
        >
          {avatarChar}
        </Text>
      </View>

      {/* Name, email, role */}
      <Stack gap={1} style={{ flex: 1 }}>
        <Inline gap={2} style={{ alignItems: 'center' }}>
          <Text
            numberOfLines={1}
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
        <Text
          numberOfLines={1}
          variant="caption"
        >
          {member.email}
        </Text>
      </Stack>

      <RoleBadge role={member.role} />
    </View>
  );
};

// ---- InvitationRow ----

const INVITATION_STATUS_LABELS: Record<string, string> = Object.freeze({
  pending: '待接受',
  expired: '已过期',
  accepted: '已接受',
  revoked: '已撤销',
});

export interface InvitationRowProps {
  invitation: {
    id: string;
    emailCanonical: string;
    status: 'pending' | 'expired' | 'accepted' | 'revoked';
    expiresAt: string;
    role: string;
    createdAt: string;
  };
  /** Whether the current user can manage invitations (owner/admin). */
  canManage: boolean;
  onResend?: (invitationId: string) => void;
  onRevoke?: (invitationId: string) => void;
  resendBusy?: boolean;
  revokeBusy?: boolean;
}

export const InvitationRow = ({
  invitation,
  canManage,
  onResend,
  onRevoke,
  resendBusy = false,
  revokeBusy = false,
}: InvitationRowProps) => {
  const statusLabel = INVITATION_STATUS_LABELS[invitation.status] ?? invitation.status;
  const isPending = invitation.status === 'pending';
  const isExpired = invitation.status === 'expired';
  const canResend = (isPending || isExpired) && canManage && onResend !== undefined;
  const canRevoke = isPending && canManage && onRevoke !== undefined;

  const expiresDate = new Date(invitation.expiresAt);
  const expiryText = expiresDate.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View
      accessibilityLabel={`邀请：${invitation.emailCanonical}，${statusLabel}`}
      style={{
        alignItems: 'center',
        borderBottomColor: theme.colors.border,
        borderBottomWidth: theme.borderWidths.default,
        flexDirection: 'row',
        gap: theme.spacing[3],
        minHeight: 72,
        paddingVertical: theme.spacing[2],
      }}
    >
      {/* Email icon placeholder */}
      <View
        accessibilityLabel={`${invitation.emailCanonical}的邀请`}
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

      {/* Email, status, expiry */}
      <Stack gap={1} style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          variant="body"
        >
          {invitation.emailCanonical}
        </Text>
        <Inline gap={2}>
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
          <Text variant="caption" numberOfLines={1}>
            失效：{expiryText}
          </Text>
        </Inline>
      </Stack>

      {/* Actions */}
      {canResend || canRevoke ? (
        <Inline gap={1}>
          {canResend ? (
            <Pressable
              accessibilityLabel={`重新发送邀请给 ${invitation.emailCanonical}`}
              accessibilityRole="button"
              disabled={resendBusy || revokeBusy}
              onPress={() => onResend?.(invitation.id)}
              style={({ pressed }) => ({
                alignItems: 'center',
                backgroundColor: pressed ? theme.colors.surfaceMuted : 'transparent',
                borderRadius: theme.borderRadii.md,
                justifyContent: 'center',
                minHeight: theme.controlSizes.touchTarget,
                minWidth: theme.controlSizes.touchTarget,
                opacity: resendBusy || revokeBusy ? 0.5 : 1,
              })}
            >
              {resendBusy ? (
                <Spinner label="重新发送中" />
              ) : (
                <RefreshCw color={theme.colors.ink} size={theme.controlSizes.icon} strokeWidth={theme.controlSizes.iconStroke} />
              )}
            </Pressable>
          ) : null}
          {canRevoke ? (
            <Pressable
              accessibilityLabel={`撤销邀请 ${invitation.emailCanonical}`}
              accessibilityRole="button"
              disabled={resendBusy || revokeBusy}
              onPress={() => onRevoke?.(invitation.id)}
              style={({ pressed }) => ({
                alignItems: 'center',
                backgroundColor: pressed ? theme.colors.surfaceMuted : 'transparent',
                borderRadius: theme.borderRadii.md,
                justifyContent: 'center',
                minHeight: theme.controlSizes.touchTarget,
                minWidth: theme.controlSizes.touchTarget,
                opacity: resendBusy || revokeBusy ? 0.5 : 1,
              })}
            >
              {revokeBusy ? (
                <Spinner label="撤销中" />
              ) : (
                <Ban color={theme.colors.destructive} size={theme.controlSizes.icon} strokeWidth={theme.controlSizes.iconStroke} />
              )}
            </Pressable>
          ) : null}
        </Inline>
      ) : null}
    </View>
  );
};

// ---- ConfirmationPage ----

export interface ConfirmationPageProps {
  heading: string;
  body: string;
  safeActionLabel: string;
  safeActionOnPress: () => void;
  destructiveActionLabel: string;
  destructiveActionOnPress: () => void;
  busy?: boolean;
}

export const ConfirmationPage = ({
  heading,
  body,
  safeActionLabel,
  safeActionOnPress,
  destructiveActionLabel,
  destructiveActionOnPress,
  busy = false,
}: ConfirmationPageProps) => (
  <View
    accessibilityLabel={heading}
    accessibilityLiveRegion="assertive"
    accessibilityRole="alert"
    style={{
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
      padding: theme.spacing[6],
    }}
  >
    <Stack gap={6} style={{ alignItems: 'stretch', maxWidth: 480, width: '100%' }}>
      <Stack gap={4}>
        <Heading>{heading}</Heading>
        <Text>{body}</Text>
      </Stack>
      <Stack gap={3}>
        <Button
          disabled={busy}
          label={safeActionLabel}
          onPress={safeActionOnPress}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={destructiveActionLabel}
          disabled={busy}
          onPress={destructiveActionOnPress}
          style={({ pressed }) => ({
            alignItems: 'center',
            backgroundColor: busy
              ? theme.colors.disabled
              : theme.colors.destructive,
            borderRadius: theme.borderRadii.lg,
            flexDirection: 'row',
            gap: theme.spacing[2],
            justifyContent: 'center',
            minHeight: theme.controlSizes.primary,
            minWidth: theme.controlSizes.touchTarget,
            opacity: busy ? 0.5 : pressed ? 0.85 : 1,
            paddingHorizontal: theme.spacing[4],
          })}
        >
          <Text variant="button">{destructiveActionLabel}</Text>
        </Pressable>
      </Stack>
    </Stack>
  </View>
);

// ---- FinalConfirmation (D-10 ownership transfer) ----

export interface FinalConfirmationProps {
  heading: string;
  body: string;
  safeActionLabel: string;
  destructiveActionLabel: string;
  onSafeAction: () => void;
  onDestructiveAction: () => void;
  busy?: boolean;
}

/**
 * D-10 three-stage final confirmation for ownership transfer.
 *
 * First stage: the caller renders a summary/consequence view.
 * Second stage (this component): a dedicated final confirmation
 * with safe-default focus and safe-first DOM ordering.
 *
 * The safe action is visually primary (top, no destructive styling),
 * the destructive action is second and styled as a destructive button.
 */
export const FinalConfirmation = ({
  heading,
  body,
  safeActionLabel,
  destructiveActionLabel,
  onSafeAction,
  onDestructiveAction,
  busy = false,
}: FinalConfirmationProps) => (
  <View
    accessibilityLabel={heading}
    accessibilityLiveRegion="assertive"
    accessibilityRole="alert"
    style={{
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
      padding: theme.spacing[6],
    }}
  >
    <Stack gap={6} style={{ alignItems: 'stretch', maxWidth: 480, width: '100%' }}>
      <Stack gap={4}>
        <Heading>{heading}</Heading>
        <Text>{body}</Text>
      </Stack>
      <Stack gap={3}>
        <Button
          disabled={busy}
          label={safeActionLabel}
          onPress={onSafeAction}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={destructiveActionLabel}
          disabled={busy}
          onPress={onDestructiveAction}
          style={({ pressed }) => ({
            alignItems: 'center',
            backgroundColor: busy
              ? theme.colors.disabled
              : theme.colors.destructive,
            borderRadius: theme.borderRadii.lg,
            flexDirection: 'row',
            gap: theme.spacing[2],
            justifyContent: 'center',
            minHeight: theme.controlSizes.primary,
            minWidth: theme.controlSizes.touchTarget,
            opacity: busy ? 0.5 : pressed ? 0.85 : 1,
            paddingHorizontal: theme.spacing[4],
          })}
        >
          <Text variant="button">{destructiveActionLabel}</Text>
        </Pressable>
      </Stack>
    </Stack>
  </View>
);

// ---- SwitchErrorBanner ----

interface SwitchErrorBannerProps {
  householdName: string;
  onRetry: () => void;
}

export const SwitchErrorBanner = ({ householdName, onRetry }: SwitchErrorBannerProps) => (
  <View
    accessibilityLiveRegion="polite"
    style={{
      backgroundColor: theme.colors.surfaceMuted,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadii.md,
      borderWidth: theme.borderWidths.default,
      padding: theme.spacing[4],
    }}
  >
    <Stack gap={2}>
      <Text variant="bodySm">
        暂时无法切换家庭。当前仍在「{householdName}」。
      </Text>
      <Button label="重试" onPress={onRetry} />
    </Stack>
  </View>
);
