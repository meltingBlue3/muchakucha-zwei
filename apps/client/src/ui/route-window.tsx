import { WindowConfirmation, type WindowConfirmationRequest } from './window-confirmation';
import { Button, Stack, Text } from './primitives';
import { useIsFocused, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';
import { BlurTargetView } from 'expo-blur';
import { AppDialog } from './app-dialog';
import { DialogBackground } from './dialog-background';
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
  onClose?: () => void;
  onBackStep?: (() => void) | undefined;
  exitAllowed?: RefObject<boolean>;
  resource: 'tasks' | 'events' | 'notes' | 'recurrence-rules' | 'households' | 'settings';
  fallback: ReactNode;
}

export function RouteWindow({ title, busy = false, children, footer, onClose, onBackStep, exitAllowed, resource, fallback }: RouteWindowProps) {
  const focused = useIsFocused();
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
    if (onClose) onClose();
    else dismiss();
  }, [busy, confirmation, onClose, dismiss]);
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !busy });
    return navigation.addListener('beforeRemove', event => {
      if (exitAllowed?.current) return;
      if (busy || confirmationRef.current || onBackStep) {
        event.preventDefault();
        if (!busy) {
          if (confirmationRef.current) setConfirmation(null);
          else onBackStep?.();
        }
      }
    });
  }, [navigation, busy, confirmation, onBackStep, exitAllowed]);
  return (
    <DialogBackground.Provider value={hasBackground ? parentBackground : background}>
      <BlurTargetView ref={background} style={{ flex: 1 }} pointerEvents={focused ? 'auto' : 'none'}>
        {!hasBackground ? fallback : null}
      </BlurTargetView>
      {focused ? <AppDialog title={confirmation?.title ?? title} busy={busy} onClose={close} trigger={trigger} size="editor" {...(footer === undefined || confirmation ? {} : { footer })}>
        <WindowConfirmation.Provider value={setConfirmation}>
          {confirmation ? <Stack gap={3}>
            <Text>{confirmation.message}</Text>
            <Button label="继续编辑" tone="secondary" disabled={busy} onPress={() => setConfirmation(null)} />
            <Button label={confirmation.confirmLabel} disabled={busy} onPress={() => { const request = confirmation; confirmationRef.current = null; setConfirmation(null); request.onConfirm(); }} />
          </Stack> : children}
        </WindowConfirmation.Provider>
      </AppDialog> : null}
    </DialogBackground.Provider>
  );
}
