import type { GetHouseholdResponseDto, InvitationListItemDto } from '@muchakucha/api-client';
import { ApiClientError } from '@muchakucha/api-client';
import { useEffect, useRef, useState } from 'react';

import type { HouseholdApi } from './household-api';
import {
  AppShell,
  HouseholdContextNote,
  HouseholdHeader,
  InvitationRow,
  MemberRow,
} from '../../ui/household-components';
import {
  Banner,
  Button,
  Heading,
  Spinner,
  Stack,
  Text,
  TextField,
} from '../../ui/primitives';
import { theme } from '../../ui/theme';

const GENERIC_ERROR = '这次没有完成。请检查网络后重试。';
const PERMISSION_DENIED = '你没有重命名此家庭的权限。';
const RENAME_SUCCESS = '家庭名称已更新。';
const INVITE_SUCCESS = '邀请已发送。';
const INVITE_ALREADY_MEMBER = '这个邮箱已经是该家庭的成员。';

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
  /** Called to navigate to the revoke confirmation page. */
  onRevokeNavigate?: (householdId: string, invitationId: string) => void;
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
  onRevokeNavigate,
  navTitle,
  navShowBack = false,
  navShowProfile = false,
}: HouseholdSettingsProps) {
  const [viewState, setViewState] = useState<ViewState>({ kind: 'loading' });
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  // ---- Rename form state ----
  const [renameValue, setRenameValue] = useState('');
  const [renameSubmitting, setRenameSubmitting] = useState(false);
  const [renameSuccess, setRenameSuccess] = useState<string | undefined>(undefined);
  const [renameError, setRenameError] = useState<string | undefined>(undefined);

  // ---- Invitation form state ----
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState<string | undefined>(undefined);
  const [inviteError, setInviteError] = useState<string | undefined>(undefined);

  // ---- Invitation list state ----
  const [invitationList, setInvitationList] = useState<InvitationListItemDto[]>([]);
  const [invitationListLoading, setInvitationListLoading] = useState(false);
  const [invitationListError, setInvitationListError] = useState<string | undefined>(undefined);
  const [resendingId, setResendingId] = useState<string | undefined>(undefined);

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
    const trimmed = inviteEmail.trim().normalize('NFC');
    if (trimmed === '' || !trimmed.includes('@')) return;

    setInviteSubmitting(true);
    setInviteSuccess(undefined);
    setInviteError(undefined);

    const accessToken = deps.getAccessToken();
    if (accessToken === null) {
      setInviteError(GENERIC_ERROR);
      setInviteSubmitting(false);
      return;
    }

    try {
      await deps.householdApi.sendHouseholdInvitation(
        accessToken,
        householdId,
        { email: trimmed },
      );

      if (!mountedRef.current) return;

      setInviteEmail('');
      setInviteSuccess(INVITE_SUCCESS);
    } catch (error: unknown) {
      if (!mountedRef.current) return;

      if (error instanceof ApiClientError) {
        if (error.status === 409) {
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

  useEffect(() => {
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
  }, [deps, householdId]);

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
      await deps.householdApi.resendInvitation(accessToken, householdId, invitationId);

      if (!mountedRef.current) return;

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

  // ---- Revoke handler (navigate to confirmation page) ----
  const handleRevoke = (invitationId: string) => {
    if (onRevokeNavigate !== undefined) {
      onRevokeNavigate(householdId, invitationId);
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

  return (
    <AppShell accessibilityLabel={`${authoritativeName}的成员`} title={navTitle} showBack={navShowBack} showProfile={navShowProfile}>
      <Stack gap={6}>
        <HouseholdHeader
          householdName={authoritativeName}
          onOpenSwitcher={onOpenSwitcher}
        />

        {/* Rename form — only shown on the settings route */}
        {showRename ? (
          <Stack gap={4}>
            <HouseholdContextNote householdName={authoritativeName} />

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
        ) : null}

        {/* Invitation form — only shown on the settings route for owner/admin */}
        {(() => {
          const currentMember = data.members.find((m) => m.isCurrentUser);
          const canInvite = currentMember !== undefined && (currentMember.role === 'OWNER' || currentMember.role === 'ADMIN');
          return showInvite && canInvite;
        })() ? (
          <Stack gap={4}>
            <HouseholdContextNote householdName={authoritativeName} />

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
              </Stack>
            ) : null}

            <Stack gap={2}>
              <TextField
                label="邮箱地址"
                keyboardType="email-address"
                autoComplete="email"
                value={inviteEmail}
                onChangeText={(text) => {
                  setInviteEmail(text);
                  setInviteError(undefined);
                  setInviteSuccess(undefined);
                }}
              />
              <Text variant="bodySm">
                对方可通过邮件登录或创建账户后接受邀请。
              </Text>
              <Button
                disabled={
                  inviteSubmitting ||
                  inviteEmail.trim().normalize('NFC') === '' ||
                  !inviteEmail.trim().normalize('NFC').includes('@')
                }
                label="发送邀请"
                loading={inviteSubmitting}
                onPress={() => { void handleInvite(); }}
              />
            </Stack>
          </Stack>
        ) : null}

        <Stack gap={2}>
          <Heading>成员</Heading>
          <Text variant="bodySm">
            {data.members.length} 位成员
          </Text>
        </Stack>

        <Stack>
          {data.members.map((member) => (
            <MemberRow key={member.membershipId} member={member} />
          ))}
        </Stack>

        {/* Invitation list — visible to owner/admin when showInvite is enabled */}
        {(() => {
          const currentMember = data.members.find((m) => m.isCurrentUser);
          const canManage = currentMember !== undefined && (currentMember.role === 'OWNER' || currentMember.role === 'ADMIN');
          if (!showInvite || !canManage) return null;

          return (
            <Stack gap={2}>
              <Heading>邀请</Heading>

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
                    />
                  ))}
                </Stack>
              )}
            </Stack>
          );
        })()}
    </Stack>
    </AppShell>
  );
}
