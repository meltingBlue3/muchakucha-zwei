import { formatDateTime } from '../../ui/date-values';
import type { GetHouseholdResponseDto, InboxInvitationDto, InvitationInboxResponseDto } from '@muchakucha/api-client';
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState } from 'react-native';
import type { InboxListProps, InboxMessage } from '../inbox/inbox-list';

interface InboxApi {
  listInvitationInbox(token: string, signal?: AbortSignal): Promise<InvitationInboxResponseDto>;
  acceptInvitation(token: string, body: { invitationId: string }): Promise<GetHouseholdResponseDto>;
  declineInvitation(token: string, body: { invitationId: string }): Promise<void>;
}

export function useInbox({ api, getAccessToken, onAccepted }: {
  api: InboxApi;
  getAccessToken(): string | null | Promise<string | null>;
  onAccepted(household: GetHouseholdResponseDto): Promise<void>;
}): InboxListProps {
  const [invitations, setInvitations] = useState<InboxInvitationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busyId, setBusyId] = useState<string>();
  const busy = useRef(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    if (busy.current) return;
    const current = ++generation.current;
    setLoading(true);
    setError(undefined);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Unauthenticated');
      const result = await api.listInvitationInbox(token);
      if (current === generation.current) setInvitations(result.invitations);
    } catch {
      if (current === generation.current) setError('暂时无法加载收件箱，请检查网络后重试。');
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [api, getAccessToken]);
  useFocusEffect(useCallback(() => {
    void load();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void load(); });
    return () => { generation.current++; subscription.remove(); };
  }, [load]));

  const respond = async (invitation: InboxInvitationDto, accept: boolean) => {
    if (busy.current) return;
    busy.current = true;
    setBusyId(invitation.id);
    setError(undefined);
    setNotice(undefined);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Unauthenticated');
      if (accept) {
        const household = await api.acceptInvitation(token, { invitationId: invitation.id });
        setInvitations(current => current.filter(item => item.id !== invitation.id));
        setNotice(`已加入「${household.name}」。`);
        try { await onAccepted(household); } catch { setError('你已加入家庭，请从“我的家庭”进入。'); }
      } else {
        await api.declineInvitation(token, { invitationId: invitation.id });
        setInvitations(current => current.filter(item => item.id !== invitation.id));
        setNotice(`已拒绝「${invitation.householdName}」的邀请。`);
      }
    } catch (failure) {
      const unavailable = typeof failure === 'object' && failure !== null && 'status' in failure && (failure.status === 409 || failure.status === 404);
      if (unavailable) setInvitations(current => current.filter(item => item.id !== invitation.id));
      setError(unavailable ? '这份邀请已处理、撤销或过期，已从列表移除。' : '这次没有完成，请检查网络后重试。');
    } finally { busy.current = false; setBusyId(undefined); }
  };

  const messages: InboxMessage[] = invitations.map(invitation => ({
    id: invitation.id,
    category: '家庭邀请',
    summary: `${invitation.inviterDisplayName}邀请你加入「${invitation.householdName}」`,
    createdAt: invitation.createdAt,
    details: [
      { label: '发送时间', value: formatDateTime(new Date(invitation.createdAt)) },
      { label: '状态', value: '待处理' },
      { label: '加入后的身份', value: '普通成员，可以查看和编辑家庭共享的日程、任务和笔记。' },
      { label: '有效期至', value: formatDateTime(new Date(invitation.expiresAt)) },
    ],
    actions: [
      { id: 'accept', label: '接受', accessibilityLabel: `接受「${invitation.householdName}」的邀请`, primary: true, run: () => respond(invitation, true) },
      { id: 'decline', label: '拒绝', accessibilityLabel: `拒绝「${invitation.householdName}」的邀请`, run: () => respond(invitation, false) },
    ],
  }));
  return { messages, loading, busy: busyId !== undefined, error, notice, reload: load };
}
