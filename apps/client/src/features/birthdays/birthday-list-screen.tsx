import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import type { RecurrenceRuleListItemDto } from '@muchakucha/api-client';

import { i18n, useTranslation } from '../../i18n';
import { sessionApiClient, sessionTransport } from '../auth/session-runtime';
import { useContentChanges } from '../content/content-changes';
import { useHouseholdContext } from '../households/household-context';
import { HouseholdScreen } from '../households/household-screen';
import { toDateIso } from '../events/calendar-utils';
import { rememberRouteTrigger } from '../../platform/overlays/route-trigger';
import { formatDate } from '../../ui/date-values';
import { FloatingCreateButton } from '../../ui/floating-create-button';
import { ListGroup, ListRow } from '../../ui/list-group';
import { PageIntro } from '../../ui/page-intro';
import { EmptyState, LoadError, LoadingState, Stack, Text } from '../../ui/primitives';
import { theme } from '../../ui/theme';
import { useOpenWindowItem } from '../../ui/route-window';
import { useDesktop } from '../../ui/use-desktop';
import { useResourceNavigation } from '../../ui/use-resource-navigation';
import { useMinuteClock } from '../../ui/use-minute-clock';
import { ageOn, birthdayDateOf } from './birthday-dates';

const DAY_MS = 86_400_000;

function daysUntil(nextIso: string, todayIso: string): number {
  return Math.round((Date.parse(`${nextIso}T12:00:00Z`) - Date.parse(`${todayIso}T12:00:00Z`)) / DAY_MS);
}

/** 今天, 明天, or 12 天后. */
function countdown(days: number): string {
  return days === 0 ? i18n.t('birthdays:countdown.today') : days === 1 ? i18n.t('birthdays:countdown.tomorrow') : i18n.t('birthdays:countdown.days', { count: days });
}

/** The wide table's column titles, lined up with the text of the rows below. */
function BirthdayColumns() {
  const { t } = useTranslation('birthdays');
  const caption = (label: string, style: { flex: number } | { width: number; textAlign: 'right' }) => (
    <Text variant="caption" color="inkFaint" style={[style, { fontWeight: '400' }]}>{label}</Text>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[4], height: theme.layout.desktopControl + theme.spacing[1], paddingHorizontal: theme.spacing[5] }}>
      {caption(t('columns.name'), { flex: 1 })}
      {caption(t('columns.birthday'), { flex: 1 })}
      {caption(t('columns.age'), { width: theme.layout.birthdayAgeColumn, textAlign: 'right' })}
      {caption(t('columns.next'), { width: theme.layout.birthdayNextColumn, textAlign: 'right' })}
    </View>
  );
}

function BirthdayRow({ rule, todayIso, selected, desktop, onPress }: { rule: RecurrenceRuleListItemDto; todayIso: string; selected: boolean; desktop: boolean; onPress(): void }) {
  const { t } = useTranslation('birthdays');
  const next = rule.nextOccurrenceDate!;
  const years = ageOn(rule, next);
  const age = years === null ? null : t('age', { age: years });
  const date = rule.lunar ? birthdayDateOf(rule) : t('yearly', { date: birthdayDateOf(rule) });
  const when = formatDate(new Date(`${next}T12:00:00`), { weekday: true });
  const days = daysUntil(next, todayIso);
  const soon = countdown(days);
  const today = days === 0;
  const accessibilityLabel = age === null
    ? t('row', { title: rule.title, date, when, soon })
    : t('rowWithAge', { title: rule.title, date, when, soon, age });
  if (desktop) {
    return (
      <ListRow accessibilityLabel={accessibilityLabel} selected={selected} onPress={onPress}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[4] }}>
          <Text variant="bodySm" color="ink" numberOfLines={1} style={{ flex: 1 }}>{rule.title}</Text>
          <Text variant="meta" numberOfLines={1} style={{ flex: 1 }}>{date}</Text>
          <Text variant="time" color="inkMuted" numberOfLines={1} style={{ width: theme.layout.birthdayAgeColumn, textAlign: 'right' }}>{age ?? '—'}</Text>
          <Text variant="time" color={today ? 'accent' : 'inkMuted'} numberOfLines={1} style={{ width: theme.layout.birthdayNextColumn, textAlign: 'right' }}>{today ? soon : `${when} · ${soon}`}</Text>
        </View>
      </ListRow>
    );
  }
  return (
    <ListRow
      accessibilityLabel={accessibilityLabel}
      selected={selected}
      onPress={onPress}
      trailing={<View style={{ alignItems: 'flex-end' }}>
        <Text variant="bodySm" color={today ? 'accent' : 'ink'}>{soon}</Text>
        {age === null ? null : <Text variant="meta">{age}</Text>}
      </View>}
    >
      <Text variant="body" numberOfLines={1}>{rule.title}</Text>
      <Text variant="meta" numberOfLines={1}>{`${date} · ${when}`}</Text>
    </ListRow>
  );
}

