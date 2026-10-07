import { rememberRouteTrigger } from '../../platform/overlays/route-trigger';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { PageIntro } from '../../ui/page-intro';
import { useCallback, useRef, useState } from 'react';
import type { RecurrenceRuleListItemDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../auth/session-runtime';
import { useHouseholdContext } from '../households/household-context';
import { RecurrenceRuleRow } from '../recurrence/recurrence-rule-row';
import { HouseholdScreen } from '../households/household-screen';
import { ListGroup } from '../../ui/list-group';
import { EmptyState, LoadError, LoadingState, Stack } from '../../ui/primitives';

const LOAD_ERROR = '无法加载重复安排，请检查网络连接后重试。';
// Straight quotes match the published sibling copy in `recurring-filter.ts`.
const EMPTY_COPY = '还没有重复安排。创建任务或日程时打开「重复」，它就会出现在这里。';

function resolveDeviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

export default function RecurrenceRulesIndexRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const {
    currentHouseholdId,
  } = useHouseholdContext();

  const [rules, setRules] = useState<RecurrenceRuleListItemDto[]>([]);
  // A ref, not state: `fetchRules` must keep a stable identity, otherwise it
  // changes the moment the first load finishes and `useFocusEffect` fires a
  // second, pointless request on every arrival.
  const loadedOnce = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const householdId = id ?? currentHouseholdId;
  const deviceTimeZone = resolveDeviceTimeZone();

  const fetchRules = useCallback(async () => {
    if (householdId === undefined || householdId === null || householdId === '') return;
    // Only the FIRST load shows the spinner. A focus refetch keeps the
    // previously loaded rules on screen, so returning from the detail screen
    // never flashes an empty list on the way to the same list.
    if (!loadedOnce.current) setLoading(true);
    setError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setError('登录已过期，请重新登录。');
        return;
      }
      const result = await sessionApiClient.listRecurrenceRules(token, householdId);
      setRules(result.rules);
      loadedOnce.current = true;
    } catch {
      // The stale list is deliberately left in place next to the error block:
      // losing what the user could already read is a worse failure mode than
      // showing it beside a retry.
      setError(LOAD_ERROR);
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  // Refetch on every focus, not just on mount — after ending or editing a
  // rule in the detail screen the list must immediately reflect authoritative
  // server state rather than a locally guessed one.
  useFocusEffect(
    useCallback(() => {
      void fetchRules();
    }, [fetchRules]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchRules();
    setRefreshing(false);
  }, [fetchRules]);

  const handleOpenRule = useCallback((ruleId: string) => {
    if (householdId === undefined || householdId === '') return;
    rememberRouteTrigger();
    void router.push(
      `/households/${encodeURIComponent(householdId)}/recurrence-rules/${encodeURIComponent(ruleId)}`,
    );
  }, [householdId, router]);

  return (
    <HouseholdScreen active="recurrence-rules" subpage accessibilityLabel="重复安排" width="reading" refreshing={refreshing} onRefresh={handleRefresh}>
      <Stack gap={5}>
        <PageIntro title="重复安排" subtitle="会自动重复的日程和任务，按下次发生的时间排列。" />

        {loading && <LoadingState label="正在加载重复安排" />}

        {error !== null && <LoadError message={error} onRetry={() => void fetchRules()} />}

        {!loading && error === null && rules.length === 0 && (
          <EmptyState message={EMPTY_COPY} />
        )}

        {/* Rendered in the order the server returned: unresolved rules first
            by next occurrence, ended rules after by title. Re-ordering here
            would put a second, drifting copy of that contract on the client. */}
        <ListGroup>
          {rules.map((rule) => (
            <RecurrenceRuleRow
              key={rule.id}
              rule={rule}
              deviceTimeZone={deviceTimeZone}
              onPress={() => handleOpenRule(rule.id)}
            />
          ))}
        </ListGroup>
      </Stack>
    </HouseholdScreen>
  );
}
