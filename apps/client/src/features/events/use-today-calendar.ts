import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EventResponseDto } from '@muchakucha/api-client';
import { parseDateValue } from '../../ui/date-values';
import { sessionApiClient, sessionTransport } from '../auth/session-runtime';
import { toCalendarGridRangeIso, toDateIso } from './calendar-utils';

type CalendarResult = {
  key: string;
  status: 'loading' | 'ready' | 'error';
  events: EventResponseDto[] | null;
};

export function useTodayCalendar(householdId: string | null | undefined, today: string, enabled: boolean) {
  const dayKey = [householdId, today].join(':');
  const [selection, setSelection] = useState<{ dayKey: string; month: Date }>();
  const [result, setResult] = useState<CalendarResult>();
  const requestGeneration = useRef(0);
  const defaultMonth = useMemo(() => {
    const date = parseDateValue(today);
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }, [today]);
  const month = selection?.dayKey === dayKey ? selection.month : defaultMonth;
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const range = useMemo(() => toCalendarGridRangeIso(year, monthIndex), [year, monthIndex]);
  const key = [householdId, range.start, range.end].join(':');
  const visibleResult = result?.key === key ? result : undefined;

  const selectMonth = useCallback((year: number, month: number) => {
    setSelection({ dayKey, month: new Date(year, month, 1) });
  }, [dayKey]);

  const refresh = useCallback(async () => {
    if (!enabled || !householdId) return;
    const request = ++requestGeneration.current;
    setResult(previous => ({ key, status: 'loading', events: previous?.key === key ? previous.events : null }));
    const fail = () => {
      if (request !== requestGeneration.current) return;
      setResult(previous => ({ key, status: 'error', events: previous?.key === key ? previous.events : null }));
    };

    try {
      const token = await sessionTransport.getAccessToken();
      if (request !== requestGeneration.current) return;
      if (token === null) {
        fail();
        return;
      }
      // The API's endDate cuts off at the following UTC midnight. Include
      // the next date for evening events in time zones west of UTC.
      const end = parseDateValue(range.end);
      end.setDate(end.getDate() + 1);
      const { events } = await sessionApiClient.listEvents(token, householdId, range.start, toDateIso(end), undefined, undefined, true);
      if (request === requestGeneration.current) setResult({ key, status: 'ready', events });
    } catch {
      fail();
    }
  }, [enabled, householdId, key, range]);

  // Opening a desktop detail can blur Today while leaving the grid usable.
  useEffect(() => {
    void refresh();
    return () => { requestGeneration.current++; };
  }, [refresh]);

  const latestRefresh = useRef(refresh);
  latestRefresh.current = refresh;
  useFocusEffect(useCallback(() => { void latestRefresh.current(); }, []));

  return { month, range, selectMonth, refresh, events: visibleResult?.events ?? null, status: visibleResult?.status ?? 'loading' };
}