/**
 * 家人生日: every birthday series of the household, the soonest first, with
 * how long until it and the age it brings. A row opens its 重复安排, where the
 * date can be changed or the series ended.
 */
export default function BirthdayListScreen() {
  const { t } = useTranslation(['birthdays', 'auth']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const openResource = useResourceNavigation();
  const openRuleId = useOpenWindowItem('ruleId');
  const desktop = useDesktop();
  const { currentHouseholdId } = useHouseholdContext();
  const householdId = id ?? currentHouseholdId;
  const todayIso = toDateIso(useMinuteClock().date);
  const [birthdays, setBirthdays] = useState<RecurrenceRuleListItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'auth:errors.sessionExpired' | 'list.loadError' | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const loadedHousehold = useRef<string | null>(null);
  const requestGeneration = useRef(0);

  const fetchBirthdays = useCallback(async () => {
    if (householdId === undefined || householdId === null || householdId === '') return;
    const request = ++requestGeneration.current;
    if (loadedHousehold.current !== householdId) { setLoading(true); setBirthdays([]); }
    setError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (request !== requestGeneration.current) return;
      if (token === null) { setError('auth:errors.sessionExpired'); return; }
      const result = await sessionApiClient.listRecurrenceRules(token, householdId);
      if (request !== requestGeneration.current) return;
      // The server lists rules by their next occurrence; an ended series has none.
      setBirthdays(result.rules.filter(rule => rule.occasion === 'birthday' && rule.nextOccurrenceDate !== null));
      loadedHousehold.current = householdId;
    } catch {
      if (request === requestGeneration.current) setError('list.loadError');
    } finally {
      if (request === requestGeneration.current) setLoading(false);
    }
  }, [householdId]);

  useFocusEffect(useCallback(() => {
    void fetchBirthdays();
    return () => { requestGeneration.current++; };
  }, [fetchBirthdays]));

  // A birthday's rule saved or ended in the pane beside the list.
  useContentChanges(householdId, fetchBirthdays);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchBirthdays();
    setRefreshing(false);
  }, [fetchBirthdays]);

  const addBirthday = useCallback(() => {
    if (!householdId) return;
    rememberRouteTrigger();
    router.push(`/households/${encodeURIComponent(householdId)}/birthdays/new`);
  }, [householdId, router]);

  const loaded = !loading && error === null;
  return (
    <HouseholdScreen active="birthdays" subpage accessibilityLabel={t('title')} width="reading" refreshing={refreshing} onRefresh={handleRefresh} floatingAction={<FloatingCreateButton label={t('add')} onPress={addBirthday} />}>
      <Stack gap={desktop ? 0 : 5}>
        <PageIntro title={t('title')} subtitle={desktop ? (loaded ? t('list.sortedCount', { count: birthdays.length }) : t('list.sorted')) : t('list.sortedDetail')} />
        {loading ? <LoadingState label={t('list.loading')} /> : null}
        {error !== null ? <LoadError message={t(error)} onRetry={() => void fetchBirthdays()} retryAccessibilityLabel={t('list.retryLoad')} /> : null}
        {loaded && birthdays.length === 0 ? (
          <EmptyState title={t('list.emptyTitle')} message={t('list.emptyMessage')} />
        ) : null}
        {birthdays.length ? (
          <ListGroup flush>
            {desktop ? <BirthdayColumns /> : null}
            {birthdays.map(rule => (
              <BirthdayRow
                key={rule.id}
                rule={rule}
                todayIso={todayIso}
                selected={rule.id === openRuleId}
                desktop={desktop}
                onPress={() => openResource(`/households/${encodeURIComponent(householdId!)}/recurrence-rules/${encodeURIComponent(rule.id)}`)}
              />
            ))}
          </ListGroup>
        ) : null}
      </Stack>
    </HouseholdScreen>
  );
}
