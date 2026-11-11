import { RouteWindow, useRouteWindowClose, type RouteWindowProps } from '../../ui/route-window';
import CalendarScreen from './calendar-screen';
import type { EventResponseDto } from '@muchakucha/api-client';
import { useDesktop } from '../../ui/use-desktop';
import { DesktopEventAgenda } from './desktop-event-agenda';

export function useEventWindowClose() { return useRouteWindowClose('events'); }
export function EventWindow({ event, children, ...props }: Omit<RouteWindowProps, 'resource' | 'fallback'> & { event?: EventResponseDto }) {
  const desktop = useDesktop();
  return <RouteWindow {...props} resource="events" fallback={<CalendarScreen />}>{desktop && event ? <DesktopEventAgenda event={event} /> : null}{children}</RouteWindow>;
}
