import { useTranslation } from '../../i18n';
import UserPlus from 'lucide-react-native/icons/user-plus';
import { useDesktop } from '../../ui/use-desktop';
import { rememberRouteTrigger } from '../../platform/overlays/route-trigger';
import type { GetHouseholdResponseDto, InvitationListItemDto } from '@muchakucha/api-client';
import { ApiClientError } from '@muchakucha/api-client';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { AppDialog } from '../../ui/app-dialog';
import House from 'lucide-react-native/icons/house';
import Users from 'lucide-react-native/icons/users';
import Mail from 'lucide-react-native/icons/mail';
import LogOut from 'lucide-react-native/icons/log-out';
import { SettingsRows, SettingsSection } from '../../ui/settings-section';
import { PageIntro } from '../../ui/page-intro';

import type { HouseholdApi } from './household-api';
import {
  canRemove as canRemoveMember,
  canTransferOwnership,
  governanceAction,
  useMemberGovernance,
} from './member-governance';
import {
  AppShell,
  InvitationRow,
  MemberRow,
} from '../../ui/household-components';
import { Banner, Button, ConfirmActions, EmptyState, Inline, LoadError, LoadingState, Stack, Text, TextField } from '../../ui/primitives';
import { theme } from '../../ui/theme';
import { focusFieldOnOpen } from '../../platform/keyboard/focus-on-open';

type RequestError = 'common:genericError';
type SettingsError = RequestError | 'settings.renamePermission' | 'settings.alreadyMember' | 'settings.userNotFound';

export type HouseholdSettingsApi = Pick<HouseholdApi, 'getHousehold' | 'updateHousehold' | 'sendHouseholdInvitation' | 'listInvitations' | 'resendInvitation' | 'revokeInvitation'>;

export interface HouseholdSettingsDeps {
  householdApi: HouseholdSettingsApi;
  getAccessToken: () => string | null;
}

export interface HouseholdSettingsProps {
  householdId: string;
  householdName: string;
  deps: HouseholdSettingsDeps;
  /** When true, show the rename form above the member list. Default false. */
  showRename?: boolean;
  /** Called when membership loss is detected after a rename attempt. */
  onRenameAccessChanged?: (lostHouseholdName: string) => void;
  /** Called with the name the server confirmed after a rename. */
  onRenamed?: (name: string) => void;
  /** When true, show the invitation form. Only visible to owner/admin. Default false. */
  showInvite?: boolean;
  /** Called when membership loss is detected after an invitation attempt. */
  onInviteAccessChanged?: (lostHouseholdName: string) => void;
  /** The page around the settings; a plain AppShell unless the route supplies its household frame. */
  frame?: (accessibilityLabel: string, content: ReactNode) => ReactNode;
}

type ViewState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: GetHouseholdResponseDto }
  | { kind: 'error'; message: RequestError }
  | { kind: 'inconsistent'; message: 'settings.inconsistentMembers' };

