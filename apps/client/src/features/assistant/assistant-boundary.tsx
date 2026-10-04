import type { ReactNode } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useHouseholdContext } from '../households/household-context';
import { AccessChangedPanel, AppShell } from '../../ui/household-components';
import { Button, EmptyState, LoadingState } from '../../ui/primitives';

export interface AssistantHouseholdProps { householdId: string; householdName: string; writable: boolean }

/** Unmount all private assistant state during household transitions or access loss. */
export function AssistantBoundary({ children }: { children: (props: AssistantHouseholdProps) => ReactNode }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const context = useHouseholdContext();
  const household = context.households.find(item => item.id === id);
  if (context.viewState === 'accessChanged') return <AppShell accessibilityLabel="家庭访问权已变化"><AccessChangedPanel
    hasOtherHouseholds={context.households.length > 0}
    {...(context.accessChangedHouseholdName === undefined ? {} : { householdName: context.accessChangedHouseholdName })}
    onChooseOther={() => { void context.refreshHouseholds().then(() => router.replace('/households')); }}
    onCreateNew={() => router.replace('/household-handoff')}
  /></AppShell>;
  if (context.viewState === 'resolving') return <AppShell accessibilityLabel="正在加载家庭"><LoadingState label="正在加载家庭" /></AppShell>;
  if (!household || context.viewState === 'noHousehold') return <AppShell title="助手" showBack accessibilityLabel="助手不可用"><EmptyState
    message="请先选择你已加入的家庭。"
    action={<Button label="选择家庭" onPress={() => router.replace('/households')} />}
  /></AppShell>;
  return children({ householdId: household.id, householdName: household.name, writable: context.viewState === 'ready' });
}

export function assistantPath(householdId: string): `/households/${string}/assistant` {
  return `/households/${encodeURIComponent(householdId)}/assistant`;
}
