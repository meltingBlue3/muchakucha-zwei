import { RouteWindow, useRouteWindowClose, type RouteWindowProps } from '../../ui/route-window';
import HouseholdSettingsScreen from './household-settings-screen';

export function useHouseholdActionClose() { return useRouteWindowClose('settings').close; }
export function HouseholdActionWindow(props: Omit<RouteWindowProps, 'resource' | 'fallback'>) {
  return <RouteWindow size="standard" {...props} resource="settings" fallback={<HouseholdSettingsScreen />} />;
}
