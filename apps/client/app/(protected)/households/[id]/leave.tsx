import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ApiClientError } from '@muchakucha/api-client';
import { sessionApiClient, sessionTransport } from '../../../../src/features/auth/session-runtime';
import { useHouseholdContext } from '../../../../src/features/households/household-context';
import { AppShell, FinalConfirmation } from '../../../../src/ui/household-components';
import { Banner } from '../../../../src/ui/primitives';

export default function LeaveHouseholdMembershipPage() {
  const { id, householdName = '此家庭' } = useLocalSearchParams<{ id: string; householdName?: string }>();
  const router = useRouter();
  const { enterAccessChanged } = useHouseholdContext();
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function leave() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setError('登录已过期，请重新登录。');
        return;
      }
      await sessionApiClient.leaveHouseholdMembership(token, id);
      enterAccessChanged(householdName, id);
      router.replace('/households');
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 404) {
        enterAccessChanged(householdName, id);
        router.replace('/households');
        return;
      }
      setError(err instanceof ApiClientError && err.status === 403
        ? '请先转让家庭所有权，再离开家庭。'
        : '离开家庭失败，请检查网络连接后重试。');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <AppShell accessibilityLabel="离开家庭确认" title="离开家庭">
      {error !== null ? <Banner title="离开失败">{error}</Banner> : null}
      <FinalConfirmation
        heading="确认离开家庭"
        body={`离开「${householdName}」后，你将无法访问这个家庭。共享日程、任务和笔记会保留在家庭中。重新加入需要家人邀请。`}
        safeActionLabel="取消离开"
        destructiveActionLabel="确认离开家庭"
        onSafeAction={() => router.back()}
        onDestructiveAction={() => { void leave(); }}
        busy={busy}
      />
    </AppShell>
  );
}
