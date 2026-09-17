import type { GetHouseholdResponseDto, InvitationListItemDto } from '@muchakucha/api-client';
import { ApiClientError } from '@muchakucha/api-client';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { AppDialog } from '../../ui/app-dialog';
import House from 'lucide-react-native/icons/house';
import Users from 'lucide-react-native/icons/users';
import UserPlus from 'lucide-react-native/icons/user-plus';
import Mail from 'lucide-react-native/icons/mail';
import LogOut from 'lucide-react-native/icons/log-out';
import { SettingsSection } from '../../ui/settings-section';

import type { HouseholdApi } from './household-api';
import {
  canLeave,
  canRemove as canRemoveMember,
  canTransferOwnership,
  governanceAction,
  useMemberGovernance,
} from './member-governance';
import {
  AppShell,
  HouseholdHeader,
  InvitationRow,
  MemberRow,
} from '../../ui/household-components';
import {
  Banner,
  Button,
  Inline,
  Spinner,
  Stack,
  Text,
  TextField,
} from '../../ui/primitives';
import { theme } from '../../ui/theme';

const GENERIC_ERROR = '这次没有完成。请检查网络后重试。';
const PERMISSION_DENIED = '你没有重命名此家庭的权限。';
const RENAME_SUCCESS = '家庭名称已更新。';
const INVITE_ALREADY_MEMBER = '这个账户已经是该家庭的成员。';

export type HouseholdSettingsApi = Pick<HouseholdApi, 'getHousehold' | 'updateHousehold' | 'sendHouseholdInvitation' | 'listInvitations' | 'resendInvitation' | 'revokeInvitation'>;

export interface HouseholdSettingsDeps {
  householdApi: HouseholdSettingsApi;
  getAccessToken: () => string | null;
}

export interface HouseholdSettingsProps {
  householdId: string;
  householdName: string;
  onOpenSwitcher: () => void;
  deps: HouseholdSettingsDeps;
  /** When true, show the rename form above the member list. Default false. */
  showRename?: boolean;
  /** Called when membership loss is detected after a rename attempt. */
  onRenameAccessChanged?: (lostHouseholdName: string) => void;
  /** When true, show the invitation form. Only visible to owner/admin. Default false. */
  showInvite?: boolean;
  /** Called when membership loss is detected after an invitation attempt. */
  onInviteAccessChanged?: (lostHouseholdName: string) => void;
  /** Optional nav header props passed through to the internal AppShell. */
  navTitle?: string;
  navShowBack?: boolean;
  navShowProfile?: boolean;
}

type ViewState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: GetHouseholdResponseDto }
  | { kind: 'error'; message: string }
  | { kind: 'inconsistent'; message: string };

