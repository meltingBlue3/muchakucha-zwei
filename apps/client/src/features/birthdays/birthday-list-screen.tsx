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

const LOAD_ERROR = '无法加载家人生日，请检查网络连接后重试。';
const DAY_MS = 86_400_000;

/** 今天, 明天, or 12 天后. */
function countdown(nextIso: string, todayIso: string): string {
  const days = Math.round((Date.parse(`${nextIso}T12:00:00Z`) - Date.parse(`${todayIso}T12:00:00Z`)) / DAY_MS);
  return days === 0 ? '今天' : days === 1 ? '明天' : `${days} 天后`;
}

/** The wide table's column titles, lined up with the text of the rows below. */
function BirthdayColumns() {
  const caption = (label: string, style: { flex: number } | { width: number; textAlign: 'right' }) => (
    <Text variant="caption" color="inkFaint" style={[style, { fontWeight: '400' }]}>{label}</Text>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[4], height: theme.layout.desktopControl + theme.spacing[1], paddingHorizontal: theme.spacing[5] }}>
      {caption('名称', { flex: 1 })}
      {caption('生日', { flex: 1 })}
      {caption('年龄', { width: theme.layout.birthdayAgeColumn, textAlign: 'right' })}
      {caption('下一次', { width: theme.layout.birthdayNextColumn, textAlign: 'right' })}
    </View>
  );
}

function BirthdayRow({ rule, todayIso, selected, desktop, onPress }: { rule: RecurrenceRuleListItemDto; todayIso: string; selected: boolean; desktop: boolean; onPress(): void }) {
  const next = rule.nextOccurrenceDate!;
  const age = ageOn(rule, next);
  const date = rule.lunar ? birthdayDateOf(rule) : `每年 ${birthdayDateOf(rule)}`;
  const when = formatDate(new Date(`${next}T12:00:00`), { weekday: true });
  const soon = countdown(next, todayIso);
  const today = soon === '今天';
  const accessibilityLabel = `${rule.title}，${date} · ${when}，${soon}${age === null ? '' : `，${age} 岁`}`;
  if (desktop) {
    return (
      <ListRow accessibilityLabel={accessibilityLabel} selected={selected} onPress={onPress}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[4] }}>
          <Text variant="bodySm" color="ink" numberOfLines={1} style={{ flex: 1 }}>{rule.title}</Text>
          <Text variant="meta" numberOfLines={1} style={{ flex: 1 }}>{date}</Text>
          <Text variant="time" color="inkMuted" numberOfLines={1} style={{ width: theme.layout.birthdayAgeColumn, textAlign: 'right' }}>{age === null ? '—' : `${age} 岁`}</Text>
          <Text variant="time" color={today ? 'accent' : 'inkMuted'} numberOfLines={1} style={{ width: theme.layout.birthdayNextColumn, textAlign: 'right' }}>{today ? '今天' : `${when} · ${soon}`}</Text>
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
        {age === null ? null : <Text variant="meta">{`${age} 岁`}</Text>}
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

  const loaded = !loading && error === null;
  return (
    <HouseholdScreen active="birthdays" subpage accessibilityLabel="家人生日" width="reading" refreshing={refreshing} onRefresh={handleRefresh} floatingAction={<FloatingCreateButton label="添加生日" onPress={addBirthday} />}>
      <Stack gap={desktop ? 0 : 5}>
        <PageIntro title="家人生日" subtitle={desktop ? `${loaded ? `${birthdays.length} 个 · ` : ''}按下一次生日排列` : '按下一次生日排列；农历生日每年都换算成当年的日期。'} />
        {loading ? <LoadingState label="正在加载家人生日" /> : null}
        {error !== null ? <LoadError message={error} onRetry={() => void fetchBirthdays()} retryAccessibilityLabel="重试加载家人生日" /> : null}
        {loaded && birthdays.length === 0 ? (
          <EmptyState title="记下家人的生日" message="公历、农历都可以，每年会自动出现在日历里，到时提醒你。" />
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
