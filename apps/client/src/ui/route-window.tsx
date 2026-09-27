import { WindowConfirmation, type WindowConfirmationRequest } from './window-confirmation';
import { Button, Stack, Text } from './primitives';
import { useIsFocused, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';
import { BlurTargetView } from 'expo-blur';
import { AppDialog } from './app-dialog';
import { DialogBackground } from './dialog-background';
import { SuspendSheetAction } from './sheet-action';
import { WindowStepContext, type RouteWindowStep, type WindowStepHost } from './window-step';

export type { RouteWindowStep };
import { getRouteTrigger } from '../platform/overlays/route-trigger';

export function useRouteWindowClose(resource: 'tasks' | 'events' | 'notes' | 'recurrence-rules' | 'households' | 'settings') {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const state = navigation.getState();
  const hasBackground = state?.routes.slice(0, state.index).some(route =>
    resource === 'households' || (route.name.startsWith('households/[id]/') &&
    (route.params as { id?: string } | undefined)?.id === id),
  ) ?? false;
  const close = useCallback(() => {
    if (hasBackground) router.back();
    else if (resource === 'households') router.replace('/household-handoff');
    else router.replace(`/households/${encodeURIComponent(id)}/${resource}`);
  }, [hasBackground, router, id, resource]);
  return { close, hasBackground };
}

/** A route owns the URL; the dialog owns presentation and focus. Previous
 * transparent routes stay mounted, but only the focused route opens a modal. */
export interface RouteWindowProps {
  title: string;
  busy?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  headerActions?: ReactNode;
  step?: RouteWindowStep | null;
  onClose?: () => void;
  onBackStep?: (() => void) | undefined;
  exitAllowed?: RefObject<boolean>;
  resource: 'tasks' | 'events' | 'notes' | 'recurrence-rules' | 'households' | 'settings';
  fallback: ReactNode;
}

export function RouteWindow({ title, busy = false, children, footer, headerActions, step: routeStep, onClose, onBackStep, exitAllowed, resource, fallback }: RouteWindowProps) {
  const focused = useIsFocused();
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
  const { close: dismiss, hasBackground } = useRouteWindowClose(resource);
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
      if (exitAllowed?.current) return;
      if (busy || confirmationRef.current || step || onBackStep) {
        event.preventDefault();
        if (!busy) {
          if (confirmationRef.current) setConfirmation(null);
          else if (step) step.onClose();
          else onBackStep?.();
        }
      }
    });
  }, [navigation, busy, confirmation, step, onBackStep, exitAllowed]);
  return (
    <DialogBackground.Provider value={hasBackground ? parentBackground : background}>
      <BlurTargetView ref={background} style={{ flex: 1 }} pointerEvents={focused ? 'auto' : 'none'}>
        {!hasBackground ? fallback : null}
      </BlurTargetView>
      {focused ? <AppDialog title={confirmation?.title ?? step?.title ?? title} busy={busy} onClose={close} trigger={trigger} size={step ? 'standard' : 'editor'} headerActions={confirmation || step ? null : headerActions} {...(footer === undefined || confirmation || step ? {} : { footer })}>
        <WindowConfirmation.Provider value={setConfirmation}>
          {confirmation ? <Stack gap={3}>
            <Text>{confirmation.message}</Text>
            <Button label="继续编辑" tone="secondary" disabled={busy} onPress={() => setConfirmation(null)} />
            <Button label={confirmation.confirmLabel} disabled={busy} onPress={() => { const request = confirmation; confirmationRef.current = null; setConfirmation(null); request.onConfirm(); }} />
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
