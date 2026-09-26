import { draftWorkspace } from '../../src/ui/workspace-runtime';
import { WorkspaceStateProvider } from '../../src/ui/workspace-state';
import { Stack } from 'expo-router';
import React, { useMemo, useRef } from 'react';
import { BlurTargetView } from 'expo-blur';
import { DialogBackground } from '../../src/ui/dialog-background';
import { StyleSheet, View } from 'react-native';

import { sessionApiClient, sessionTransport } from '../../src/features/auth/session-runtime';
import { createHouseholdProvider, useHouseholdContext } from '../../src/features/households/household-context';
import { AppShell } from '../../src/ui/household-components';
import { Spinner, Text, Stack as UIStack } from '../../src/ui/primitives';
import { theme } from '../../src/ui/theme';

/**
 * Renders children (the Stack navigator) at all times so the navigation
 * tree stays mounted. When household context is resolving, an opaque
 * overlay is shown on top — this prevents the Stack from unmounting and
 * losing navigation state during household switches.
 */
function ResolvingGate({ children }: { children: React.ReactNode }) {
  const { viewState } = useHouseholdContext();
  const blurTarget = useRef<View>(null);

  return (
    <DialogBackground.Provider value={blurTarget}>
    <BlurTargetView ref={blurTarget} style={styles.container}>
      {/* Always keep the Stack mounted so expo-router state survives
          household switches and refreshes. */}
      {children}
      {viewState === 'resolving' ? (
        <View style={styles.overlay}>
          <AppShell accessibilityLabel="正在加载家庭">
            <UIStack
              accessibilityLabel="正在加载家庭列表"
              gap={6}
              style={styles.spinnerContainer}
            >
              <Spinner label="正在加载家庭" />
              <Text variant="bodySm">正在加载家庭列表</Text>
            </UIStack>
          </AppShell>
        </View>
      ) : null}
    </BlurTargetView>
    </DialogBackground.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.colors.canvas,
    zIndex: 10,
    elevation: 10,
  },
  spinnerContainer: {
    alignItems: 'center',
    paddingTop: 48,
  },
});

export default function ProtectedLayout() {
  const getAccessToken = useMemo(
    () => () => sessionTransport.getAccessToken(),
    [],
  );

  const HouseholdProvider = useMemo(
    () => createHouseholdProvider(
      sessionApiClient,
      getAccessToken,
    ),
    [getAccessToken],
  );

  return React.createElement(
    HouseholdProvider,
    null,
    React.createElement(
      ResolvingGate,
      null,
      React.createElement(WorkspaceStateProvider, { store: draftWorkspace }, React.createElement(Stack, { screenOptions: { headerShown: false } },
        ...['households/[id]/tasks/new', 'households/[id]/tasks/[taskId]/index', 'households/[id]/tasks/[taskId]/edit', 'households/[id]/tasks/[taskId]/delete', 'households/[id]/events/new', 'households/[id]/events/[eventId]/index', 'households/[id]/events/[eventId]/edit', 'households/[id]/events/[eventId]/delete', 'households/[id]/notes/new', 'households/[id]/notes/[noteId]/index', 'households/[id]/notes/[noteId]/edit', 'households/[id]/notes/[noteId]/delete', 'households/new', 'households/[id]/recurrence-rules/[ruleId]/index', 'households/[id]/members/[membershipId]/remove', 'households/[id]/members/[membershipId]/role', 'households/[id]/ownership/transfer', 'households/[id]/ownership/leave', 'households/[id]/leave', 'households/[id]/invitations/[invitationId]/revoke'].map(name =>
          React.createElement(Stack.Screen, { key: name, name, options: { presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } } }),
        ),
      )),
    ),
  );
}
