import { RouteWindow, useRouteWindowClose, type RouteWindowProps } from '../../ui/route-window';
import TaskListScreen from './task-list-screen';

export function useTaskWindowClose() { return useRouteWindowClose('tasks'); }
export function TaskWindow(props: Omit<RouteWindowProps, 'resource' | 'fallback'>) {
  return <RouteWindow {...props} resource="tasks" fallback={<TaskListScreen />} />;
}
