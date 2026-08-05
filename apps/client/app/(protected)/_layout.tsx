import { Stack } from 'expo-router';
import React, { useMemo } from 'react';
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

  return (
    <View style={styles.container}>
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
    </View>
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
      React.createElement(Stack, { screenOptions: { headerShown: false } }),
    ),
  );
}
