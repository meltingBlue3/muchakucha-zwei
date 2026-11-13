import { useTranslation } from '../../i18n';
import { useContentChanges } from '../content/content-changes';
import { useResourceNavigation } from '../../ui/use-resource-navigation';
import { useDesktop } from '../../ui/use-desktop';
import { DesktopMonth } from './desktop-month';
import { DesktopDayPane } from './desktop-day-pane';
import { usePathname } from 'expo-router';
import { Text, Inline, IconButton } from '../../ui/primitives';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import { useOpenWindowItem } from '../../ui/route-window';
import { FloatingCreateButton } from '../../ui/floating-create-button';
import { useContentDelete, useContentEdit } from '../content/use-content-delete';
import { rememberRouteTrigger } from '../../platform/overlays/route-trigger';
import { AppDialog } from '../../ui/app-dialog';
import { FilterActions, FilterButton } from '../../ui/filter-controls';
import { FilterOptions } from '../../ui/filter-options';
import { PageIntro } from '../../ui/page-intro';
import { formatDate } from '../../ui/date-values';
import { useMinuteClock } from '../../ui/use-minute-clock';
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
import { lunarDescriptionOn, useLunarCalendar } from '../lunar/lunar-calendar';
import { HouseholdScreen } from '../households/household-screen';
import { EventCard } from './event-card';
import { formatMonthLabel, toDateIso, toDateRangeIso } from './calendar-utils';
import {
  applyRecurringFilter,
  recurringEmptyEvents,
  RECURRING_FILTERS,
  recurringFilterAccessibilityLabel,
  type RecurringFilterKey,
} from '../recurrence/recurring-filter';
import { Button, EmptyState, LoadError, LoadingState, Stack } from '../../ui/primitives';
import type { Theme } from '../../ui/theme';

/** All-day events first, then by start time. */
const byStart = (a: EventResponseDto, b: EventResponseDto) => Number(b.allDay) - Number(a.allDay) || a.startTime.localeCompare(b.startTime);

