import { useTranslation } from '../../i18n';
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
  const { t } = useTranslation(['inbox', 'households']);
  const [invitations, setInvitations] = useState<InboxInvitationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'loadFailed' | 'joinedOpenFailed' | 'unavailable' | 'responseFailed'>();
  const [notice, setNotice] = useState<{ key: 'joined' | 'declined'; name: string }>();
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
      if (current === generation.current) setError('loadFailed');
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
        setNotice({ key: 'joined', name: household.name });
        try { await onAccepted(household); } catch { setError('joinedOpenFailed'); }
      } else {
        await api.declineInvitation(token, { invitationId: invitation.id });
        setInvitations(current => current.filter(item => item.id !== invitation.id));
        setNotice({ key: 'declined', name: invitation.householdName });
      }
    } catch (failure) {
      const unavailable = typeof failure === 'object' && failure !== null && 'status' in failure && (failure.status === 409 || failure.status === 404);
      if (unavailable) setInvitations(current => current.filter(item => item.id !== invitation.id));
      setError(unavailable ? 'unavailable' : 'responseFailed');
    } finally { busy.current = false; setBusyId(undefined); }
  };

  const messages: InboxMessage[] = invitations.map(invitation => ({
    id: invitation.id,
    category: t('category'),
    summary: t('summary', { inviter: invitation.inviterDisplayName, name: invitation.householdName }),
    createdAt: invitation.createdAt,
    details: [
      { label: t('sentAt'), value: formatDateTime(new Date(invitation.createdAt)) },
      { label: t('status'), value: t('households:invitationStatus.pending') },
      { label: t('roleAfterJoin'), value: t('memberDetail') },
      { label: t('expiresAt'), value: formatDateTime(new Date(invitation.expiresAt)) },
    ],
    actions: [
      { id: 'accept', label: t('accept'), accessibilityLabel: t('acceptName', { name: invitation.householdName }), primary: true, run: () => respond(invitation, true) },
      { id: 'decline', label: t('decline'), accessibilityLabel: t('declineName', { name: invitation.householdName }), run: () => respond(invitation, false) },
    ],
  }));
  return { messages, loading, busy: busyId !== undefined, error: error ? t(error) : undefined, notice: notice ? t(notice.key, { name: notice.name }) : undefined, reload: load };
}
