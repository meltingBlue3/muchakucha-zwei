import * as SecureStore from 'expo-secure-store';

import { createNativeCurrentHouseholdStore } from '../current-household.native';

describe('native household and invitation recovery stores', () => {
  test('a household chosen before the app closes is current again after restart', async () => {
    const before = createNativeCurrentHouseholdStore();
    await before.hydrate();
    await before.setCurrentId('household-b');
    await before.setAccessTimestamps({ 'household-a': 100, 'household-b': 200 });

    const after = createNativeCurrentHouseholdStore();
    expect(after.getCurrentId()).toBeNull();
    await after.hydrate();

    expect(after.getCurrentId()).toBe('household-b');
    expect(after.getAccessTimestamps()).toEqual({ 'household-a': 100, 'household-b': 200 });
  });

  test('drops access timestamps that are not finite numbers', async () => {
    const before = createNativeCurrentHouseholdStore();
    await before.hydrate();
    await before.setAccessTimestamps({ 'household-a': 100 });
    const [[timestampsKey]] = (SecureStore.setItemAsync as jest.Mock).mock.calls as [[string, string]];
    await SecureStore.setItemAsync(timestampsKey, JSON.stringify({
      'household-a': 100,
      invalid: 'not-a-number',
      infinite: Number.POSITIVE_INFINITY,
    }));

    const after = createNativeCurrentHouseholdStore();
    await after.hydrate();

    expect(after.getAccessTimestamps()).toEqual({ 'household-a': 100 });
  });
});
