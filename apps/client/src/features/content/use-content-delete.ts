import { useSyncExternalStore } from 'react';
import { useRouter } from 'expo-router';
import { sessionStateStore } from '../auth/session-runtime';
import { useHouseholdContext } from '../households/household-context';
import { rememberRouteTrigger } from '../../platform/overlays/route-trigger';

export type DeletableResource = 'tasks' | 'events' | 'notes';
export function canDeleteContent(role: string | undefined, actorId: string | undefined, createdBy: string): boolean {
  return role !== undefined && (role === 'OWNER' || role === 'ADMIN' || (role === 'MEMBER' && actorId === createdBy));
}

/** Whether the signed-in person may delete this content now: owners and admins anything, members what they created. */
export function useCanDeleteContent() {
  const { households, viewState } = useHouseholdContext();
  const session = useSyncExternalStore(sessionStateStore.subscribe, sessionStateStore.get, sessionStateStore.get);
  const actorId = session.kind === 'authenticated' ? session.session.currentUser?.id : undefined;
  return (content: { householdId: string; createdBy: string }): boolean => {
    const role = households.find(household => household.id === content.householdId)?.role;
    return viewState === 'ready' && canDeleteContent(role, actorId, content.createdBy);
  };
}

/** Callers pass the optional action to the card; the card remains presentational. */
export function useContentDelete(resource: DeletableResource) {
  const router = useRouter();
  const canDelete = useCanDeleteContent();
  return (content: { id: string; householdId: string; createdBy: string }): (() => void) | undefined => {
    if (!canDelete(content)) return undefined;
    return () => {
      rememberRouteTrigger();
      router.push(`/households/${encodeURIComponent(content.householdId)}/${resource}/${encodeURIComponent(content.id)}/delete`);
    };
  };
}

/** Any member may edit shared content, so cards always offer it while the household is usable. */
export function useContentEdit(resource: DeletableResource) {
  const router = useRouter();
  const { viewState } = useHouseholdContext();
  return (content: { id: string; householdId: string }): (() => void) | undefined => {
    if (viewState !== 'ready') return undefined;
    return () => {
      rememberRouteTrigger();
      router.push(`/households/${encodeURIComponent(content.householdId)}/${resource}/${encodeURIComponent(content.id)}/edit`);
    };
  };
}
