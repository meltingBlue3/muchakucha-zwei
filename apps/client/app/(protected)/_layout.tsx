import { Stack } from 'expo-router';
import React, { useMemo } from 'react';

import { sessionApiClient, sessionTransport } from '../../src/features/auth/session-runtime';
import { createHouseholdProvider, useHouseholdContext } from '../../src/features/households/household-context';
import { AppShell } from '../../src/ui/household-components';
import { Spinner, Text, Stack as UIStack } from '../../src/ui/primitives';

function ResolvingGate({ children }: { children: React.ReactNode }) {
  const { viewState } = useHouseholdContext();

  if (viewState === 'resolving') {
    return (
      <AppShell accessibilityLabel="正在加载家庭">
        <UIStack accessibilityLabel="正在加载家庭列表" gap={6} style={{ alignItems: 'center', paddingTop: 48 }}>
          <Spinner label="正在加载家庭" />
          <Text variant="bodySm">正在加载家庭列表</Text>
        </UIStack>
      </AppShell>
    );
  }

  return <>{children}</>;
}

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
