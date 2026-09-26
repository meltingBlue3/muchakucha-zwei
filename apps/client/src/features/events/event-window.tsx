import { RouteWindow, useRouteWindowClose, type RouteWindowProps } from '../../ui/route-window';
import CalendarScreen from './calendar-screen';

export function useEventWindowClose() { return useRouteWindowClose('events'); }
export function EventWindow(props: Omit<RouteWindowProps, 'resource' | 'fallback'>) {
  return <RouteWindow {...props} resource="events" fallback={<CalendarScreen />} />;
}
