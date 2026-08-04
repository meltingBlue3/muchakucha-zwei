import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { EventResponseDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../../../../../src/features/auth/session-runtime';
import { useHouseholdContext } from '../../../../../src/features/households/household-context';
import { CalendarMonth } from '../../../../../src/features/events/calendar-month';
import { EventCard } from '../../../../../src/features/events/event-card';
import { toDateIso, toDateRangeIso } from '../../../../../src/features/events/calendar-utils';
import {
  AccessChangedPanel,
  AppShell,
  HouseholdHeader,
} from '../../../../../src/ui/household-components';
import { Stack, Text } from '../../../../../src/ui/primitives';
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
  } = useHouseholdContext();

  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDateIso, setSelectedDateIso] = useState<string | null>(toDateIso(today));
  const [events, setEvents] = useState<EventResponseDto[]>([]);
  const [eventsByDate, setEventsByDate] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const householdId = id ?? currentHouseholdId;
  const currentHousehold = households.find((h) => h.id === currentHouseholdId) ?? null;

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

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  // Filter events for selected date
  const selectedDateEvents = useMemo(() => {
    if (selectedDateIso === null) return [];
    return events.filter((e) => {
      const eventStart = toDateIso(new Date(e.startTime));
      const eventEnd = toDateIso(new Date(e.endTime));
      return selectedDateIso >= eventStart && selectedDateIso <= eventEnd;
    });
  }, [events, selectedDateIso]);

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
        `/households/${encodeURIComponent(householdId!)}/events/${encodeURIComponent(event.id)}/edit`,
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
    <AppShell accessibilityLabel="家庭日历">
      <Stack gap={4}>
        {/* Header with household name and create button */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <HouseholdHeader
            householdName={currentHousehold?.name ?? ''}
            onOpenSwitcher={() => {}}
          />
          <Pressable
            onPress={handleCreateEvent}
            accessibilityLabel="创建事件"
            style={({ pressed }) => ({
              backgroundColor: activeTheme.colors.coral,
              paddingHorizontal: activeTheme.spacing[4],
              paddingVertical: activeTheme.spacing[2],
              borderRadius: activeTheme.borderRadii.full,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text variant="button" color="surface">
              + 新建
            </Text>
          </Pressable>
        </View>

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
                style={{ marginTop: activeTheme.spacing[2] }}
              >
                <Text variant="label" color="coral">
                  重试
                </Text>
              </Pressable>
            </View>
          )}

          {!loading && error === null && selectedDateEvents.length === 0 && (
            <Text variant="bodySm" color="inkMuted">
              这一天没有事件。
            </Text>
          )}

          {selectedDateEvents.map((event) => (
            <EventCard key={event.id} event={event} onPress={handleEventPress} />
          ))}
        </Stack>
      </Stack>
    </AppShell>
  );
}
