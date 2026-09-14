import { PageIntro } from '../../../../../src/ui/page-intro';
import { useWorkspaceState } from '../../../../../src/ui/workspace-state';
import { HouseholdNavigation } from '../../../../../src/ui/household-navigation';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { EventResponseDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../../../../../src/features/auth/session-runtime';
import { useHouseholdContext } from '../../../../../src/features/households/household-context';
import { CalendarMonth } from '../../../../../src/features/events/calendar-month';
import { EventCard } from '../../../../../src/features/events/event-card';
import { toDateIso, toDateRangeIso } from '../../../../../src/features/events/calendar-utils';
import {
  applyRecurringFilter,
  classifyGenerationWindow,
  GENERATION_AHEAD_NOTE,
  GENERATION_BEHIND_BODY,
  GENERATION_BEHIND_HEADING,
  RECURRING_EMPTY_EVENTS,
  RECURRING_FILTERS,
  recurringFilterAccessibilityLabel,
  type RecurringFilterKey,
} from '../../../../../src/features/recurrence/recurring-filter';
import {
  AccessChangedPanel,
  AppShell,
  HouseholdHeader,
  HouseholdSwitcher,
} from '../../../../../src/ui/household-components';
import { Stack, StatusPanel, Text, Button } from '../../../../../src/ui/primitives';
import type { Theme } from '../../../../../src/ui/theme';

export default function CalendarRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const activeTheme = useTheme<Theme>();
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
  const [eventsByDate, setEventsByDate] = useState<Map<string, number>>(new Map());
  const [materializedThrough, setMaterializedThrough] = useState<string | null>(null);
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

    setLoading(true);
    setError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setError('登录已过期，请重新登录。');
        return;
      }
      const { start, end } = toDateRangeIso(year, month);
      const result = await sessionApiClient.listEvents(token, householdId, start, end);
      setEvents(result.events);
      setMaterializedThrough(result.materializedThrough ?? null);

      // Build events-by-date map
      const byDate = new Map<string, number>();
      for (const event of result.events) {
        const eventStart = toDateIso(new Date(event.startTime));
        const eventEnd = toDateIso(new Date(event.endTime));
        // Count for each day in range (simple approach)
        const startD = new Date(eventStart);
        const endD = new Date(eventEnd);
        const seen = new Set<string>();
        for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
          const iso = toDateIso(d);
          if (!seen.has(iso)) {
            seen.add(iso);
            byDate.set(iso, (byDate.get(iso) ?? 0) + 1);
          }
        }
      }
      setEventsByDate(byDate);
    } catch (err) {
      setError('无法加载事件，请检查网络连接后重试。');
    } finally {
      setLoading(false);
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

  // Filter events for selected date (with optional label and recurring filters)
  const selectedDateEvents = useMemo(() => {
    if (selectedDateIso === null) return [];
    let result = events.filter((e) => {
      const eventStart = toDateIso(new Date(e.startTime));
      const eventEnd = toDateIso(new Date(e.endTime));
      if (!(selectedDateIso >= eventStart && selectedDateIso <= eventEnd)) return false;
      if (labelFilter !== 'all' && !(e.labels ?? []).some((l) => l.id === labelFilter)) return false;
      return true;
    });
    result = applyRecurringFilter(result, recurringFilter);
    return result;
  }, [events, selectedDateIso, labelFilter, recurringFilter]);

  const todayIso = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, []);

  const generationWindow = classifyGenerationWindow({
    materializedThrough,
    todayIso,
    viewedDateIso: selectedDateIso,
    filtersActive: labelFilter !== 'all' || recurringFilter !== 'all',
  });

  const handlePrevMonth = useCallback(() => {
    if (month === 0) {
      setYear((y) => y - 1);
      setMonth(11);
    } else {
      setMonth((m) => m - 1);
    }
  }, [month]);

  const handleNextMonth = useCallback(() => {
    if (month === 11) {
      setYear((y) => y + 1);
      setMonth(0);
    } else {
      setMonth((m) => m + 1);
    }
  }, [month]);

  const handleSelectDate = useCallback((dateIso: string) => {
    setSelectedDateIso(dateIso);
  }, []);

  const handleEventPress = useCallback(
    (event: EventResponseDto) => {
      void router.push(
        `/households/${encodeURIComponent(householdId!)}/events/${encodeURIComponent(event.id)}`,
      );
    },
    [router, householdId],
  );

  const handleCreateEvent = useCallback(() => {
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
    <AppShell accessibilityLabel="家庭日历" refreshing={refreshing} onRefresh={handleRefresh} title="家庭日历" showProfile headerContent={<HouseholdHeader householdName={currentHousehold?.name ?? ''} onOpenSwitcher={() => setSwitcherOpen(true)} />} footer={<HouseholdNavigation householdId={householdId} active="events" />}>
      <Stack gap={4}>
        {/* Header with household name and create button */}

          <PageIntro title="日历" action={<Button label="新建" accessibilityLabel="创建事件" onPress={handleCreateEvent} />} />

        {/* Calendar */}
        <CalendarMonth
          year={year}
          month={month}
          eventsByDate={eventsByDate}
          selectedDateIso={selectedDateIso}
          onPrevMonth={handlePrevMonth}
          onNextMonth={handleNextMonth}
          onSelectDate={handleSelectDate}
        />

        {/* Recurring filter — always rendered (unlike the label filter row
            below): a household can't know in advance whether it has any
            recurring series, so a conditional row would make the entry
            point appear and disappear unpredictably. Independent radiogroup
            from the label filter row — the two must not merge into one
            group or one row. */}
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="重复筛选"
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: activeTheme.spacing[2], alignItems: 'center' }}
        >
          {RECURRING_FILTERS.map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setRecurringFilter(f.key)}
              hitSlop={activeTheme.spacing[3]}
              accessibilityRole="radio"
              // role="radio" requires aria-checked (WCAG 4.1.2). accessibilityState
              // alone does not emit it on Web, so mirror RecurrencePicker: `checked`
              // for native, an explicit aria-checked for the Web DOM.
              accessibilityState={{ checked: recurringFilter === f.key }}
              aria-checked={recurringFilter === f.key}
              style={({ pressed }) => ({
                paddingHorizontal: activeTheme.spacing[3],
                paddingVertical: activeTheme.spacing[1],
                borderRadius: activeTheme.borderRadii.full,
                borderWidth: 1,
                borderColor: recurringFilter === f.key ? activeTheme.colors.coral : activeTheme.colors.border,
                backgroundColor: 'transparent',
                opacity: pressed ? 0.7 : 1,
              })}
              accessibilityLabel={recurringFilterAccessibilityLabel(f.key)}
            >
              <Text variant="caption" color={recurringFilter === f.key ? 'coral' : 'inkMuted'}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Label filter */}
        {availableLabels.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: activeTheme.spacing[2], alignItems: 'center' }}>
            <Pressable
              onPress={() => setLabelFilter('all')}
              hitSlop={activeTheme.spacing[3]}
              accessibilityRole="radio"
              accessibilityState={{ selected: labelFilter === 'all' }}
              style={({ pressed }) => ({
                paddingHorizontal: activeTheme.spacing[3],
                paddingVertical: activeTheme.spacing[1],
                borderRadius: activeTheme.borderRadii.full,
                borderWidth: 1,
                borderColor: labelFilter === 'all' ? activeTheme.colors.coral : activeTheme.colors.border,
                backgroundColor: 'transparent',
                opacity: pressed ? 0.7 : 1,
              })}
              accessibilityLabel="全部标签"
            >
              <Text variant="caption" color={labelFilter === 'all' ? 'coral' : 'inkMuted'}>
                全部标签
              </Text>
            </Pressable>
            {availableLabels.map((l) => (
              <Pressable
                key={l.id}
                onPress={() => setLabelFilter(labelFilter === l.id ? 'all' : l.id)}
                hitSlop={activeTheme.spacing[3]}
                accessibilityRole="radio"
                accessibilityState={{ selected: labelFilter === l.id }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: activeTheme.spacing[1],
                  paddingHorizontal: activeTheme.spacing[3],
                  paddingVertical: activeTheme.spacing[1],
                  borderRadius: activeTheme.borderRadii.full,
                  borderWidth: 1,
                  borderColor: labelFilter === l.id ? l.color : activeTheme.colors.border,
                  backgroundColor: labelFilter === l.id ? l.color + '18' : 'transparent',
                  opacity: pressed ? 0.7 : 1,
                })}
                accessibilityLabel={`筛选标签：${l.name}`}
              >
                <View style={{ width: 8, height: 8, borderRadius: activeTheme.borderRadii.full, backgroundColor: l.color }} />
                <Text variant="caption" style={{ color: labelFilter === l.id ? l.color : activeTheme.colors.inkMuted }}>
                  {l.name}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Selected date events */}
        <Stack gap={2}>
          <Text variant="label">
            {selectedDateIso !== null ? selectedDateIso : ''}
          </Text>

          {loading && (
            <View style={{ alignItems: 'center', paddingVertical: activeTheme.spacing[6] }}>
              <ActivityIndicator color={activeTheme.colors.coral} />
            </View>
          )}

          {error !== null && (
            <View
              style={{
                backgroundColor: activeTheme.colors.destructiveSoft,
                padding: activeTheme.spacing[4],
                borderRadius: activeTheme.borderRadii.md,
              }}
            >
              <Text variant="bodySm" color="destructive">
                {error}
              </Text>
              <Pressable
                onPress={() => void fetchEvents()}
                hitSlop={activeTheme.spacing[3]}
                accessibilityLabel="重试加载事件"
                style={{ marginTop: activeTheme.spacing[2], alignSelf: 'flex-start' }}
              >
                <Text variant="label" color="coral">
                  重试
                </Text>
              </Pressable>
            </View>
          )}

          {!loading && error === null && selectedDateEvents.length === 0 && (
            generationWindow === 'behind' ? (
              <StatusPanel
                action={null}
                body={GENERATION_BEHIND_BODY}
                heading={GENERATION_BEHIND_HEADING}
                kind="offline"
              />
            ) : (
              <Stack gap={1}>
                <Text variant="bodySm" color="inkMuted">
                  {recurringFilter === 'recurring'
                    ? RECURRING_EMPTY_EVENTS
                    : labelFilter !== 'all'
                      ? '没有符合筛选条件的事件。'
                      : '还没有事件。'}
                </Text>
                {generationWindow === 'ahead' && (
                  <Text variant="caption" color="inkMuted">
                    {GENERATION_AHEAD_NOTE}
                  </Text>
                )}
              </Stack>
            )
          )}

          {selectedDateEvents.map((event) => (
            <EventCard key={event.id} event={event} onPress={handleEventPress} />
          ))}
        </Stack>
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