export function HouseholdSettings({
  householdId,
  householdName,
  onOpenSwitcher,
  deps,
  showRename = false,
  onRenameAccessChanged,
  showInvite = false,
  onInviteAccessChanged,
  navTitle,
  navShowBack = false,
  navShowProfile = false,
}: HouseholdSettingsProps) {
  const { width } = useWindowDimensions();
  const [activeForm, setActiveForm] = useState<'rename' | 'invite' | null>(null);
  const editTrigger = useRef<View>(null);
  const inviteTrigger = useRef<View>(null);
  const leaveTrigger = useRef<View>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [successorId, setSuccessorId] = useState<string | null>(null);
  const revokeTrigger = useRef<View>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);
  const revokePending = useRef(false);
  const [revokeError, setRevokeError] = useState<string>();
  const [viewState, setViewState] = useState<ViewState>({ kind: 'loading' });
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  // ---- Rename form state ----
  const [renameValue, setRenameValue] = useState('');
  const [renameSubmitting, setRenameSubmitting] = useState(false);
  const [renameSuccess, setRenameSuccess] = useState<string | undefined>(undefined);
  const [renameError, setRenameError] = useState<string | undefined>(undefined);

  // ---- Invitation form state ----
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteLink, setInviteLink] = useState<string | undefined>(undefined);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState<string | undefined>(undefined);
  const [inviteError, setInviteError] = useState<string | undefined>(undefined);

  // ---- Invitation list state ----
  const [invitationList, setInvitationList] = useState<InvitationListItemDto[]>([]);
  const [invitationListLoading, setInvitationListLoading] = useState(false);
  const [invitationListError, setInvitationListError] = useState<string | undefined>(undefined);
  const [resendingId, setResendingId] = useState<string | undefined>(undefined);

  // ---- Member governance ----
  // Hooks must run unconditionally (before the loading/error/inconsistent
  // early returns below), so actorRole falls back to 'MEMBER' — the most
  // restrictive role — until the roster has actually loaded.
  const currentMember = viewState.kind === 'ready'
    ? viewState.data.members.find((m) => m.isCurrentUser)
    : undefined;
  const actorRole = currentMember?.role ?? 'MEMBER';
  const actorIsOwner = viewState.kind === 'ready' && currentMember !== undefined
    ? currentMember.membershipId === viewState.data.ownerMembershipId
    : false;
  const governance = useMemberGovernance(householdId, actorRole, householdName);

  // Populate the rename input when data loads.
  const renameInitialized = useRef(false);

  useEffect(() => {
    if (viewState.kind === 'ready' && !renameInitialized.current) {
      setRenameValue(viewState.data.name);
      renameInitialized.current = true;
    }
  }, [viewState]);

  const handleRename = async () => {
    const trimmed = renameValue.trim().normalize('NFC');
    if (trimmed === '' || [...trimmed].length > 40) return;

    setRenameSubmitting(true);
    setRenameSuccess(undefined);
    setRenameError(undefined);

    const accessToken = deps.getAccessToken();
    if (accessToken === null) {
      setRenameError(GENERIC_ERROR);
      setRenameSubmitting(false);
      return;
    }

    try {
      const result = await deps.householdApi.updateHousehold(
        accessToken,
        householdId,
        { name: trimmed },
      );

      if (!mountedRef.current) return;

      // Replace header/form values only from the authoritative response.
      setViewState({ kind: 'ready', data: result });
      setRenameValue(result.name);
      setRenameSuccess(RENAME_SUCCESS);
    } catch (error: unknown) {
      if (!mountedRef.current) return;

      if (error instanceof ApiClientError) {
        if (error.status === 403) {
          // Still a member but not the current owner.
          setRenameError(PERMISSION_DENIED);
        } else if (error.status === 404) {
          // Membership may have been lost — signal the parent.
          if (onRenameAccessChanged !== undefined) {
            onRenameAccessChanged(householdName);
            setRenameSubmitting(false);
            return;
          }
          setRenameError(PERMISSION_DENIED);
        } else if (error.status === 401) {
          setRenameError(GENERIC_ERROR);
        } else {
          // Retain input on recoverable failure.
          setRenameError(GENERIC_ERROR);
        }
      } else {
        setRenameError(GENERIC_ERROR);
      }
    }

    setRenameSubmitting(false);
  };

  const handleInvite = async () => {
    const trimmed = inviteUsername.trim().normalize('NFC');
    if (trimmed === '' || [...trimmed].length > 64) return;

    setInviteSubmitting(true);
    setInviteSuccess(undefined);
    setInviteError(undefined);
    setInviteLink(undefined);

    const accessToken = deps.getAccessToken();
    if (accessToken === null) {
      setInviteError(GENERIC_ERROR);
      setInviteSubmitting(false);
      return;
    }

    try {
      const result = await deps.householdApi.sendHouseholdInvitation(
        accessToken,
        householdId,
        { username: trimmed },
      );

      if (!mountedRef.current) return;

      setInviteUsername('');
      setInviteSuccess(result.message);
      setInviteLink(result.invitationUrl);
      try {
        const list = await deps.householdApi.listInvitations(accessToken, householdId);
        if (mountedRef.current) setInvitationList(list.invitations);
      } catch {
        if (mountedRef.current) setInvitationListError(GENERIC_ERROR);
      }
    } catch (error: unknown) {
      if (!mountedRef.current) return;

      if (error instanceof ApiClientError) {
        const payload = error.body;
        const serverError = typeof payload === 'object' && payload !== null && 'error' in payload ? payload.error : undefined;
        if (typeof serverError === 'object' && serverError !== null && 'code' in serverError && serverError.code === 'INVITATION_USER_NOT_FOUND') {
          setInviteError('未找到这个用户名，请让家人先注册账户。');
        } else if (error.status === 409) {
          setInviteError(INVITE_ALREADY_MEMBER);
        } else if (error.status === 403) {
          setInviteError(PERMISSION_DENIED);
        } else if (error.status === 404) {
          if (onInviteAccessChanged !== undefined) {
            onInviteAccessChanged(householdName);
            setInviteSubmitting(false);
            return;
          }
          setInviteError(GENERIC_ERROR);
        } else if (error.status === 401) {
          setInviteError(GENERIC_ERROR);
        } else {
          setInviteError(GENERIC_ERROR);
        }
      } else {
        setInviteError(GENERIC_ERROR);
      }
    }

    setInviteSubmitting(false);
  };

  // Refetch whenever this screen regains focus (e.g. returning from a
  // role-change, removal, or ownership-transfer confirmation screen), not
  // just on first mount — otherwise the roster shows stale data after a
  // governance mutation elsewhere in the stack.
  useFocusEffect(
    useCallback(() => {
      mountedRef.current = true;
      const controller = new AbortController();
      abortRef.current = controller;

      const load = async () => {
        const accessToken = deps.getAccessToken();
        if (accessToken === null) {
          if (mountedRef.current) {
            setViewState({ kind: 'error', message: GENERIC_ERROR });
          }
          return;
        }

        try {
          const household = await deps.householdApi.getHousehold(
            accessToken,
            householdId,
            controller.signal,
          );
          if (!mountedRef.current) return;

          // Inconsistent state: no owner.
          if (household.members.length === 0 || household.ownerMembershipId === null) {
            setViewState({
              kind: 'inconsistent',
              message: '暂时无法显示成员。请刷新；如果问题持续，请稍后再试。',
            });
            return;
          }

          setViewState({ kind: 'ready', data: household });
        } catch (error: unknown) {
          if (!mountedRef.current) return;
          if (error instanceof Error && error.name === 'AbortError') return;
          setViewState({ kind: 'error', message: GENERIC_ERROR });
        }
      };

      void load();

      return () => {
        mountedRef.current = false;
        controller.abort();
      };
    }, [deps, householdId]),
  );

  // ---- Load invitation list when data is ready and showInvite is enabled ----
  useEffect(() => {
    if (!showInvite || viewState.kind !== 'ready') return;

    const loadInvitations = async () => {
      setInvitationListLoading(true);
      setInvitationListError(undefined);

      const accessToken = deps.getAccessToken();
      if (accessToken === null) {
        setInvitationListLoading(false);
        return;
      }

      try {
        const result = await deps.householdApi.listInvitations(accessToken, householdId);
        if (!mountedRef.current) return;
        setInvitationList(result.invitations);
      } catch {
        if (!mountedRef.current) return;
        setInvitationListError(GENERIC_ERROR);
      }

      setInvitationListLoading(false);
    };

    void loadInvitations();
  }, [showInvite, viewState.kind === 'ready' ? (viewState as { kind: 'ready'; data: GetHouseholdResponseDto }).data.members.length : 0, deps, householdId]);

  // ---- Resend handler ----
  const handleResend = async (invitationId: string) => {
    const accessToken = deps.getAccessToken();
    if (accessToken === null) return;

    setResendingId(invitationId);
    setInvitationListError(undefined);

    try {
      const resent = await deps.householdApi.resendInvitation(accessToken, householdId, invitationId);

      if (!mountedRef.current) return;
      setActiveForm('invite');
      setInviteLink(resent.invitationUrl);
      setInviteSuccess(resent.message);

      // Refetch the invitation list to get updated states.
      try {
        const result = await deps.householdApi.listInvitations(accessToken, householdId);
        if (!mountedRef.current) return;
        setInvitationList(result.invitations);
      } catch {
        if (!mountedRef.current) return;
      }
    } catch {
      if (!mountedRef.current) return;
      setInvitationListError(GENERIC_ERROR);
    }

    setResendingId(undefined);
  };

  const handleRevoke = (invitationId: string, trigger: View | null) => {
    revokeTrigger.current = trigger;
    setRevokeError(undefined);
    setRevokeId(invitationId);
  };

  const confirmRevoke = async () => {
    if (revokeId === null || revokePending.current) return;
    const accessToken = deps.getAccessToken();
    if (!accessToken) { setRevokeError(GENERIC_ERROR); return; }
    revokePending.current = true;
    setRevokeBusy(true);
    setRevokeError(undefined);
    try {
      await deps.householdApi.revokeInvitation(accessToken, householdId, revokeId);
      if (!mountedRef.current) return;
      setInvitationList((list) => list.map((item) => item.id === revokeId ? { ...item, status: 'revoked' } : item));
      // The revoked row loses its action; restore focus to the invitation entry.
      revokeTrigger.current = inviteTrigger.current;
      setRevokeId(null);
    } catch {
      if (mountedRef.current) setRevokeError('撤销失败，家庭邀请状态未改变。请重试。');
    } finally {
      revokePending.current = false;
      if (mountedRef.current) setRevokeBusy(false);
    }
  };

  if (viewState.kind === 'loading') {
    return (
      <AppShell accessibilityLabel="正在加载成员" title={navTitle} showBack={navShowBack} showProfile={navShowProfile}>
        <Stack gap={6}>
          <HouseholdHeader
            householdName={householdName}
            onOpenSwitcher={onOpenSwitcher}
          />
          <Stack gap={4} style={{ paddingTop: theme.spacing[4] }}>
            {[1, 2, 3].map((i) => (
              <Spinner key={i} label={`加载成员 ${i}`} />
            ))}
          </Stack>
        </Stack>
      </AppShell>
    );
  }

  if (viewState.kind === 'error') {
    return (
      <AppShell accessibilityLabel="成员加载失败" title={navTitle} showBack={navShowBack} showProfile={navShowProfile}>
        <Stack gap={6}>
          <HouseholdHeader
            householdName={householdName}
            onOpenSwitcher={onOpenSwitcher}
          />
          <Banner title="加载失败">{viewState.message}</Banner>
        </Stack>
      </AppShell>
    );
  }

  if (viewState.kind === 'inconsistent') {
    return (
      <AppShell accessibilityLabel="成员数据异常" title={navTitle} showBack={navShowBack} showProfile={navShowProfile}>
        <Stack gap={6}>
          <HouseholdHeader
            householdName={householdName}
            onOpenSwitcher={onOpenSwitcher}
          />
          <Banner title="数据异常">{viewState.message}</Banner>
        </Stack>
      </AppShell>
    );
  }

  const { data } = viewState;

  // Use authoritative household name from the response so rename updates the header.
  const authoritativeName = data.name;
  const canManage = actorRole === 'OWNER' || actorRole === 'ADMIN';
  const wide = width >= theme.layout.navigationBreakpoint;
  // Wide layouts move the invite entry into the overview column beside the rename action.
  const inviteInOverview = wide && showRename;
  const pendingInvitationCount = invitationList.filter((inv) => inv.status === 'pending').length;

  const otherMembers = data.members.filter((m) => !m.isCurrentUser);
  const leaveable = actorIsOwner && canLeave(actorRole, actorIsOwner, otherMembers.length) && governance.leave !== undefined;

  const editButton = actorIsOwner ? (
    <Pressable ref={editTrigger} accessibilityRole="button" accessibilityLabel="编辑家庭名称" onPress={() => { setRenameValue(authoritativeName); setRenameError(undefined); setRenameSuccess(undefined); setActiveForm('rename'); }} style={{ minHeight: theme.controlSizes.touchTarget, justifyContent: 'center', paddingHorizontal: theme.spacing[2] }}>
      <Text variant="label" color="coral">编辑</Text>
    </Pressable>
  ) : null;

  const leaveEntry = leaveable ? (
    <Pressable ref={leaveTrigger} accessibilityRole="button" accessibilityLabel="离开家庭" onPress={() => { setSuccessorId(null); setLeaveOpen(true); }} style={({ pressed }) => ({ minHeight: theme.controlSizes.touchTarget, flexDirection: 'row', gap: theme.spacing[2], alignItems: 'center', justifyContent: 'center', borderRadius: theme.borderRadii.lg, backgroundColor: pressed ? theme.colors.destructiveSoft : 'transparent' })}>
      <LogOut size={theme.controlSizes.icon} color={theme.colors.destructive} strokeWidth={theme.controlSizes.iconStroke} />
      <Text variant="label" color="destructive">离开家庭</Text>
    </Pressable>
  ) : null;

  const householdHeader = (
    <HouseholdHeader
      householdName={authoritativeName}
      onOpenSwitcher={onOpenSwitcher}
    />
  );

  return (
    <AppShell accessibilityLabel={`${authoritativeName}的成员`} title={navTitle} showBack={navShowBack} showProfile={navShowProfile}>
      <Stack gap={6}>
        {wide ? <View style={{ width: theme.layout.settingsNavWidth }}>{householdHeader}</View> : householdHeader}

        <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? theme.spacing[6] : theme.spacing[4], alignItems: wide ? 'flex-start' : 'stretch' }}>
        <Stack gap={4} style={{ width: wide ? theme.layout.settingsNavWidth : '100%' }}>
        {/* Rename form — only shown on the settings route */}
        {showRename ? (
          <SettingsSection title="基本信息" icon={<House size={theme.controlSizes.icon} color={theme.colors.coral} />}>
            {wide ? (
              <Stack gap={4}>
                <Stack gap={1}>
                  <Text variant="label">家庭名称</Text>
                  <Inline gap={2}>
                    <Text variant="section" style={{ flex: 1 }} numberOfLines={2}>{authoritativeName}</Text>
                    {editButton}
                  </Inline>
                </Stack>
                <Stack gap={0} style={{ borderTopWidth: theme.borderWidths.default, borderTopColor: theme.colors.separator, paddingTop: theme.spacing[2] }}>
                  <Inline gap={2} style={{ justifyContent: 'space-between', minHeight: theme.controlSizes.touchTarget }}>
                    <Text variant="bodySm" color="inkMuted">成员</Text>
                    <Text variant="label">{data.members.length} 位</Text>
                  </Inline>
                  {showInvite && canManage ? (
                    <Inline gap={2} style={{ justifyContent: 'space-between', minHeight: theme.controlSizes.touchTarget }}>
                      <Text variant="bodySm" color="inkMuted">待接受邀请</Text>
                      <Text variant="label">{invitationListLoading ? '—' : `${pendingInvitationCount} 个`}</Text>
                    </Inline>
                  ) : null}
                </Stack>
                {showInvite && canManage ? (
                  <Pressable ref={inviteTrigger} accessibilityRole="button" accessibilityLabel="邀请家人" onPress={() => setActiveForm('invite')} style={({ pressed }) => ({ minHeight: theme.controlSizes.primary, flexDirection: 'row', gap: theme.spacing[2], paddingHorizontal: theme.spacing[4], alignItems: 'center', justifyContent: 'center', borderRadius: theme.borderRadii.lg, backgroundColor: pressed ? theme.colors.coralPressed : theme.colors.coral })}>
                    <UserPlus size={theme.controlSizes.icon} color={theme.colors.surface} /><Text variant="button" color="surface">邀请家人</Text>
                  </Pressable>
                ) : null}
              </Stack>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2], minHeight: theme.controlSizes.touchTarget }}>
                <Text variant="label">家庭名称</Text>
                <Text style={{ flex: 1 }} numberOfLines={1}>{authoritativeName}</Text>
                {editButton}
              </View>
            )}
          </SettingsSection>
        ) : null}
        {wide ? leaveEntry : null}
        </Stack>
        <Stack gap={4} style={{ flex: wide ? 1 : undefined, width: wide ? undefined : '100%', minWidth: 0 }}>
        <SettingsSection title="成员" detail={`${data.members.length} 位成员`} icon={<Users size={theme.controlSizes.icon} color={theme.colors.teal} />} action={showInvite && canManage && !inviteInOverview ? (
          <Pressable ref={inviteTrigger} accessibilityRole="button" accessibilityLabel="邀请家人" onPress={() => setActiveForm('invite')} style={({ pressed }) => ({ minWidth: theme.controlSizes.touchTarget, minHeight: theme.controlSizes.touchTarget, flexDirection: 'row', gap: theme.spacing[2], paddingHorizontal: theme.spacing[2], alignItems: 'center', justifyContent: 'center', borderRadius: theme.borderRadii.md, backgroundColor: pressed ? theme.colors.tealSoft : theme.colors.surfaceSubtle })}>
            <UserPlus size={theme.controlSizes.icon} color={theme.colors.teal} /><Text variant="label" color="teal">邀请</Text>
          </Pressable>
        ) : null}>
        <Stack gap={0}>
          {data.members.map((member) => {
            const targetIsOwner = member.membershipId === data.ownerMembershipId;
            const action = governanceAction(actorRole, actorIsOwner, member.role, targetIsOwner, member.isCurrentUser);
            const removable = canRemoveMember(actorRole, member.role, targetIsOwner, member.isCurrentUser) && governance.remove !== undefined;
            const transferable = canTransferOwnership(actorRole, actorIsOwner, member.isCurrentUser) && governance.transfer !== undefined;

            const onRoleAction = action === 'promote'
              ? () => governance.promote?.(member.membershipId, member.displayName)
              : action === 'demote'
                ? () => governance.demote?.(member.membershipId, member.displayName)
                : () => undefined;

            return (
              <MemberRow
                key={member.membershipId}
                member={member}
                {...(action === 'none' ? {} : { roleAction: action })}
                onRoleAction={onRoleAction}
                canRemoveMember={removable}
                onRemove={() => governance.remove?.(member.membershipId, member.displayName, member.role)}
                canTransferTo={transferable}
                onTransfer={() => governance.transfer?.(member.membershipId, member.displayName)}
                labeledActions={wide}
              />
            );
          })}
        </Stack>
        </SettingsSection>

        {/* Invitation list — visible to owner/admin when showInvite is enabled */}
        {showInvite && canManage ? (
          <SettingsSection title="邀请" icon={<Mail size={theme.controlSizes.icon} color={theme.colors.coral} />}>

            {invitationListError !== undefined ? (
              <Banner title="邀请列表加载失败">{invitationListError}</Banner>
            ) : null}

            {invitationListLoading ? (
              <Stack gap={4} style={{ paddingVertical: theme.spacing[4] }}>
                {[1, 2].map((i) => (
                  <Spinner key={i} label={`加载邀请 ${i}`} />
                ))}
              </Stack>
            ) : invitationList.length === 0 ? (
              <Text variant="bodySm">还没有待处理的邀请。</Text>
            ) : (
              <Stack>
                {invitationList.map((inv) => (
                  <InvitationRow
                    key={inv.id}
                    invitation={inv}
                    canManage={canManage}
                    onResend={handleResend}
                    onRevoke={handleRevoke}
                    resendBusy={resendingId === inv.id}
                    labeledActions={wide}
                  />
                ))}
              </Stack>
            )}
          </SettingsSection>
        ) : null}
        {wide ? null : leaveEntry}
        </Stack>
        </View>
    </Stack>

      {leaveOpen && leaveable ? (
        <AppDialog title="离开家庭" busy={false} onClose={() => setLeaveOpen(false)} trigger={leaveTrigger}>
          <Stack gap={4}>
            <Text>离开前需要把所有权转让给另一位成员。请选择新的所有者：</Text>
            <View accessibilityRole="radiogroup" accessibilityLabel="新的所有者" style={{ gap: theme.spacing[2] }}>
              {otherMembers.map((member) => {
                const selected = successorId === member.membershipId;
                return (
                  <Pressable
                    key={member.membershipId}
                    accessibilityRole="radio"
                    accessibilityLabel={member.displayName}
                    accessibilityState={{ checked: selected }}
                    aria-checked={selected}
                    onPress={() => setSuccessorId(member.membershipId)}
                    style={({ pressed }) => ({ minHeight: theme.controlSizes.touchTarget, flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3], paddingHorizontal: theme.spacing[3], borderRadius: theme.borderRadii.md, borderWidth: theme.borderWidths.default, borderColor: selected ? theme.colors.coral : theme.colors.separator, backgroundColor: selected ? theme.colors.coralSoft : pressed ? theme.colors.surfaceMuted : theme.colors.surface })}
                  >
                    <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1}>{member.displayName}</Text>
                      <Text variant="caption" numberOfLines={1}>{member.username ?? member.email}</Text>
                    </Stack>
                    {selected ? <Text variant="label" color="coral">已选择</Text> : null}
                  </Pressable>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', gap: theme.spacing[3] }}>
              <Button label="取消" tone="secondary" onPress={() => setLeaveOpen(false)} style={{ flex: 1 }} />
              <Button
                label="下一步"
                disabled={successorId === null}
                onPress={() => {
                  const successor = otherMembers.find((m) => m.membershipId === successorId);
                  if (successor === undefined) return;
                  setLeaveOpen(false);
                  governance.leave?.(successor.membershipId, successor.displayName);
                }}
                style={{ flex: 1 }}
              />
            </View>
          </Stack>
        </AppDialog>
      ) : null}
      {revokeId !== null ? (
        <AppDialog title="撤销邀请？" busy={revokeBusy} onClose={() => setRevokeId(null)} trigger={revokeTrigger}>
          <Stack gap={4}>
            {revokeError ? <Banner title="撤销失败">{revokeError}</Banner> : null}
            <Text>撤销后，原链接将不能使用。</Text>
            <View style={{ flexDirection: 'row', gap: theme.spacing[3] }}>
              <Button label="保留邀请" tone="secondary" disabled={revokeBusy} onPress={() => setRevokeId(null)} style={{ flex: 1 }} />
              <Button label="撤销邀请" loading={revokeBusy} onPress={() => { void confirmRevoke(); }} style={{ flex: 1 }} />
            </View>
          </Stack>
        </AppDialog>
      ) : null}
      {activeForm === 'rename' && showRename ? (
        <AppDialog title="编辑家庭名称" busy={renameSubmitting} onClose={() => setActiveForm(null)} trigger={editTrigger}>
          <Stack gap={4}>

            {renameError !== undefined ? (
              <Banner title="重命名失败">{renameError}</Banner>
            ) : null}

            {renameSuccess !== undefined ? (
              <Stack
                accessibilityLiveRegion="polite"
                accessibilityRole={'status' as never}
                gap={1}
              >
                <Text>{renameSuccess}</Text>
              </Stack>
            ) : null}

            <Stack gap={2}>
              <TextField
                label="家庭名称"
                value={renameValue}
                onChangeText={(text) => {
                  setRenameValue(text);
                  setRenameError(undefined);
                  setRenameSuccess(undefined);
                }}
              />
              <Button
                disabled={
                  renameSubmitting ||
                  renameValue.trim().normalize('NFC') === '' ||
                  [...renameValue.trim().normalize('NFC')].length > 40
                }
                label="保存"
                loading={renameSubmitting}
                onPress={() => { void handleRename(); }}
              />
            </Stack>

          </Stack>
        </AppDialog>
      ) : null}
      {activeForm === 'invite' && showInvite && (actorRole === 'OWNER' || actorRole === 'ADMIN') ? (
        <AppDialog title="邀请家人" busy={inviteSubmitting || resendingId !== undefined} onClose={() => setActiveForm(null)} trigger={inviteTrigger}>
          <Stack gap={4}>

            {inviteError !== undefined ? (
              <Banner title="邀请失败">{inviteError}</Banner>
            ) : null}

            {inviteSuccess !== undefined ? (
              <Stack
                accessibilityLiveRegion="polite"
                accessibilityRole={'status' as never}
                gap={1}
              >
                <Text>{inviteSuccess}</Text>
                {inviteLink !== undefined ? (
                  <Text selectable accessibilityLabel="邀请链接" variant="bodySm">{inviteLink}</Text>
                ) : null}
              </Stack>
            ) : null}

            <Stack gap={2}>
              <TextField
                label="用户名"
                autoComplete="username"
                autoCapitalize="none"
                value={inviteUsername}
                onChangeText={(text) => {
                  setInviteUsername(text);
                  setInviteError(undefined);
                  setInviteSuccess(undefined);
                  setInviteLink(undefined);
                }}
              />
              <Text variant="bodySm">
                输入家人已注册的用户名，再将生成的邀请链接复制发给对方。
              </Text>
              <Button
                disabled={
                  inviteSubmitting ||
                  inviteUsername.trim().normalize('NFC') === '' ||
                  [...inviteUsername.trim().normalize('NFC')].length > 64
                }
                label="发送邀请"
                loading={inviteSubmitting}
                onPress={() => { void handleInvite(); }}
              />
            </Stack>

          </Stack>
        </AppDialog>
      ) : null}
    </AppShell>
  );
}
