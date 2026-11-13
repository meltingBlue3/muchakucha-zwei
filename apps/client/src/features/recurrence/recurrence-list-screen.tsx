import { useTranslation } from '../../i18n';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useResourceNavigation } from '../../ui/use-resource-navigation';
import { useOpenWindowItem } from '../../ui/route-window';
import { useDesktop } from '../../ui/use-desktop';
import { FilterOptions } from '../../ui/filter-options';
import { theme } from '../../ui/theme';
import { View } from 'react-native';
import { PageIntro } from '../../ui/page-intro';
import { useCallback, useRef, useState } from 'react';
import type { RecurrenceRuleListItemDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../auth/session-runtime';
import { useContentChanges } from '../content/content-changes';
import { useHouseholdContext } from '../households/household-context';
import { RecurrenceRuleRow } from '../recurrence/recurrence-rule-row';
import { HouseholdScreen } from '../households/household-screen';
import { ListGroup } from '../../ui/list-group';
import { EmptyState, LoadError, LoadingState, Stack, Text } from '../../ui/primitives';

function resolveDeviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

export default function RecurrenceRulesIndexRoute() {
  const { t } = useTranslation(['recurrence', 'auth', 'navigation']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const openResource = useResourceNavigation();
  const openRuleId = useOpenWindowItem('ruleId');
  const desktop = useDesktop();
  const [kind, setKind] = useState('all');
  const {
    currentHouseholdId,
  } = useHouseholdContext();

  const [rules, setRules] = useState<RecurrenceRuleListItemDto[]>([]);
  // A ref, not state: `fetchRules` must keep a stable identity, otherwise it
  // changes the moment the first load finishes and `useFocusEffect` fires a
  // second, pointless request on every arrival.
  const loadedHousehold = useRef<string | null>(null);
  const requestGeneration = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'auth:errors.sessionExpired' | 'list.loadError' | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const householdId = id ?? currentHouseholdId;
  const deviceTimeZone = resolveDeviceTimeZone();

  const fetchRules = useCallback(async () => {
    if (householdId === undefined || householdId === null || householdId === '') return;
    // Only the FIRST load shows the spinner. A focus refetch keeps the
    // previously loaded rules on screen, so returning from the detail screen
    // never flashes an empty list on the way to the same list.
    const request = ++requestGeneration.current;
    if (loadedHousehold.current !== householdId) { setLoading(true); setRules([]); }
    setError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (request !== requestGeneration.current) return;
      if (token === null) {
        setError('auth:errors.sessionExpired');
        return;
      }
      const result = await sessionApiClient.listRecurrenceRules(token, householdId);
      if (request !== requestGeneration.current) return;
      setRules(result.rules);
      loadedHousehold.current = householdId;
    } catch {
      // The stale list is deliberately left in place next to the error block:
      // losing what the user could already read is a worse failure mode than
      // showing it beside a retry.
      if (request === requestGeneration.current) setError('list.loadError');
    } finally {
      if (request === requestGeneration.current) setLoading(false);
    }
  }, [householdId]);

  // Refetch on every focus, not just on mount — after ending or editing a
  // rule in the detail screen the list must immediately reflect authoritative
  // server state rather than a locally guessed one.
  useFocusEffect(
    useCallback(() => {
      void fetchRules();
      return () => { requestGeneration.current++; };
    }, [fetchRules]),
  );

  // A rule saved or ended in the pane beside the list.
  useContentChanges(householdId, fetchRules);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchRules();
    setRefreshing(false);
  }, [fetchRules]);

  const handleOpenRule = useCallback((ruleId: string) => {
    if (householdId === undefined || householdId === '') return;
    openResource(
      `/households/${encodeURIComponent(householdId)}/recurrence-rules/${encodeURIComponent(ruleId)}`,
    );
  }, [householdId, openResource]);

  return (
    <HouseholdScreen active="recurrence-rules" subpage accessibilityLabel={t('navigation:pages.recurrence-rules')} width="reading" refreshing={refreshing} onRefresh={handleRefresh}>
      <Stack gap={desktop ? 0 : 5}>
        <PageIntro title={t('navigation:pages.recurrence-rules')} subtitle={desktop && !loading ? t('list.summary', { count: rules.length }) : t('list.intro')} controls={desktop ? <FilterOptions label={t('list.filter')} hideLabel value={kind} options={[{ value: 'all', label: t('filter.all'), name: t('list.all') }, { value: 'event', label: t('kind.event'), name: t('list.event') }, { value: 'task', label: t('kind.task'), name: t('list.task') }]} onChange={setKind} /> : undefined} />

        {loading && <LoadingState label={t('rule.loading')} />}

        {error !== null && <LoadError message={t(error)} onRetry={() => void fetchRules()} />}

        {!loading && error === null && rules.length === 0 && (
          <EmptyState message={t('list.empty')} />
        )}

        {/* Rendered in the order the server returned: unresolved rules first
            by next occurrence, ended rules after by title. Re-ordering here
            would put a second, drifting copy of that contract on the client. */}
        <ListGroup flush>
          {desktop ? <View style={{ flexDirection: 'row', alignItems: 'center', height: theme.layout.desktopControl + theme.spacing[1], paddingHorizontal: theme.spacing[6], gap: theme.spacing[4] }}><Text variant="caption" color="inkFaint" style={{ width: theme.layout.recurrenceKindColumn, fontWeight: '400' }}>{t('list.kind')}</Text><Text variant="caption" color="inkFaint" style={{ width: theme.layout.recurrenceTitleColumn, fontWeight: '400' }}>{t('list.name')}</Text><Text variant="caption" color="inkFaint" style={{ flex: 1, fontWeight: '400' }}>{t('list.rule')}</Text><Text variant="caption" color="inkFaint" style={{ width: theme.layout.recurrenceNextColumn, textAlign: 'right', fontWeight: '400' }}>{t('rule.next')}</Text></View> : null}
          {rules.filter(rule => !desktop || kind === 'all' || rule.kind === kind).map((rule) => (
            <RecurrenceRuleRow
              key={rule.id}
              rule={rule}
              selected={rule.id === openRuleId}
              deviceTimeZone={deviceTimeZone}
              onPress={() => handleOpenRule(rule.id)}
            />
          ))}
        </ListGroup>
      </Stack>
    </HouseholdScreen>
  );
}