export default function CalendarScreen() {
  const { t } = useTranslation(['events', 'recurrence', 'tasks', 'navigation']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const desktop = useDesktop();
  const paneOpen = /\/events\/[^/]+(?:\/edit)?$/.test(usePathname());
  const openResource = useResourceNavigation();
  const openEventId = useOpenWindowItem('eventId');
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

  const lunar = useLunarCalendar();
  const clock = useMinuteClock();
  const today = clock.date;
  const todayIso = toDateIso(today);
  const [year, setYear] = useWorkspaceState(`view:${id}:events:year`, today.getFullYear());
  const [month, setMonth] = useWorkspaceState(`view:${id}:events:month`, today.getMonth());
  const [selectedDateIso, setSelectedDateIso] = useWorkspaceState<string | null>(`view:${id}:events:selectedDateIso`, toDateIso(today));
  const [events, setEvents] = useState<EventResponseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'refreshError' | 'loadError' | null>(null);
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
        ? 'refreshError'
        : 'loadError');
    } finally {
      if (request === requestGeneration.current) setLoading(false);
    }
  }, [householdId, year, month]);

  useContentChanges(householdId, fetchEvents);

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
  const lunarLabel = lunar && selectedDateIso ? lunarDescriptionOn(selectedDateIso) : null;
  const dateLabel = selectedDateIso ? formatDate(new Date(`${selectedDateIso}T12:00:00`), { weekday: true }) : t('selectedDay');
  const activeFilterCount = [recurringFilter !== 'all', labelFilter !== 'all'].filter(Boolean).length;
  const clearFilters = () => { setLabelFilter('all'); setRecurringFilter('all'); };
  const filterSummary = [recurringFilter === 'recurring' ? t('tasks:recurringOnly') : '', labelFilter !== 'all' ? availableLabels.find(label => label.id === labelFilter)?.name ?? t('tasks:selectedLabel') : ''].filter(Boolean).join(' · ');

  const handleEventPress = useCallback(
    (event: EventResponseDto) => {
      rememberRouteTrigger();
      openResource(
        `/households/${encodeURIComponent(householdId!)}/events/${encodeURIComponent(event.id)}`,
      );
    },
    [router, householdId, openResource],
  );

  const handleCreateEvent = useCallback(() => {
    rememberRouteTrigger();
    openResource(`/households/${encodeURIComponent(householdId!)}/events/new`);
  }, [router, householdId, openResource]);

  const [weekView, setWeekView] = useWorkspaceState(`view:${id}:events:weekView`, true);
  // Phones start on one week; a wide screen always has room for the month.
  const compactWeek = weekView && !wide;
  const moveSelection = (days: number) => {
    const date = new Date(`${selectedDateIso ?? toDateIso(new Date())}T12:00:00`);
    date.setDate(date.getDate() + days);
    handleSelectDate(toDateIso(date));
  };
  const selectedIsToday = selectedDateIso === todayIso;

  return (
    <HouseholdScreen
      active="events"
      accessibilityLabel={t('calendar')}
      layout={desktop ? 'workspace' : 'document'}
      refreshing={refreshing}
      onRefresh={handleRefresh}
      floatingAction={<FloatingCreateButton label={t('create')} onPress={handleCreateEvent} />}
    >
      <Stack gap={desktop ? 0 : 5} style={desktop ? { flex: 1, minHeight: 0 } : undefined}>
        <PageIntro
          title={t('navigation:pages.events')}
          // On a wide screen the month being shown reads right after the page title, with its arrows and 今天; filters stay with the actions.
          {...(desktop ? { subtitle: <Inline gap={3}>
            <Inline gap={1}><IconButton label={t('previousMonth')} appearance="plain" icon={<ChevronLeft size={activeTheme.controlSizes.icon} color={activeTheme.colors.inkMuted} />} onPress={() => changeMonth(-1)} /><Text variant="section" color="ink">{formatMonthLabel(year, month)}</Text><IconButton label={t('nextMonth')} appearance="plain" icon={<ChevronRight size={activeTheme.controlSizes.icon} color={activeTheme.colors.inkMuted} />} onPress={() => changeMonth(1)} /></Inline>
            <Button label={t('today')} accessibilityLabel={t('goToToday')} tone="secondary" size="compact" onPress={() => handleSelectDate(toDateIso(new Date()))} />
            {filterSummary ? <Text variant="meta" numberOfLines={1}>{filterSummary}</Text> : null}
          </Inline> } : filterSummary ? { subtitle: filterSummary } : {})}
          action={<>
            {!desktop && !selectedIsToday ? <Button label={t('today')} accessibilityLabel={t('goToToday')} tone="secondary" size="compact" onPress={() => handleSelectDate(toDateIso(new Date()))} /> : null}
            <FilterButton ref={filterTrigger} label={t('filter')} count={activeFilterCount} onPress={() => setFiltersOpen(true)} />
          </>}
        />
        {filtersOpen ? <AppDialog title={t('filter')} busy={false} trigger={filterTrigger} onClose={() => setFiltersOpen(false)} footer={<FilterActions onClear={clearFilters} onDone={() => setFiltersOpen(false)} />}>
          <Stack gap={5}>
            <FilterOptions label={t('recurrence:repeat')} options={RECURRING_FILTERS.map(value => ({ value, label: t(`recurrence:filter.${value}`), name: recurringFilterAccessibilityLabel(value) }))} value={recurringFilter} onChange={value => setRecurringFilter(value as RecurringFilterKey)} />
            {availableLabels.length ? <FilterOptions label={t('labels')} options={[{ value: 'all', label: t('tasks:allLabels'), name: t('tasks:allLabels') }, ...availableLabels.map(label => ({ value: label.id, label: label.name, name: t('tasks:labelOption', { label: label.name }) }))]} value={labelFilter} onChange={setLabelFilter} /> : null}
          </Stack>
        </AppDialog> : null}
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: desktop ? 0 : activeTheme.spacing[6], alignItems: desktop ? 'stretch' : wide ? 'flex-start' : 'stretch', ...(desktop ? { flex: 1, minHeight: 0 } : {}) }}>
          <View testID="calendar-month-pane" style={{ flex: wide ? 2 : undefined, minWidth: 0 }}>
            {desktop ? <DesktopMonth year={year} month={month} todayIso={todayIso} selectedDateIso={selectedDateIso} events={filteredEvents} onSelectDate={handleSelectDate} onOpenEvent={handleEventPress} lunar={lunar} /> : <CalendarMonth
              todayIso={todayIso}
              year={year}
              month={month}
              eventsByDate={eventsByDate}
              {...(wide ? { eventTitlesByDate } : { eventColorsByDate: eventTitlesByDate })}
              selectedDateIso={selectedDateIso}
              lunar={lunar}
              mode={compactWeek ? 'week' : 'month'}
              onPrevMonth={() => changeMonth(-1)}
              onNextMonth={() => changeMonth(1)}
              onPrevWeek={() => moveSelection(-7)}
              onNextWeek={() => moveSelection(7)}
              {...(wide ? {} : { onToggleMode: () => setWeekView(value => !value) })}
              onSelectDate={handleSelectDate}
            />}
          </View>
          {desktop ? <View testID="calendar-agenda-pane" style={{ width: activeTheme.layout.calendarAgendaWidth, minHeight: 0, borderLeftWidth: activeTheme.borderWidths.default, borderLeftColor: activeTheme.colors.separator, ...(paneOpen ? { display: 'none' } : {}) }}>
            <DesktopDayPane lunar={lunar} dateIso={selectedDateIso ?? todayIso} todayIso={todayIso} events={selectedDateEvents} openEventId={openEventId ?? null} nowMinutes={clock.minutes} onOpen={handleEventPress} onCreate={handleCreateEvent} onEdit={editEvent} onDelete={deleteEvent}>
              {loading ? <LoadingState label={t('loading')} /> : null}
              {error ? <LoadError message={t(error)} onRetry={() => void fetchEvents()} retryAccessibilityLabel={t('retryLoad')} /> : null}
              {!loading && !error && selectedDateEvents.length === 0 ? <EmptyState
                message={recurringFilter === 'recurring' ? recurringEmptyEvents() : labelFilter !== 'all' ? t('emptyFiltered') : t('emptyDay')}
                {...(filterSummary ? { action: <Button label={t('tasks:adjustFilter')} tone="secondary" onPress={() => setFiltersOpen(true)} /> } : {})}
              /> : null}
            </DesktopDayPane>
          </View> :           <View testID="calendar-agenda-pane" style={{ flex: wide ? 1 : undefined, minWidth: 0 }}>
            <GroupLabel>{[dateLabel, selectedIsToday ? t('today') : null, lunarLabel].filter(Boolean).join(' · ')}</GroupLabel>
            <Stack gap={3}>
              {loading ? <LoadingState label={t('loading')} /> : null}
              {error ? <LoadError message={t(error)} onRetry={() => void fetchEvents()} retryAccessibilityLabel={t('retryLoad')} /> : null}
              {!loading && !error && selectedDateEvents.length === 0 ? <EmptyState
                message={recurringFilter === 'recurring' ? recurringEmptyEvents() : labelFilter !== 'all' ? t('emptyFiltered') : t('emptyDay')}
                {...(filterSummary ? { action: <Button label={t('tasks:adjustFilter')} tone="secondary" onPress={() => setFiltersOpen(true)} /> } : {})}
              /> : null}
              <ListGroup>
                {selectedDateEvents.map(event => <EventCard key={event.id} event={event} withinDay timeColumn selected={event.id === openEventId} onPress={handleEventPress} onEdit={editEvent(event)} onDelete={deleteEvent(event)} />)}
              </ListGroup>
            </Stack>
          </View>}
        </View>
      </Stack>
    </HouseholdScreen>
  );
}