export function HouseholdSettings({
  householdId,
  householdName,
  deps,
  showRename = false,
  onRenameAccessChanged,
  onRenamed,
  showInvite = false,
  onInviteAccessChanged,
  frame = (accessibilityLabel, content) => <AppShell accessibilityLabel={accessibilityLabel}>{content}</AppShell>,
}: HouseholdSettingsProps) {
  const { t } = useTranslation(['households', 'common', 'profile', 'navigation']);
  const intro = (name: string) => <PageIntro title={t('navigation:pages.settings')} subtitle={name} />;
  const router = useRouter();
  const { width } = useWindowDimensions();
  const desktop = useDesktop();
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
  const [revokeError, setRevokeError] = useState<RequestError | 'governance.revokeError'>();
  const [viewState, setViewState] = useState<ViewState>({ kind: 'loading' });
  // Bumping an attempt re-runs its load; a failed load is otherwise a dead end.
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [invitationAttempt, setInvitationAttempt] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  // ---- Rename form state ----
  const [renameValue, setRenameValue] = useState('');
  const [renameSubmitting, setRenameSubmitting] = useState(false);
  const [renameSuccess, setRenameSuccess] = useState<'settings.renamed' | undefined>(undefined);
  const [renameError, setRenameError] = useState<SettingsError | undefined>(undefined);

  // ---- Invitation form state ----
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState<'settings.inviteSent' | 'settings.inviteResent' | undefined>(undefined);
  const [inviteError, setInviteError] = useState<SettingsError | undefined>(undefined);

  // ---- Invitation list state ----
  const [invitationList, setInvitationList] = useState<InvitationListItemDto[]>([]);
  const [invitationListLoading, setInvitationListLoading] = useState(false);
  const [invitationListError, setInvitationListError] = useState<RequestError | undefined>(undefined);
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
      setRenameError('common:genericError');
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
      setRenameSuccess('settings.renamed');
      onRenamed?.(result.name);
    } catch (error: unknown) {
      if (!mountedRef.current) return;

      if (error instanceof ApiClientError) {
        if (error.status === 403) {
          // Still a member but not the current owner.
          setRenameError('settings.renamePermission');
        } else if (error.status === 404) {
          // Membership may have been lost — signal the parent.
          if (onRenameAccessChanged !== undefined) {
            onRenameAccessChanged(householdName);
            setRenameSubmitting(false);
            return;
          }
          setRenameError('settings.renamePermission');
        } else if (error.status === 401) {
          setRenameError('common:genericError');
        } else {
          // Retain input on recoverable failure.
          setRenameError('common:genericError');
        }
      } else {
        setRenameError('common:genericError');
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

    const accessToken = deps.getAccessToken();
    if (accessToken === null) {
      setInviteError('common:genericError');
      setInviteSubmitting(false);
      return;
    }

    try {
      await deps.householdApi.sendHouseholdInvitation(
        accessToken,
        householdId,
        { username: trimmed },
      );

      if (!mountedRef.current) return;

      setInviteUsername('');
      setInviteSuccess('settings.inviteSent');
      try {
        const list = await deps.householdApi.listInvitations(accessToken, householdId);
        if (mountedRef.current) setInvitationList(list.invitations);
      } catch {
        if (mountedRef.current) setInvitationListError('common:genericError');
      }
    } catch (error: unknown) {
      if (!mountedRef.current) return;

      if (error instanceof ApiClientError) {
        const payload = error.body;
        const serverError = typeof payload === 'object' && payload !== null && 'error' in payload ? payload.error : undefined;
        if (typeof serverError === 'object' && serverError !== null && 'code' in serverError && serverError.code === 'INVITATION_USER_NOT_FOUND') {
          setInviteError('settings.userNotFound');
        } else if (error.status === 409) {
          setInviteError('settings.alreadyMember');
        } else if (error.status === 403) {
          setInviteError('settings.renamePermission');
        } else if (error.status === 404) {
          if (onInviteAccessChanged !== undefined) {
            onInviteAccessChanged(householdName);
            setInviteSubmitting(false);
            return;
          }
          setInviteError('common:genericError');
        } else if (error.status === 401) {
          setInviteError('common:genericError');
        } else {
          setInviteError('common:genericError');
        }
      } else {
        setInviteError('common:genericError');
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
            setViewState({ kind: 'error', message: 'common:genericError' });
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
              message: 'settings.inconsistentMembers',
            });
            return;
          }

          setViewState({ kind: 'ready', data: household });
        } catch (error: unknown) {
          if (!mountedRef.current) return;
          if (error instanceof Error && error.name === 'AbortError') return;
          setViewState({ kind: 'error', message: 'common:genericError' });
        }
      };

      void load();

      return () => {
        mountedRef.current = false;
        controller.abort();
      };
    }, [deps, householdId, loadAttempt]),
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
        setInvitationListError('common:genericError');
      }

      setInvitationListLoading(false);
    };

    void loadInvitations();
  }, [showInvite, viewState.kind === 'ready' ? (viewState as { kind: 'ready'; data: GetHouseholdResponseDto }).data.members.length : 0, deps, householdId, invitationAttempt]);

  // ---- Resend handler ----
  const handleResend = async (invitationId: string) => {
    const accessToken = deps.getAccessToken();
    if (accessToken === null) return;

    setResendingId(invitationId);
    setInvitationListError(undefined);

    try {
      await deps.householdApi.resendInvitation(accessToken, householdId, invitationId);

      if (!mountedRef.current) return;
      setActiveForm('invite');
      setInviteSuccess('settings.inviteResent');

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
      setInvitationListError('common:genericError');
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
    if (!accessToken) { setRevokeError('common:genericError'); return; }
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
      if (mountedRef.current) setRevokeError('governance.revokeError');
    } finally {
      revokePending.current = false;
      if (mountedRef.current) setRevokeBusy(false);
    }
  };

  if (viewState.kind === 'loading') {
    return (
      frame(t('settings.loadingMembers'), <Stack gap={6}>
        {intro(householdName)}
        <LoadingState label={t('settings.loadingMembers')} />
      </Stack>)
    );
  }

  if (viewState.kind === 'error') {
    return (
      frame(t('settings.loadMembersFailed'), <Stack gap={6}>
        {intro(householdName)}
        <LoadError message={t(viewState.message)} onRetry={() => { setViewState({ kind: 'loading' }); setLoadAttempt(value => value + 1); }} retryAccessibilityLabel={t('settings.retryMembers')} />
      </Stack>)
    );
  }

  if (viewState.kind === 'inconsistent') {
    return (
      frame(t('settings.invalidMembers'), <Stack gap={6}>
        {intro(householdName)}
        <LoadError message={t(viewState.message)} onRetry={() => { setViewState({ kind: 'loading' }); setLoadAttempt(value => value + 1); }} retryAccessibilityLabel={t('settings.retryMembers')} />
      </Stack>)
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
  const canTransferBeforeLeaving = actorIsOwner && otherMembers.length > 0 && governance.transfer !== undefined;

  const editButton = actorIsOwner ? (
    <Pressable ref={editTrigger} accessibilityRole="button" accessibilityLabel={t('settings.editName')} onPress={() => { setRenameValue(authoritativeName); setRenameError(undefined); setRenameSuccess(undefined); setActiveForm('rename'); }} style={{ minHeight: theme.controlSizes.touchTarget, justifyContent: 'center', paddingHorizontal: theme.spacing[2] }}>
      <Text variant="label" color="link">{t('common:edit')}</Text>
    </Pressable>
  ) : null;

  // One invite action in both layouts: the overview panel on wide screens, beside the 成员 title otherwise.
  const inviteButton = <Button ref={inviteTrigger} label={t('settings.invite')} tone={inviteInOverview ? 'primary' : 'secondary'} size={inviteInOverview ? 'regular' : 'compact'} {...(desktop ? { icon: (color: string) => <UserPlus size={theme.controlSizes.icon - 4} color={color} strokeWidth={theme.focus.width} /> } : {})} onPress={() => setActiveForm('invite')} />;
  // The desktop overview card: one fact per 40px row, the name with its 编辑 pill.
  const overviewRow = (key: 'name' | 'settings.yourRole' | 'settings.members' | 'invitationStatus.pending', value: ReactNode, trailing?: ReactNode) => <Inline key={key} gap={3} style={{ minHeight: theme.layout.desktopRowHeight, borderTopWidth: theme.borderWidths.default, borderTopColor: theme.colors.separator }}>
    <Text variant="meta" color="inkFaint" style={{ width: theme.layout.fieldLabelColumn }}>{t(key)}</Text>
    <Text variant="bodySm" color="ink" numberOfLines={1} style={{ flex: 1, fontWeight: key === 'name' ? '600' : '400' }}>{value}</Text>
    {trailing}
  </Inline>;
  const leaveEntry = !actorIsOwner || canTransferBeforeLeaving ? (
    <Pressable ref={leaveTrigger} accessibilityRole="button" accessibilityLabel={t('governance.leave')} onPress={() => {
      if (actorIsOwner) { setSuccessorId(null); setLeaveOpen(true); }
      else { rememberRouteTrigger(); router.push(`/households/${encodeURIComponent(householdId)}/leave?householdName=${encodeURIComponent(authoritativeName)}`); }
    }} style={({ pressed }) => desktop
      ? { minHeight: theme.layout.desktopControl, flexDirection: 'row', gap: theme.spacing[1] + 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing[3] + 2, borderRadius: theme.borderRadii.full, borderWidth: theme.borderWidths.default, borderColor: theme.colors.destructive, backgroundColor: pressed ? theme.colors.destructiveSoft : 'transparent' }
      : { minHeight: theme.controlSizes.touchTarget, flexDirection: 'row', gap: theme.spacing[2], alignItems: 'center', justifyContent: 'center', borderRadius: theme.borderRadii.lg, backgroundColor: pressed ? theme.colors.destructiveSoft : 'transparent' }}>
      <LogOut size={desktop ? theme.controlSizes.icon - 5 : theme.controlSizes.icon} color={theme.colors.destructive} strokeWidth={theme.controlSizes.iconStroke} />
      <Text variant="label" color="destructive">{t('governance.leave')}</Text>
    </Pressable>
  ) : null;

  return frame(t('settings.membersOf', { name: authoritativeName }), (<>
      <Stack gap={6}>
        {desktop ? <PageIntro title={t('navigation:pages.settings')} subtitle={authoritativeName} action={showInvite && canManage ? inviteButton : null} /> : intro(authoritativeName)}

        <View style={{ flexDirection: desktop ? 'row-reverse' : wide ? 'row' : 'column', gap: wide ? theme.spacing[6] : theme.spacing[4], alignItems: wide ? 'flex-start' : 'stretch' }}>
        <Stack gap={4} style={{ width: desktop ? theme.layout.assistantInspectorWidth : wide ? theme.layout.settingsNavWidth : '100%' }}>
        {/* Rename form — only shown on the settings route */}
        {showRename ? (
          <SettingsSection title={t('settings.overview')} icon={<House size={theme.controlSizes.icon} color={theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} />}>
            {desktop ? <View style={{ marginTop: theme.spacing[1] }}>
              {overviewRow('name', authoritativeName, actorIsOwner ? <Button ref={editTrigger} label={t('common:edit')} accessibilityLabel={t('settings.editName')} tone="secondary" size="compact" style={{ minHeight: theme.spacing[6] + 2, paddingHorizontal: theme.spacing[3] }} onPress={() => { setRenameValue(authoritativeName); setRenameError(undefined); setRenameSuccess(undefined); setActiveForm('rename'); }} /> : null)}
              {overviewRow('settings.yourRole', t(actorIsOwner ? 'role.OWNER' : actorRole === 'ADMIN' ? 'role.ADMIN' : 'role.MEMBER'))}
              {overviewRow('settings.members', t('settings.people', { count: data.members.length }))}
              {showInvite && canManage ? overviewRow('invitationStatus.pending', invitationListLoading ? '—' : t('settings.invitationCount', { count: pendingInvitationCount })) : null}
            </View> : wide ? (
              <Stack gap={4}>
                <Stack gap={1}>
                  <Text variant="label">{t('name')}</Text>
                  <Inline gap={2}>
                    <Text variant="section" style={{ flex: 1 }} numberOfLines={2}>{authoritativeName}</Text>
                    {editButton}
                  </Inline>
                </Stack>
                <Stack gap={0} style={{ borderTopWidth: theme.borderWidths.default, borderTopColor: theme.colors.separator, paddingTop: theme.spacing[2] }}>
                  <Inline gap={2} style={{ justifyContent: 'space-between', minHeight: theme.controlSizes.touchTarget }}>
                    <Text variant="bodySm" color="inkMuted">{t('settings.members')}</Text>
                    <Text variant="label">{t('settings.people', { count: data.members.length })}</Text>
                  </Inline>
                  {showInvite && canManage ? (
                    <Inline gap={2} style={{ justifyContent: 'space-between', minHeight: theme.controlSizes.touchTarget }}>
                      <Text variant="bodySm" color="inkMuted">{t('settings.pendingInvitations')}</Text>
                      <Text variant="label">{invitationListLoading ? '—' : t('settings.items', { count: pendingInvitationCount })}</Text>
                    </Inline>
                  ) : null}
                </Stack>
                {showInvite && canManage && !desktop ? inviteButton : null}
              </Stack>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2], minHeight: theme.controlSizes.touchTarget }}>
                <Text variant="label">{t('name')}</Text>
                <Text style={{ flex: 1 }} numberOfLines={1}>{authoritativeName}</Text>
                {editButton}
              </View>
            )}
          </SettingsSection>
        ) : null}
        {desktop && leaveEntry ? <SettingsSection title={t('governance.leave')} icon={null}>
          <Text variant="meta">{actorIsOwner ? t('settings.ownerLeaveDetail') : t('settings.memberLeaveDetail')}</Text>
          <View style={{ alignSelf: 'flex-start' }}>{leaveEntry}</View>
        </SettingsSection> : wide ? leaveEntry : null}
        </Stack>
        <Stack gap={4} style={{ flex: wide ? 1 : undefined, width: wide ? undefined : '100%', minWidth: 0 }}>
        <SettingsSection plain title={t('settings.members')} count={data.members.length} detail={t('memberCount', { count: data.members.length })} icon={<Users size={theme.controlSizes.icon} color={theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} />}
          action={showInvite && canManage && !inviteInOverview ? inviteButton : undefined}>
        {desktop ? <Inline gap={3} style={{ borderBottomWidth: theme.borderWidths.default, borderBottomColor: theme.colors.separator, paddingBottom: theme.spacing[2], paddingHorizontal: theme.spacing[1] }}><Text variant="caption" color="inkFaint" style={{ flex: 1, fontWeight: '400' }}>{t('settings.memberDisplayName')}</Text><Text variant="caption" color="inkFaint" style={{ width: theme.layout.memberUsernameColumn, fontWeight: '400' }}>{t('profile:username')}</Text><Text variant="caption" color="inkFaint" style={{ width: theme.layout.memberRoleColumn, fontWeight: '400' }}>{t('settings.memberRole')}</Text><View style={{ width: theme.layout.desktopControl }} /></Inline> : null}
        <SettingsRows>
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
              />
            );
          })}
        </SettingsRows>
        </SettingsSection>

        {/* Invitation list — visible to owner/admin when showInvite is enabled */}
        {showInvite && canManage ? (
          <SettingsSection plain title={t('settings.invitations')} {...(invitationListLoading ? {} : { count: invitationList.length })} icon={<Mail size={theme.controlSizes.icon} color={theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} />}>

            {invitationListError !== undefined ? (
              <LoadError message={t('settings.invitationListFailed', { detail: t(invitationListError) })} onRetry={() => setInvitationAttempt(value => value + 1)} retryAccessibilityLabel={t('settings.retryInvitations')} />
            ) : null}

            {invitationListLoading ? (
              <LoadingState label={t('settings.loadingInvitations')} />
            ) : invitationList.length === 0 ? (
              <EmptyState message={t('settings.noInvitations')} />
            ) : (
              <SettingsRows>
                {invitationList.map((inv) => (
                  <InvitationRow
                    key={inv.id}
                    invitation={inv}
                    canManage={canManage}
                    onResend={handleResend}
                    onRevoke={handleRevoke}
                    resendBusy={resendingId === inv.id}
                  />
                ))}
              </SettingsRows>
            )}
          </SettingsSection>
        ) : null}
        {wide ? null : leaveEntry}
        </Stack>
        </View>
    </Stack>

      {leaveOpen && canTransferBeforeLeaving ? (
        <AppDialog title={t('governance.leave')} busy={false} onClose={() => setLeaveOpen(false)} trigger={leaveTrigger}>
          <Stack gap={4}>
            <Text>{t('settings.chooseOwner')}</Text>
            <View accessibilityRole="radiogroup" accessibilityLabel={t('settings.newOwner')} style={{ gap: theme.spacing[2] }}>
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
                    style={({ pressed }) => ({ minHeight: theme.controlSizes.touchTarget, flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3], paddingHorizontal: theme.spacing[3], borderRadius: theme.borderRadii.md, borderWidth: theme.borderWidths.default, borderColor: selected ? theme.colors.primary : theme.colors.separator, backgroundColor: selected ? theme.colors.surfaceSelected : pressed ? theme.colors.surfaceMuted : theme.colors.surface })}
                  >
                    <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1}>{member.displayName}</Text>
                      <Text variant="caption" numberOfLines={1}>{member.username}</Text>
                    </Stack>
                    {selected ? <Text variant="label" color="ink">{t('settings.selected')}</Text> : null}
                  </Pressable>
                );
              })}
            </View>
            <ConfirmActions
              confirmLabel={t('settings.next')}
              confirmDisabled={successorId === null}
              onCancel={() => setLeaveOpen(false)}
              onConfirm={() => {
                const successor = otherMembers.find((m) => m.membershipId === successorId);
                if (successor === undefined) return;
                setLeaveOpen(false);
                governance.transfer?.(successor.membershipId, successor.displayName);
              }}
            />
          </Stack>
        </AppDialog>
      ) : null}
      {revokeId !== null ? (
        <AppDialog title={t('governance.revokeTitle')} busy={revokeBusy} onClose={() => setRevokeId(null)} trigger={revokeTrigger}>
          <Stack gap={4}>
            {revokeError ? <Banner title={t('governance.revokeFailed')}>{t(revokeError)}</Banner> : null}
            <Text>{t('governance.revokeDetail')}</Text>
            <ConfirmActions cancelLabel={t('governance.keepInvitation')} confirmLabel={t('governance.revokeAction')} destructive busy={revokeBusy} onCancel={() => setRevokeId(null)} onConfirm={() => { void confirmRevoke(); }} />
          </Stack>
        </AppDialog>
      ) : null}
      {activeForm === 'rename' && showRename ? (
        <AppDialog title={t('settings.editName')} busy={renameSubmitting} onClose={() => setActiveForm(null)} trigger={editTrigger}>
          <Stack gap={4}>

            {renameError !== undefined ? (
              <Banner title={t('settings.renameFailed')}>{t(renameError)}</Banner>
            ) : null}

            {renameSuccess !== undefined ? (
              <Stack
                accessibilityLiveRegion="polite"
                accessibilityRole={'status' as never}
                gap={1}
              >
                <Text>{t(renameSuccess)}</Text>
              </Stack>
            ) : null}

            <Stack gap={2}>
              <TextField
                label={t('name')}
                autoFocus={focusFieldOnOpen}
                returnKeyType="done"
                onSubmitEditing={() => { if (!renameSubmitting) void handleRename(); }}
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
                label={t('common:save')}
                loading={renameSubmitting}
                onPress={() => { void handleRename(); }}
              />
            </Stack>

          </Stack>
        </AppDialog>
      ) : null}
      {activeForm === 'invite' && showInvite && (actorRole === 'OWNER' || actorRole === 'ADMIN') ? (
        <AppDialog title={t('settings.invite')} busy={inviteSubmitting || resendingId !== undefined} onClose={() => setActiveForm(null)} trigger={inviteTrigger}>
          <Stack gap={4}>

            {inviteError !== undefined ? (
              <Banner title={t('settings.inviteFailed')}>{t(inviteError)}</Banner>
            ) : null}

            {inviteSuccess !== undefined ? (
              <Stack
                accessibilityLiveRegion="polite"
                accessibilityRole={'status' as never}
                gap={1}
              >
                <Text>{t(inviteSuccess)}</Text>
              </Stack>
            ) : null}

            <Stack gap={2}>
              <TextField
                label={t('profile:username')}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus={focusFieldOnOpen}
                returnKeyType="send"
                onSubmitEditing={() => { if (!inviteSubmitting) void handleInvite(); }}
                value={inviteUsername}
                onChangeText={(text) => {
                  setInviteUsername(text);
                  setInviteError(undefined);
                  setInviteSuccess(undefined);
                }}
              />
              <Text variant="bodySm">
                {t('settings.inviteDetail')}
              </Text>
              <Button
                disabled={
                  inviteSubmitting ||
                  inviteUsername.trim().normalize('NFC') === '' ||
                  [...inviteUsername.trim().normalize('NFC')].length > 64
                }
                label={t('settings.sendInvite')}
                loading={inviteSubmitting}
                onPress={() => { void handleInvite(); }}
              />
            </Stack>

          </Stack>
        </AppDialog>
      ) : null}
    </>));
}
