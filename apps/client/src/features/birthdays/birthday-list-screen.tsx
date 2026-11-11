import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import type { RecurrenceRuleListItemDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../auth/session-runtime';
import { useHouseholdContext } from '../households/household-context';
import { HouseholdScreen } from '../households/household-screen';
import { toDateIso } from '../events/calendar-utils';
import { rememberRouteTrigger } from '../../platform/overlays/route-trigger';
import { formatDate } from '../../ui/date-values';
import { ListGroup, ListRow, RowSlot } from '../../ui/list-group';
import { PageIntro } from '../../ui/page-intro';
import { Button, EmptyState, LoadError, LoadingState, Stack, Text } from '../../ui/primitives';
import { theme } from '../../ui/theme';
import { useOpenWindowItem } from '../../ui/route-window';
import { useResourceNavigation } from '../../ui/use-resource-navigation';
import { useMinuteClock } from '../../ui/use-minute-clock';
import { ageOn, birthdayDateOf } from './birthday-dates';

const LOAD_ERROR = '无法加载家人生日，请检查网络连接后重试。';
const DAY_MS = 86_400_000;

/** 今天, 明天, or 12 天后. */
function countdown(nextIso: string, todayIso: string): string {
  const days = Math.round((Date.parse(`${nextIso}T12:00:00Z`) - Date.parse(`${todayIso}T12:00:00Z`)) / DAY_MS);
  return days === 0 ? '今天' : days === 1 ? '明天' : `${days} 天后`;
}

function BirthdayRow({ rule, todayIso, selected, onPress }: { rule: RecurrenceRuleListItemDto; todayIso: string; selected: boolean; onPress(): void }) {
  const next = rule.nextOccurrenceDate!;
  const age = ageOn(rule, next);
  const when = formatDate(new Date(`${next}T12:00:00`), { weekday: true });
  const detail = rule.lunar ? `${birthdayDateOf(rule)} · ${when}` : `每年 ${birthdayDateOf(rule)} · ${when}`;
  const soon = countdown(next, todayIso);
  return (
    <ListRow
      accessibilityLabel={`${rule.title}，${detail}，${soon}${age === null ? '' : `，${age} 岁`}`}
      selected={selected}
      onPress={onPress}
      leading={<RowSlot width={theme.controlSizes.touchTarget}>
        <View style={{ width: theme.controlSizes.avatar, height: theme.controlSizes.avatar, borderRadius: theme.borderRadii.full, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceMuted }}>
          <Text variant="label" color="inkMuted">{rule.title.slice(0, 1)}</Text>
        </View>
      </RowSlot>}
      trailing={<View style={{ alignItems: 'flex-end' }}>
        <Text variant="bodySm" color={soon === '今天' ? 'accent' : 'ink'}>{soon}</Text>
        {age === null ? null : <Text variant="meta">{`${age} 岁`}</Text>}
      </View>}
    >
      <Text variant="body" numberOfLines={1}>{rule.title}</Text>
      <Text variant="meta" numberOfLines={1}>{detail}</Text>
    </ListRow>
  );
}

/**
 * 家人生日: every birthday series of the household, the soonest first, with
 * how long until it and the age it brings. A row opens its 重复安排, where the
 * date can be changed or the series ended.
 */
export default function BirthdayListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const openResource = useResourceNavigation();
  const openRuleId = useOpenWindowItem('ruleId');
  const { currentHouseholdId } = useHouseholdContext();
  const householdId = id ?? currentHouseholdId;
  const todayIso = toDateIso(useMinuteClock().date);
  const [birthdays, setBirthdays] = useState<RecurrenceRuleListItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      if (token === null) { setError('登录已过期，请重新登录。'); return; }
      const result = await sessionApiClient.listRecurrenceRules(token, householdId);
      if (request !== requestGeneration.current) return;
      // The server lists rules by their next occurrence; an ended series has none.
      setBirthdays(result.rules.filter(rule => rule.occasion === 'birthday' && rule.nextOccurrenceDate !== null));
      loadedHousehold.current = householdId;
    } catch {
      if (request === requestGeneration.current) setError(LOAD_ERROR);
    } finally {
      if (request === requestGeneration.current) setLoading(false);
    }
  }, [householdId]);

  useFocusEffect(useCallback(() => {
    void fetchBirthdays();
    return () => { requestGeneration.current++; };
  }, [fetchBirthdays]));

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

  const add = <Button label="添加生日" size="compact" tone="secondary" onPress={addBirthday} />;
  return (
    <HouseholdScreen active="birthdays" subpage accessibilityLabel="家人生日" width="reading" refreshing={refreshing} onRefresh={handleRefresh}>
      <Stack gap={5}>
        <PageIntro title="家人生日" subtitle="按下一次生日排列；农历生日每年都换算成当年的日期。" action={birthdays.length ? add : undefined} />
        {loading ? <LoadingState label="正在加载家人生日" /> : null}
        {error !== null ? <LoadError message={error} onRetry={() => void fetchBirthdays()} retryAccessibilityLabel="重试加载家人生日" /> : null}
        {!loading && error === null && birthdays.length === 0 ? (
          <EmptyState title="记下家人的生日" message="公历、农历都可以，每年会自动出现在日历里，到时提醒你。" action={<Button label="添加生日" onPress={addBirthday} />} />
        ) : null}
        {birthdays.length ? (
          <ListGroup>
            {birthdays.map(rule => (
              <BirthdayRow
                key={rule.id}
                rule={rule}
                todayIso={todayIso}
                selected={rule.id === openRuleId}
                onPress={() => openResource(`/households/${encodeURIComponent(householdId!)}/recurrence-rules/${encodeURIComponent(rule.id)}`)}
              />
            ))}
          </ListGroup>
        ) : null}
      </Stack>
    </HouseholdScreen>
  );
}
