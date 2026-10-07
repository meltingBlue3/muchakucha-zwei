import { FloatingCreateButton } from '../../ui/floating-create-button';
import { useContentDelete, useContentEdit } from '../content/use-content-delete';
import { rememberRouteTrigger } from '../../platform/overlays/route-trigger';
import { AppDialog } from '../../ui/app-dialog';
import { FilterActions, FilterButton } from '../../ui/filter-controls';
import { FilterOptions } from '../../ui/filter-options';
import { PageIntro } from '../../ui/page-intro';
import { formatDate } from '../../ui/date-values';
import { useWorkspaceState } from '../../ui/workspace-state';
import { GroupLabel, ListGroup } from '../../ui/list-group';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { EventResponseDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../auth/session-runtime';
import { useHouseholdContext } from '../households/household-context';
import { mergeLabels, useHouseholdLabels } from '../labels/use-household-labels';
import { CalendarMonth, type CalendarCellEvent } from './calendar-month';
import { HouseholdScreen } from '../households/household-screen';
import { EventCard } from './event-card';
import { toDateIso, toDateRangeIso } from './calendar-utils';
import {
  applyRecurringFilter,
  RECURRING_EMPTY_EVENTS,
  RECURRING_FILTER_GROUP_LABEL,
  RECURRING_FILTERS,
  recurringFilterAccessibilityLabel,
  type RecurringFilterKey,
} from '../recurrence/recurring-filter';
import { Button, EmptyState, LoadError, LoadingState, Stack } from '../../ui/primitives';
import type { Theme } from '../../ui/theme';

/** All-day events first, then by start time. */
const byStart = (a: EventResponseDto, b: EventResponseDto) => Number(b.allDay) - Number(a.allDay) || a.startTime.localeCompare(b.startTime);

export default function CalendarScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const deleteEvent = useContentDelete('events');
  const editEvent = useContentEdit('events');
  const activeTheme = useTheme<Theme>();
  const { width } = useWindowDimensions();
  const wide = width >= activeTheme.layout.navigationBreakpoint;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterTrigger = useRef<View>(null);
  const loadedMonth = useRef('');
  const requestGeneration = useRef(0);
  const { currentHouseholdId } = useHouseholdContext();

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

  const householdId = id ?? currentHouseholdId;

  // Fetch events for visible month
  const fetchEvents = useCallback(async () => {
    if (householdId === undefined || householdId === null || householdId === '') return;

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
  const seenLabels = useMemo(() => {
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
  const householdLabels = useHouseholdLabels(householdId);
  const availableLabels = useMemo(() => mergeLabels(householdLabels, seenLabels), [householdLabels, seenLabels]);

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
  // Each day's events, all-day first, for the titles in a wide month and the dot colors on a phone.
  const eventTitlesByDate = useMemo(() => {
    const byDate = new Map<string, CalendarCellEvent[]>();
    const { start, end } = toDateRangeIso(year, month);
    for (const event of [...filteredEvents].sort(byStart)) {
      const first = [toDateIso(new Date(event.startTime)), start].sort()[1]!;
      const last = [toDateIso(new Date(event.endTime)), end].sort()[0]!;
      for (const day = new Date(`${first}T12:00:00`); toDateIso(day) <= last; day.setDate(day.getDate() + 1)) {
        const date = toDateIso(day);
        byDate.set(date, [...(byDate.get(date) ?? []), { id: event.id, title: event.title, color: event.labels?.[0]?.color ?? activeTheme.colors.inkFaint }]);
      }
    }
    return byDate;
  }, [filteredEvents, year, month, activeTheme]);
  const selectedDateEvents = useMemo(() => filteredEvents.filter(event => selectedDateIso !== null &&
    selectedDateIso >= toDateIso(new Date(event.startTime)) && selectedDateIso <= toDateIso(new Date(event.endTime)),
  ).sort(byStart), [filteredEvents, selectedDateIso]);
  const handleSelectDate = useCallback((dateIso: string) => {
    const date = new Date(`${dateIso}T12:00:00`);
    setSelectedDateIso(dateIso); setYear(date.getFullYear()); setMonth(date.getMonth());
  }, [setSelectedDateIso, setYear, setMonth]);
  const changeMonth = (offset: number) => {
    const next = new Date(year, month + offset, 1);
    handleSelectDate(toDateIso(next));
  };
  const dateLabel = selectedDateIso ? formatDate(new Date(`${selectedDateIso}T12:00:00`), { weekday: true }) : '当天日程';
  const activeFilterCount = [recurringFilter !== 'all', labelFilter !== 'all'].filter(Boolean).length;
  const clearFilters = () => { setLabelFilter('all'); setRecurringFilter('all'); };
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

  const [weekView, setWeekView] = useWorkspaceState(`view:${id}:events:weekView`, true);
  // Phones start on one week; a wide screen always has room for the month.
  const compactWeek = weekView && !wide;
  const moveSelection = (days: number) => {
    const date = new Date(`${selectedDateIso ?? toDateIso(new Date())}T12:00:00`);
    date.setDate(date.getDate() + days);
    handleSelectDate(toDateIso(date));
  };
  const selectedIsToday = selectedDateIso === toDateIso(new Date());

  return (
    <HouseholdScreen
      active="events"
      accessibilityLabel="家庭日历"
      refreshing={refreshing}
      onRefresh={handleRefresh}
      floatingAction={<FloatingCreateButton label="创建日程" onPress={handleCreateEvent} />}
    >
      <Stack gap={5}>
        <PageIntro
          title="日历"
          {...(filterSummary ? { subtitle: filterSummary } : {})}
          action={<>
            {!selectedIsToday ? <Button label="今天" accessibilityLabel="回到今天" tone="secondary" onPress={() => handleSelectDate(toDateIso(new Date()))} /> : null}
            <FilterButton ref={filterTrigger} label="筛选日程" count={activeFilterCount} onPress={() => setFiltersOpen(true)} />
          </>}
        />
        {filtersOpen ? <AppDialog title="筛选日程" busy={false} trigger={filterTrigger} onClose={() => setFiltersOpen(false)} footer={<FilterActions onClear={clearFilters} onDone={() => setFiltersOpen(false)} />}>
          <Stack gap={5}>
            <FilterOptions label={RECURRING_FILTER_GROUP_LABEL} options={RECURRING_FILTERS.map(f => ({ value: f.key, label: f.label, name: recurringFilterAccessibilityLabel(f.key) }))} value={recurringFilter} onChange={value => setRecurringFilter(value as RecurringFilterKey)} />
            {availableLabels.length ? <FilterOptions label="标签" options={[{ value: 'all', label: '全部标签', name: '全部标签' }, ...availableLabels.map(label => ({ value: label.id, label: label.name, name: `筛选标签：${label.name}` }))]} value={labelFilter} onChange={setLabelFilter} /> : null}
          </Stack>
        </AppDialog> : null}
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: activeTheme.spacing[6], alignItems: wide ? 'flex-start' : 'stretch' }}>
          <View testID="calendar-month-pane" style={{ flex: wide ? 2 : undefined, minWidth: 0 }}>
            <CalendarMonth
              year={year}
              month={month}
              eventsByDate={eventsByDate}
              {...(wide ? { eventTitlesByDate } : { eventColorsByDate: eventTitlesByDate })}
              selectedDateIso={selectedDateIso}
              mode={compactWeek ? 'week' : 'month'}
              onPrevMonth={() => changeMonth(-1)}
              onNextMonth={() => changeMonth(1)}
              onPrevWeek={() => moveSelection(-7)}
              onNextWeek={() => moveSelection(7)}
              {...(wide ? {} : { onToggleMode: () => setWeekView(value => !value) })}
              onSelectDate={handleSelectDate}
            />
          </View>
          <View testID="calendar-agenda-pane" style={{ flex: wide ? 1 : undefined, minWidth: 0 }}>
            <GroupLabel>{`${dateLabel}${selectedIsToday ? ' · 今天' : ''}`}</GroupLabel>
            <Stack gap={3}>
              {loading ? <LoadingState label="正在加载日程" /> : null}
              {error ? <LoadError message={error} onRetry={() => void fetchEvents()} retryAccessibilityLabel="重试加载日程" /> : null}
              {!loading && !error && selectedDateEvents.length === 0 ? <EmptyState
                message={recurringFilter === 'recurring' ? RECURRING_EMPTY_EVENTS : labelFilter !== 'all' ? '没有符合筛选条件的日程。' : '这天没有安排。'}
                {...(filterSummary ? { action: <Button label="调整筛选" tone="secondary" onPress={() => setFiltersOpen(true)} /> } : {})}
              /> : null}
              <ListGroup>
                {selectedDateEvents.map(event => <EventCard key={event.id} event={event} withinDay timeColumn onPress={handleEventPress} onEdit={editEvent(event)} onDelete={deleteEvent(event)} />)}
              </ListGroup>
            </Stack>
          </View>
        </View>
      </Stack>
    </HouseholdScreen>
  );
}
