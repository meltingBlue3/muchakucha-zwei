import { WindowConfirmation, type WindowConfirmationRequest } from './window-confirmation';
import { ConfirmActions, Stack, Text } from './primitives';
import { useGlobalSearchParams, useIsFocused, useLocalSearchParams, useNavigation, useRoute, useRouter } from 'expo-router';
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { BlurTargetView } from 'expo-blur';
import { AppDialog } from './app-dialog';
import { DialogBackground } from './dialog-background';
import { SuspendSheetAction } from './sheet-action';
import { theme } from './theme';
import { WindowStepContext, type RouteWindowStep, type WindowStepHost } from './window-step';

export type { RouteWindowStep };
import { getRouteTrigger } from '../platform/overlays/route-trigger';
import { focusOverlayControl } from '../platform/overlays/overlay-focus';
import { useDesktop } from './use-desktop';
import { useWorkspaceStore } from './workspace-state';
import { UnsavedSwitchDialog } from './unsaved-switch-dialog';
import { useTranslation } from '../i18n';

/** 总览 pages show items of several households; any of their windows may open above them. */
const isOverviewPage = (name: string) => name === 'overview/today' || name === 'overview/events' || name === 'overview/tasks';

export function useRouteWindowClose(resource: 'tasks' | 'events' | 'notes' | 'recurrence-rules' | 'birthdays' | 'households' | 'settings') {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { key } = useRoute();
  const navigation = useNavigation();
  const router = useRouter();
  const desktop = useDesktop();
  const state = navigation.getState();
  // A retained detail still owns its fallback list when the editor is focused.
  const routeIndex = state?.routes.findIndex(route => route.key === key) ?? -1;
  const previousRoutes = state?.routes.slice(0, Math.max(0, routeIndex)) ?? [];
  // A page of this household, or a 总览 page, which shows every household's items.
  const behind = (route: { name: string; params?: object | undefined }) => isOverviewPage(route.name) || (route.name.startsWith('households/[id]/') && (route.params as { id?: string } | undefined)?.id === id);
  const baseIndex = previousRoutes.reduce((found, route, index) => behind(route) && !/\/(tasks|events|notes|recurrence-rules|birthdays)\/(new|\[)/.test(route.name) ? index : found, -1);
  const household = previousRoutes.filter(behind);
  const hasBackground = resource === 'households' ? previousRoutes.length > 0 : household.length > 0;
  /** The window opened over its own section's list, or drew that list itself for a direct link. */
  const top = household[household.length - 1];
  const overList = !top || top.name.startsWith(`households/[id]/${resource}/`) || top.name === `overview/${resource}`;
  const close = useCallback(() => {
    if (desktop && baseIndex >= 0) navigation.dispatch({ type: 'POP', payload: { count: routeIndex - baseIndex } });
    else if (hasBackground) router.back();
    else if (resource === 'households') router.replace('/household-handoff');
    else router.replace(`/households/${encodeURIComponent(id)}/${resource}`);
  }, [hasBackground, router, id, resource, desktop, baseIndex, routeIndex, navigation]);
  return { close, hasBackground, overList, background: top?.name };
}

/** Family content opens beside its list on a wide screen; account and setup windows stay centered. */
const DOCKED_RESOURCES: ReadonlySet<RouteWindowProps['resource']> = new Set(['tasks', 'events', 'notes', 'recurrence-rules', 'birthdays']);

/**
 * The item whose window is open above this page, so its row can be marked
 * while the window is docked beside the list.
 */
export function useOpenWindowItem(param: 'taskId' | 'eventId' | 'noteId' | 'ruleId'): string | undefined {
  const desktop = useDesktop();
  const value = useGlobalSearchParams<Record<typeof param, string>>()[param];
  return desktop && typeof value === 'string' ? value : undefined;
}

/**
 * Leaves an edit window for wherever it was opened from — the item's detail
 * window or the list whose card menu opened it. A direct link has nothing
 * behind it, so it lands on the item's detail window instead.
 */
export function useEditWindowExit(resource: 'tasks' | 'events' | 'notes' | 'recurrence-rules', itemId: string | undefined) {
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
type CenteredConfirmation = RouteWindowStep & { trigger: RefObject<View | null> };

export interface RouteWindowProps {
  /** Only editors own draft guards; a read-only detail may have a saved draft. */
  draftPrefix?: string;
  title: string;
  busy?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  /** Desktop pane only: an action such as 删除 at the left of the form's footer; dropped while a step or confirmation shows. */
  footerStart?: ReactNode;
  headerActions?: ReactNode;
  /** On the desktop pane, a quiet line shown in the header instead of the title, such as when a note was updated. */
  headerNote?: string;
  step?: RouteWindowStep | null;
  centeredConfirmation?: CenteredConfirmation | undefined;
  preferCancel?: boolean;
  onClose?: () => void;
  onBackStep?: (() => void) | undefined;
  exitAllowed?: RefObject<boolean>;
  resource: 'tasks' | 'events' | 'notes' | 'recurrence-rules' | 'birthdays' | 'households' | 'settings';
  fallback: ReactNode;
  /** Confirmation-only routes use the compact centered window on every width. */
  size?: 'standard' | 'editor';
  fillContent?: boolean;
}

export function RouteWindow({ title, busy = false, children, footer, footerStart, headerActions, headerNote, step: routeStep, centeredConfirmation, preferCancel = false, onClose, onBackStep, exitAllowed, resource, fallback, size = 'editor', draftPrefix, fillContent = false }: RouteWindowProps) {
  const { t } = useTranslation('common');
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
  // The one further step a step that `hostsStep` may open.
  const [innerOwned, setInnerOwned] = useState<{ owner: object; step: RouteWindowStep } | null>(null);
  const innerHost = useMemo<WindowStepHost>(() => ({
    show: (owner, next) => setInnerOwned({ owner, step: next }),
    hide: owner => setInnerOwned(current => current?.owner === owner ? null : current),
  }), []);
  const inlineConfirmation = pane ? undefined : centeredConfirmation;
  const overlayConfirmation = pane ? centeredConfirmation : undefined;
  const baseStep = inlineConfirmation ?? routeStep ?? ownedStep?.step ?? null;
  const innerStep = baseStep?.hostsStep ? innerOwned?.step ?? null : null;
  const step = innerStep ?? baseStep;
  const previousStep = useRef(step);
  const previousInner = useRef(innerStep);
  const previousConfirmationTrigger = useRef(inlineConfirmation?.trigger);
  useEffect(() => {
    const previous = previousStep.current;
    const previousTrigger = previousConfirmationTrigger.current;
    const leftInner = previousInner.current !== null && innerStep === null;
    previousStep.current = step;
    previousInner.current = innerStep;
    previousConfirmationTrigger.current = inlineConfirmation?.trigger;
    // Back to the window's content, or from a step's own step back to that step.
    if (!previous || (step && !leftInner)) return;
    // Wait until the window has restored its normal content and initial focus.
    const frame = requestAnimationFrame(() => {
      previous.onReturn?.();
      if (previousTrigger) focusOverlayControl(previousTrigger.current);
    });
    return () => cancelAnimationFrame(frame);
  }, [step, innerStep, inlineConfirmation?.trigger]);
  const [confirmation, setConfirmation] = useState<WindowConfirmationRequest | null>(null);
  const confirmationRef = useRef(confirmation);
  confirmationRef.current = confirmation;
  // Leaving unsaved changes for another item in the list: asked in a dialog of its own, over the pane.
  const [pendingSwitch, setPendingSwitch] = useState<{ go(): void } | null>(null);
  const pendingSwitchRef = useRef(pendingSwitch);
  pendingSwitchRef.current = pendingSwitch;
  const navigation = useNavigation();
  const { close: dismiss, hasBackground, overList, background: backgroundRoute } = useRouteWindowClose(resource);
  const backgroundInteractive = pane ? !hasBackground : focused;
  // Beside Today a note takes the room of 待办 and 接下来, which Today folds away for it.
  const besideToday = resource === 'notes' && (backgroundRoute === 'households/[id]/today' || backgroundRoute === 'overview/today');
  const trigger = useRef(getRouteTrigger());
  const background = useRef<View>(null);
  const parentBackground = useContext(DialogBackground);
  const close = useCallback(() => {
    if (busy) return;
    if (centeredConfirmation) { centeredConfirmation.onClose(); return; }
    if (confirmation) { setConfirmation(null); return; }
    if (step) { step.onClose(); return; }
    if (onClose) onClose();
    else dismiss();
  }, [busy, centeredConfirmation, confirmation, step, onClose, dismiss]);
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !busy });
    return navigation.addListener('beforeRemove', event => {
      if (confirmedSwitch.current) { confirmedSwitch.current = false; return; }
      if (exitAllowed?.current) return;
      const target = event.data.action.payload as { name?: string; params?: Record<string, unknown> } | undefined;
      const targetId = target?.params?.taskId ?? target?.params?.eventId ?? target?.params?.noteId ?? target?.params?.ruleId ?? (target?.name?.endsWith('/new') ? 'new' : undefined);
      const switchingItem = targetId !== undefined && targetId !== draftPrefix?.split(':')[3];
      if (pane && draftPrefix && switchingItem && event.data.action.type === 'REPLACE' && workspace.hasDrafts(draftPrefix) && !busy && !centeredConfirmation && !step && !onBackStep) {
        event.preventDefault();
        if (!pendingSwitchRef.current) setPendingSwitch({ go: () => { confirmedSwitch.current = true; navigation.dispatch(event.data.action); } });
        return;
      }
      if (busy || centeredConfirmation || pendingSwitchRef.current || confirmationRef.current || step || onBackStep) {
        event.preventDefault();
        if (!busy) {
          if (centeredConfirmation) centeredConfirmation.onClose();
          else if (pendingSwitchRef.current) setPendingSwitch(null);
          else if (confirmationRef.current) setConfirmation(null);
          else if (step) step.onClose();
          else onBackStep?.();
        }
      }
    });
  }, [navigation, busy, centeredConfirmation, confirmation, step, onBackStep, exitAllowed, pane, workspace, draftPrefix]);
  const { width } = useWindowDimensions();
  const phoneSheet = !pane && size === 'editor' && width < theme.layout.editorSheetBreakpoint;
  const confirmationContent = confirmation ? (
    <Stack gap={3}>
      <Text>{confirmation.message}</Text>
      <ConfirmActions cancelLabel={t('continueEditing')} confirmLabel={confirmation.confirmLabel} destructive={confirmation.destructive ?? false} busy={busy} onCancel={() => setConfirmation(null)} onConfirm={() => { const request = confirmation; confirmationRef.current = null; setConfirmation(null); request.onConfirm(); }} />
    </Stack>
  ) : null;
  const stepContent = baseStep ? (
    <>
      {/* A step stays mounted, in the same place, while its own step is shown. */}
      <View style={innerStep ? { display: 'none' } : undefined} aria-hidden={Boolean(innerStep)} importantForAccessibility={innerStep ? 'no-hide-descendants' : 'auto'}>
        <WindowStepContext.Provider value={baseStep.hostsStep ? innerHost : null}>{baseStep.content}</WindowStepContext.Provider>
      </View>
      <WindowStepContext.Provider value={null}>{innerStep?.content}</WindowStepContext.Provider>
    </>
  ) : null;
  // On a phone's full-screen sheet, steps and confirmations float centered over the blurred sheet
  // instead of collapsing the sheet away to reveal the underlying list (and hiding any WebView).
  const sheetOverlay = phoneSheet && (confirmation !== null || step !== null) ? {
    title: confirmation?.title ?? step!.title,
    preferCancel: confirmation !== null || inlineConfirmation !== undefined,
    content: <WindowConfirmation.Provider value={setConfirmation}>{confirmationContent ?? stepContent}</WindowConfirmation.Provider>,
  } : null;
  const replaceInDialog = !sheetOverlay && (confirmation !== null || step !== null);

  return (
    <DialogBackground.Provider value={hasBackground ? parentBackground : background}>
      <BlurTargetView ref={background} style={{ flex: 1 }} pointerEvents={backgroundInteractive ? 'auto' : 'none'}>
        {!hasBackground ? fallback : null}
      </BlurTargetView>
      {focused ? <AppDialog title={replaceInDialog ? (confirmation?.title ?? step?.title ?? title) : title} busy={busy} onClose={close} trigger={trigger} size={replaceInDialog ? 'standard' : size} docked={docked && !inlineConfirmation} preferCancel={replaceInDialog ? (preferCancel || inlineConfirmation !== undefined) : preferCancel} reading={resource === 'notes' && overList} wide={besideToday} fillContent={fillContent && !replaceInDialog} headerActions={replaceInDialog ? null : headerActions} {...(headerNote && !replaceInDialog ? { headerNote } : {})} {...(footer === undefined || replaceInDialog ? {} : { footer })} {...(footerStart === undefined || replaceInDialog ? {} : { footerStart })} overlay={sheetOverlay}>
        <WindowConfirmation.Provider value={setConfirmation}>
          {replaceInDialog && confirmationContent ? confirmationContent : <>
            {/* Keep the editor mounted while a step owns focus. */}
            <View style={replaceInDialog && step ? { display: 'none' } : fillContent ? { flex: 1 } : undefined} aria-hidden={Boolean(replaceInDialog && step)} importantForAccessibility={replaceInDialog && step ? 'no-hide-descendants' : 'auto'}>
              <WindowStepContext.Provider value={stepHost}><SuspendSheetAction suspended={Boolean(replaceInDialog && step)}>{children}</SuspendSheetAction></WindowStepContext.Provider>
            </View>
            {!sheetOverlay ? stepContent : null}
          </>}
        </WindowConfirmation.Provider>
      </AppDialog> : null}
      {focused && overlayConfirmation ? <AppDialog title={overlayConfirmation.title} busy={busy} onClose={overlayConfirmation.onClose} trigger={overlayConfirmation.trigger} preferCancel>
        {overlayConfirmation.content}
      </AppDialog> : null}
      {focused && pendingSwitch ? <UnsavedSwitchDialog onKeepEditing={() => setPendingSwitch(null)} onSwitch={() => { const request = pendingSwitch; pendingSwitchRef.current = null; setPendingSwitch(null); request.go(); }} /> : null}
    </DialogBackground.Provider>
  );
}
