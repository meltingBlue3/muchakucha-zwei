import { FloatingCreateButton } from '../../ui/floating-create-button';
import { useContentDelete } from '../content/use-content-delete';
import { rememberRouteTrigger } from '../../platform/overlays/route-trigger';
import { AppDialog } from '../../ui/app-dialog';
import { FilterOptions } from '../../ui/filter-options';
import { PageIntro } from '../../ui/page-intro';
import { formatDate } from '../../ui/date-values';
import { useWorkspaceState } from '../../ui/workspace-state';
import { HouseholdNavigation } from '../../ui/household-navigation';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { EventResponseDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../auth/session-runtime';
import { useHouseholdContext } from '../households/household-context';
import { CalendarMonth } from './calendar-month';
import { EventCard } from './event-card';
import { toDateIso, toDateRangeIso } from './calendar-utils';
import {
  applyRecurringFilter,
  RECURRING_EMPTY_EVENTS,
  RECURRING_FILTERS,
  recurringFilterAccessibilityLabel,
  type RecurringFilterKey,
} from '../recurrence/recurring-filter';
import {
  AccessChangedPanel,
  AppShell,
  HouseholdHeader,
  HouseholdSwitcher,
} from '../../ui/household-components';
import { Button, EmptyState, LoadError, LoadingState, Stack, Text } from '../../ui/primitives';
import type { Theme } from '../../ui/theme';

export default function CalendarScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const deleteEvent = useContentDelete('events');
  const activeTheme = useTheme<Theme>();
  const { width } = useWindowDimensions();
  const wide = width >= activeTheme.layout.navigationBreakpoint;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterTrigger = useRef<View>(null);
  const loadedMonth = useRef('');
  const requestGeneration = useRef(0);
  const {
    viewState,
    households,
    currentHouseholdId,
    accessChangedHouseholdName,
    refreshHouseholds,
    switchHousehold,
  } = useHouseholdContext();

  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useWorkspaceState(`view:${id}:events:year`, today.getFullYear());
  const [month, setMonth] = useWorkspaceState(`view:${id}:events:month`, today.getMonth());
  const [selectedDateIso, setSelectedDateIso] = useWorkspaceState<string | null>(`view:${id}:events:selectedDateIso`, toDateIso(today));
  const [events, setEvents] = useState<EventResponseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [labelFilter, setLabelFilter] = useWorkspaceState<string>(`view:${id}:events:labelFilter`, 'all');
  const [recurringFilter, setRecurringFilter] = useWorkspaceState<RecurringFilterKey>(`view:${id}:events:recurringFilter`, 'all');
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const handleSwitch = useCallback(async (householdId: string) => {
    if (householdId === (id ?? currentHouseholdId)) {
      setSwitcherOpen(false);
      return;
    }
    const success = await switchHousehold(householdId);
    if (success) {
      void router.replace(`/households/${encodeURIComponent(householdId)}/events`);
    }
    setSwitcherOpen(false);
  }, [id, currentHouseholdId, switchHousehold, router]);

  const householdId = id ?? currentHouseholdId;
  const currentHousehold = households.find((h) => h.id === (id ?? currentHouseholdId)) ?? null;

  // Fetch events for visible month
  const fetchEvents = useCallback(async () => {
    if (householdId === undefined || householdId === '') return;

    const request = ++requestGeneration.current;
    const monthKey = `${householdId}:${year}:${month}`;
    if (loadedMonth.current !== monthKey) { setLoading(true); setEvents([]); }
    setError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) throw new Error('Session expired');
      const { start, end } = toDateRangeIso(year, month);
      const result = await sessionApiClient.listEvents(token, householdId, start, end, undefined, undefined, true);
      if (request !== requestGeneration.current) return;
      loadedMonth.current = monthKey;
      setEvents(result.events);
    } catch {
      if (request === requestGeneration.current) setError(loadedMonth.current === monthKey
        ? '刷新失败，仍显示上次的日程。请检查网络后重试。'
        : '无法加载日程，请检查网络连接后重试。');
    } finally {
      if (request === requestGeneration.current) setLoading(false);
    }
  }, [householdId, year, month]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchEvents();
    setRefreshing(false);
  }, [fetchEvents]);

  // Refetch whenever this screen regains focus (e.g. returning from
  // create/edit), not just on first mount — otherwise the list shows
  // stale data after a mutation elsewhere in the stack.
  useFocusEffect(
    useCallback(() => {
      void fetchEvents();
      return () => { requestGeneration.current++; };
    }, [fetchEvents]),
  );

  // Extract unique labels from loaded events
  const availableLabels = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; color: string }>();
    for (const e of events) {
      for (const l of e.labels ?? []) {
        if (!seen.has(l.id)) {
          seen.set(l.id, { id: l.id, name: l.name, color: l.color });
        }
      }
    }
    return [...seen.values()];
  }, [events]);

  const filteredEvents = useMemo(() => applyRecurringFilter(events.filter(event =>
    labelFilter === 'all' || (event.labels ?? []).some(label => label.id === labelFilter),
  ), recurringFilter), [events, labelFilter, recurringFilter]);
  const eventsByDate = useMemo(() => {
    const counts = new Map<string, number>();
    const { start, end } = toDateRangeIso(year, month);
    for (const event of filteredEvents) {
      const first = [toDateIso(new Date(event.startTime)), start].sort()[1]!;
      const last = [toDateIso(new Date(event.endTime)), end].sort()[0]!;
      // Walk local noon, bounded to the displayed month, including multi-day events.
      for (const day = new Date(`${first}T12:00:00`); toDateIso(day) <= last; day.setDate(day.getDate() + 1)) {
        const date = toDateIso(day);
        counts.set(date, (counts.get(date) ?? 0) + 1);
      }
    }
    return counts;
  }, [filteredEvents, year, month]);
  const selectedDateEvents = useMemo(() => filteredEvents.filter(event => selectedDateIso !== null &&
    selectedDateIso >= toDateIso(new Date(event.startTime)) && selectedDateIso <= toDateIso(new Date(event.endTime)),
  ), [filteredEvents, selectedDateIso]);
  const handleSelectDate = useCallback((dateIso: string) => {
    const date = new Date(`${dateIso}T12:00:00`);
    setSelectedDateIso(dateIso); setYear(date.getFullYear()); setMonth(date.getMonth());
  }, [setSelectedDateIso, setYear, setMonth]);
  const changeMonth = (offset: number) => {
    const next = new Date(year, month + offset, 1);
    handleSelectDate(toDateIso(next));
  };
  const dateLabel = selectedDateIso ? formatDate(new Date(`${selectedDateIso}T12:00:00`), { weekday: true }) : '当天日程';
  const filterSummary = [recurringFilter === 'recurring' ? '仅重复' : '', labelFilter !== 'all' ? availableLabels.find(label => label.id === labelFilter)?.name ?? '已选标签' : ''].filter(Boolean).join(' · ');

  const handleEventPress = useCallback(
    (event: EventResponseDto) => {
      rememberRouteTrigger();
      void router.push(
        `/households/${encodeURIComponent(householdId!)}/events/${encodeURIComponent(event.id)}`,
      );
    },
    [router, householdId],
  );

  const handleCreateEvent = useCallback(() => {
    rememberRouteTrigger();
    void router.push(`/households/${encodeURIComponent(householdId!)}/events/new`);
  }, [router, householdId]);

  // AccessChanged state
  if (viewState === 'accessChanged') {
    const hasOtherHouseholds = households.length > 0;
    return (
      <AppShell accessibilityLabel="家庭访问权已变化">
        <AccessChangedPanel
          hasOtherHouseholds={hasOtherHouseholds}
          {...(accessChangedHouseholdName === undefined ? {} : { householdName: accessChangedHouseholdName })}
          onChooseOther={() => {
            void refreshHouseholds().then(() => router.replace('/households'));
          }}
          onCreateNew={() => {
            void router.replace('/household-handoff');
          }}
        />
      </AppShell>
    );
  }

  if (householdId === undefined || householdId === '') {
    return (
      <AppShell accessibilityLabel="页面未找到">
        <Stack gap={4}>
          <Text>这个页面暂时无法访问。</Text>
        </Stack>
      </AppShell>
    );
  }

  return (
  <>
    <AppShell accessibilityLabel="家庭日历" refreshing={refreshing} onRefresh={handleRefresh} title="家庭日历" showProfile headerContent={<HouseholdHeader householdName={currentHousehold?.name ?? ''} onOpenSwitcher={() => setSwitcherOpen(true)} />} footer={<HouseholdNavigation householdId={householdId} active="events" />} floatingAction={viewState === 'ready' ? <FloatingCreateButton label="创建日程" onPress={handleCreateEvent} /> : null}>
      <Stack gap={4}>
        {/* Header with household name and create button */}

          <PageIntro title="日历" />

        <View style={{ flexDirection: 'row', gap: activeTheme.spacing[2], alignItems: 'center' }}>
          <Pressable ref={filterTrigger} accessibilityRole="button" accessibilityLabel="筛选日程" onPress={() => setFiltersOpen(true)} style={{ minHeight: activeTheme.controlSizes.touchTarget, justifyContent: 'center' }}><Text variant="label" color="link">筛选</Text></Pressable>
          <Text variant="bodySm" color="inkMuted" style={{ flex: 1 }}>{filterSummary}</Text>
          {filterSummary ? <Pressable accessibilityRole="button" accessibilityLabel="清除日程筛选" onPress={() => { setLabelFilter('all'); setRecurringFilter('all'); }} style={{ minHeight: activeTheme.controlSizes.touchTarget, justifyContent: 'center' }}><Text variant="label" color="link">清除</Text></Pressable> : null}
        </View>
        {filtersOpen ? <AppDialog title="筛选日程" busy={false} trigger={filterTrigger} onClose={() => setFiltersOpen(false)} footer={<Button label="查看结果" onPress={() => setFiltersOpen(false)} />}>
          <Stack gap={4}>
            <FilterOptions label="重复筛选" options={RECURRING_FILTERS.map(f => ({ value: f.key, label: f.label, name: recurringFilterAccessibilityLabel(f.key) }))} value={recurringFilter} onChange={value => setRecurringFilter(value as RecurringFilterKey)} />
            <FilterOptions label="标签" options={[{ value: 'all', label: '全部标签', name: '全部标签' }, ...availableLabels.map(label => ({ value: label.id, label: label.name, name: `筛选标签：${label.name}` }))]} value={labelFilter} onChange={setLabelFilter} />
          </Stack>
        </AppDialog> : null}
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: activeTheme.spacing[5], alignItems: wide ? 'flex-start' : 'stretch' }}>
          <View testID="calendar-month-pane" style={{ flex: wide ? 1 : undefined, minWidth: 0 }}>
            <CalendarMonth year={year} month={month} eventsByDate={eventsByDate} selectedDateIso={selectedDateIso} onPrevMonth={() => changeMonth(-1)} onNextMonth={() => changeMonth(1)} onSelectDate={handleSelectDate} onToday={() => handleSelectDate(toDateIso(new Date()))} />
          </View>
          <Stack gap={3} testID="calendar-agenda-pane" style={{ flex: wide ? 1 : undefined, minWidth: 0 }}>
            <Text variant="section" accessibilityRole="header">{dateLabel}</Text>
            {loading ? <LoadingState label="正在加载日程" /> : null}
            {error ? <LoadError message={error} onRetry={() => void fetchEvents()} retryAccessibilityLabel="重试加载日程" /> : null}
            {!loading && !error && selectedDateEvents.length === 0 ? <EmptyState
              message={recurringFilter === 'recurring' ? RECURRING_EMPTY_EVENTS : labelFilter !== 'all' ? '没有符合筛选条件的日程。' : '这天没有安排。'}
              {...(filterSummary ? { action: <Button label="清除筛选" tone="secondary" onPress={() => { setLabelFilter('all'); setRecurringFilter('all'); }} /> } : {})}
            /> : null}
            {selectedDateEvents.map(event => <EventCard key={event.id} event={event} onPress={handleEventPress} onDelete={deleteEvent(event)} />)}
          </Stack>
        </View>
      </Stack>
    </AppShell>

    <HouseholdSwitcher
      currentHouseholdId={id ?? currentHouseholdId}
      households={households}
      onCreateNew={() => {
        void router.push('/households/new');
        setSwitcherOpen(false);
      }}
      onClose={() => setSwitcherOpen(false)}
      onSelect={(hid) => { void handleSwitch(hid); }}
      visible={switcherOpen}
    />
  </>  );
}
