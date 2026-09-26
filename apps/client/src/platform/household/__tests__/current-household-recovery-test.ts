import * as SecureStore from 'expo-secure-store';

import { createNativeCurrentHouseholdStore } from '../current-household.native';

describe('native household and invitation recovery stores', () => {
  test('hydrates the persisted current household and valid access timestamps after restart', async () => {
    await SecureStore.setItemAsync('muchakucha:currentHouseholdId', 'household-b');
    await SecureStore.setItemAsync(
      'muchakucha:householdAccessTimestamps',
      JSON.stringify({
        'household-a': 100,
        'household-b': 200,
        invalid: 'not-a-number',
        infinite: Number.POSITIVE_INFINITY,
      }),
    );
    const store = createNativeCurrentHouseholdStore();

    expect(store.getCurrentId()).toBeNull();
    await store.hydrate();

    expect(store.getCurrentId()).toBe('household-b');
    expect(store.getAccessTimestamps()).toEqual({
      'household-a': 100,
      'household-b': 200,
    });
  });

});
