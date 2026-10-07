import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo } from 'react';

import { sessionApiClient, sessionTransport } from '../auth/session-runtime';
import { useHouseholdContext } from '../households/household-context';
import { HouseholdScreen } from '../households/household-screen';
import { HouseholdSettings } from '../households/household-settings';

export default function HouseholdSettingsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { viewState, households, currentHouseholdId, enterAccessChanged, applyHouseholdName } = useHouseholdContext();

  const householdId = id ?? currentHouseholdId ?? '';
  const householdName = households.find((h) => h.id === householdId)?.name ?? '';

  const deps = useMemo(
    () => ({
      householdApi: sessionApiClient,
      getAccessToken: () => sessionTransport.getAccessToken(),
    }),
    [],
  );

  const handleAccessChanged = useCallback((lostHouseholdName: string) => {
    enterAccessChanged(lostHouseholdName, householdId || undefined);
  }, [enterAccessChanged, householdId]);

  // The frame shows the access-changed and not-found states; settings never load for them.
  if (viewState === 'accessChanged' || householdId === '') {
    return <HouseholdScreen active="settings" subpage accessibilityLabel="家庭设置">{null}</HouseholdScreen>;
  }

  return (
    <HouseholdSettings
      deps={deps}
      householdId={householdId}
      householdName={householdName}
      onRenameAccessChanged={handleAccessChanged}
      onRenamed={(name) => applyHouseholdName(householdId, name)}
      showRename
      onInviteAccessChanged={handleAccessChanged}
      showInvite
      frame={(accessibilityLabel, content) => (
        <HouseholdScreen active="settings" subpage accessibilityLabel={accessibilityLabel}>{content}</HouseholdScreen>
      )}
    />
  );
}
