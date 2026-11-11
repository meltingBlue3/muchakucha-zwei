import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { sessionApiClient, sessionTransport } from '../auth/session-runtime';
import { subscribeContentChanges } from '../content/content-changes';
import { toDateIso } from '../events/calendar-utils';
import { partitionTodayTasks } from '../tasks/today-tasks';

export interface SidebarCounts {
  /** Today's events and the open tasks due today, as the 今日 page counts them. */
  today: number;
  /** Open tasks past their due date. */
  overdue: number;
}

/**
 * The numbers beside 今日 and 任务 in the desktop sidebar. Loaded when the page
 * gains focus and again after any saved change in the household; a failed load
 * keeps the last numbers.
 */
export function useSidebarCounts(householdId: string | null | undefined, enabled: boolean): SidebarCounts | null {
  const [counts, setCounts] = useState<SidebarCounts | null>(null);
  const generation = useRef(0);
  const load = useCallback(async () => {
    if (!enabled || !householdId) return;
    const request = ++generation.current;
    try {
      const token = await sessionTransport.getAccessToken();
      if (!token) return;
      const today = toDateIso(new Date());
      const [events, tasks] = await Promise.all([
        sessionApiClient.listEvents(token, householdId, today, today, undefined, undefined, true),
        sessionApiClient.listTasks(token, householdId),
      ]);
      if (request !== generation.current) return;
      // The API pads its range for client time zones; only events on the local date count.
      const todayEvents = events.events.filter(event => toDateIso(new Date(event.startTime)) <= today && toDateIso(new Date(event.endTime)) >= today);
      const { overdueTasks, todayTasks } = partitionTodayTasks(tasks.tasks);
      setCounts({ today: todayEvents.length + todayTasks.length, overdue: overdueTasks.length });
    } catch {
      // Keep the last numbers; the next focus or change tries again.
    }
  }, [enabled, householdId]);
  useFocusEffect(useCallback(() => {
    void load();
    return () => { generation.current++; };
  }, [load]));
  useEffect(() => {
    if (!enabled || !householdId) return undefined;
    return subscribeContentChanges(changed => { if (changed === householdId) void load(); });
  }, [enabled, householdId, load]);
  useEffect(() => { setCounts(null); }, [householdId]);
  return enabled ? counts : null;
}
