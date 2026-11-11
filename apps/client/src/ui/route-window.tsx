import { WindowConfirmation, type WindowConfirmationRequest } from './window-confirmation';
import { ConfirmActions, Stack, Text } from './primitives';
import { useGlobalSearchParams, useIsFocused, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';
import { BlurTargetView } from 'expo-blur';
import { AppDialog } from './app-dialog';
import { DialogBackground } from './dialog-background';
import { SuspendSheetAction } from './sheet-action';
import { WindowStepContext, type RouteWindowStep, type WindowStepHost } from './window-step';

export type { RouteWindowStep };
import { getRouteTrigger } from '../platform/overlays/route-trigger';
import { useDesktop } from './use-desktop';
import { useWorkspaceStore } from './workspace-state';

export function useRouteWindowClose(resource: 'tasks' | 'events' | 'notes' | 'recurrence-rules' | 'birthdays' | 'households' | 'settings') {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const desktop = useDesktop();
  const state = navigation.getState();
  const baseIndex = state?.routes.slice(0, state.index).reduce((found, route, index) => route.name.startsWith('households/[id]/') && (route.params as { id?: string } | undefined)?.id === id && !/\/(tasks|events|notes|recurrence-rules|birthdays)\/(new|\[)/.test(route.name) ? index : found, -1) ?? -1;
  const household = state?.routes.slice(0, state.index).filter(route => route.name.startsWith('households/[id]/') && (route.params as { id?: string } | undefined)?.id === id) ?? [];
  const hasBackground = resource === 'households' ? (state?.index ?? 0) > 0 : household.length > 0;
  /** The window opened over its own section's list, or drew that list itself for a direct link. */
  const top = household[household.length - 1];
  const overList = !top || top.name.startsWith(`households/[id]/${resource}/`);
  const close = useCallback(() => {
    if (desktop && baseIndex >= 0 && state) navigation.dispatch({ type: 'POP', payload: { count: state.index - baseIndex } });
    else if (hasBackground) router.back();
    else if (resource === 'households') router.replace('/household-handoff');
    else router.replace(`/households/${encodeURIComponent(id)}/${resource}`);
  }, [hasBackground, router, id, resource, desktop, baseIndex, state, navigation]);
  return { close, hasBackground, overList, background: top?.name };
}

/** Family content opens beside its list on a wide screen; account and setup windows stay centered. */
const DOCKED_RESOURCES: ReadonlySet<RouteWindowProps['resource']> = new Set(['tasks', 'events', 'notes', 'recurrence-rules', 'birthdays']);

/**
 * The item whose window is open above this page, so its row can be marked
 * while the window is docked beside the list.
 */
export function useOpenWindowItem(param: 'taskId' | 'eventId' | 'noteId' | 'ruleId'): string | undefined {
  const value = useGlobalSearchParams<Record<typeof param, string>>()[param];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Leaves an edit window for wherever it was opened from — the item's detail
 * window or the list whose card menu opened it. A direct link has nothing
 * behind it, so it lands on the item's detail window instead.
 */
export function useEditWindowExit(resource: 'tasks' | 'events' | 'notes', itemId: string | undefined) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { hasBackground } = useRouteWindowClose(resource);
  return useCallback(() => {
    if (hasBackground) router.back();
    else router.replace(`/households/${encodeURIComponent(id)}/${resource}/${encodeURIComponent(itemId ?? '')}`);
  }, [hasBackground, router, id, resource, itemId]);
}

/** A route owns the URL; AppDialog owns presentation and focus. Previous
 * transparent routes stay mounted; only the focused route presents a pane or modal. */
export interface RouteWindowProps {
  /** Only editors own draft guards; a read-only detail may have a saved draft. */
  draftPrefix?: string;
  title: string;
  busy?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  headerActions?: ReactNode;
  /** On the desktop pane, a quiet line shown in the header instead of the title, such as when a note was updated. */
  headerNote?: string;
  step?: RouteWindowStep | null;
  onClose?: () => void;
  onBackStep?: (() => void) | undefined;
  exitAllowed?: RefObject<boolean>;
  resource: 'tasks' | 'events' | 'notes' | 'recurrence-rules' | 'birthdays' | 'households' | 'settings';
  fallback: ReactNode;
  /** Confirmation-only routes use the compact centered window on every width. */
  size?: 'standard' | 'editor';
}

export function RouteWindow({ title, busy = false, children, footer, headerActions, headerNote, step: routeStep, onClose, onBackStep, exitAllowed, resource, fallback, size = 'editor', draftPrefix }: RouteWindowProps) {
  const focused = useIsFocused();
  const docked = (size === 'editor' || draftPrefix !== undefined) && DOCKED_RESOURCES.has(resource);
  const pane = useDesktop() && docked;
  const workspace = useWorkspaceStore();
  const confirmedSwitch = useRef(false);
  // Controls inside the content (pickers, option lists) open their own steps.
  const [ownedStep, setOwnedStep] = useState<{ owner: object; step: RouteWindowStep } | null>(null);
  const stepHost = useMemo<WindowStepHost>(() => ({
    show: (owner, next) => setOwnedStep({ owner, step: next }),
    hide: owner => setOwnedStep(current => current?.owner === owner ? null : current),
  }), []);
  const step = routeStep ?? ownedStep?.step ?? null;
  const previousStep = useRef(step);
  useEffect(() => {
    const previous = previousStep.current;
    previousStep.current = step;
    if (!previous || step) return;
    // Wait until the window has restored its normal content and initial focus.
    const frame = requestAnimationFrame(() => previous.onReturn?.());
    return () => cancelAnimationFrame(frame);
  }, [step]);
  const [confirmation, setConfirmation] = useState<WindowConfirmationRequest | null>(null);
  const confirmationRef = useRef(confirmation);
  confirmationRef.current = confirmation;
  const navigation = useNavigation();
  const { close: dismiss, hasBackground, overList, background: backgroundRoute } = useRouteWindowClose(resource);
  // Beside Today a note takes the room of 待办 and 接下来, which Today folds away for it.
  const besideToday = resource === 'notes' && backgroundRoute === 'households/[id]/today';
  const trigger = useRef(getRouteTrigger());
  const background = useRef<View>(null);
  const parentBackground = useContext(DialogBackground);
  const close = useCallback(() => {
    if (busy) return;
    if (confirmation) { setConfirmation(null); return; }
    if (step) { step.onClose(); return; }
    if (onClose) onClose();
    else dismiss();
  }, [busy, confirmation, step, onClose, dismiss]);
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !busy });
    return navigation.addListener('beforeRemove', event => {
      if (confirmedSwitch.current) { confirmedSwitch.current = false; return; }
      if (exitAllowed?.current) return;
      const target = event.data.action.payload as { name?: string; params?: Record<string, unknown> } | undefined;
      const targetId = target?.params?.taskId ?? target?.params?.eventId ?? target?.params?.noteId ?? target?.params?.ruleId ?? (target?.name?.endsWith('/new') ? 'new' : undefined);
      const switchingItem = targetId !== undefined && targetId !== draftPrefix?.split(':')[3];
      if (pane && draftPrefix && switchingItem && event.data.action.type === 'REPLACE' && workspace.hasDrafts(draftPrefix) && !busy && !step && !onBackStep) {
        event.preventDefault();
        setConfirmation({ title: '切换条目？', message: '当前修改还没有保存。草稿会保留，之后可以继续编辑。', confirmLabel: '保留草稿并切换', onConfirm: () => { confirmedSwitch.current = true; navigation.dispatch(event.data.action); } });
        return;
      }
      if (busy || confirmationRef.current || step || onBackStep) {
        event.preventDefault();
        if (!busy) {
          if (confirmationRef.current) setConfirmation(null);
          else if (step) step.onClose();
          else onBackStep?.();
        }
      }
    });
  }, [navigation, busy, confirmation, step, onBackStep, exitAllowed, pane, workspace, draftPrefix]);
  return (
    <DialogBackground.Provider value={hasBackground ? parentBackground : background}>
      <BlurTargetView ref={background} style={{ flex: 1 }} pointerEvents={pane && hasBackground ? 'none' : focused ? 'auto' : 'none'}>
        {!hasBackground ? fallback : null}
      </BlurTargetView>
      {focused ? <AppDialog title={confirmation?.title ?? step?.title ?? title} busy={busy} onClose={close} trigger={trigger} size={step || confirmation ? 'standard' : size} docked={docked} reading={resource === 'notes' && overList} wide={besideToday} headerActions={confirmation || step ? null : headerActions} {...(headerNote && !confirmation && !step ? { headerNote } : {})} {...(footer === undefined || confirmation || step ? {} : { footer })}>
        <WindowConfirmation.Provider value={setConfirmation}>
          {confirmation ? <Stack gap={3}>
            <Text>{confirmation.message}</Text>
            <ConfirmActions cancelLabel="继续编辑" confirmLabel={confirmation.confirmLabel} destructive={confirmation.destructive ?? false} busy={busy} onCancel={() => setConfirmation(null)} onConfirm={() => { const request = confirmation; confirmationRef.current = null; setConfirmation(null); request.onConfirm(); }} />
          </Stack> : <>
            {/* Keep the editor mounted while a step owns focus. */}
            <View style={step ? { display: 'none' } : undefined} aria-hidden={Boolean(step)} importantForAccessibility={step ? 'no-hide-descendants' : 'auto'}>
              <WindowStepContext.Provider value={stepHost}><SuspendSheetAction suspended={Boolean(step)}>{children}</SuspendSheetAction></WindowStepContext.Provider>
            </View>
            <WindowStepContext.Provider value={null}>{step?.content}</WindowStepContext.Provider>
          </>}
        </WindowConfirmation.Provider>
      </AppDialog> : null}
    </DialogBackground.Provider>
  );
}
