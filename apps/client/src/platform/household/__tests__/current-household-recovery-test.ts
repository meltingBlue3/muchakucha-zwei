import * as SecureStore from 'expo-secure-store';

import { createNativeCurrentHouseholdStore } from '../current-household.native';
import { createNativePendingInvitationStore } from '../../invitation/pending-invitation.native';

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

  test('restores and clears a pending invitation across store instances', async () => {
    const first = createNativePendingInvitationStore();
    await first.set('pending-token');

    const afterRestart = createNativePendingInvitationStore();
    await expect(afterRestart.get()).resolves.toBe('pending-token');
    await afterRestart.clear();
    await expect(first.get()).resolves.toBeNull();
  });

  test('preserves invitations across login with native SecureStore key validation', async () => {
    const originalSet = jest.mocked(SecureStore.setItemAsync).getMockImplementation()!;
    jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value, options) => {
      if (!/^[\w.-]+$/.test(key)) throw new Error('Invalid SecureStore key');
      return originalSet(key, value, options);
    });
    try {
      await createNativePendingInvitationStore().set('invitation-before-login');
      const afterLogin = createNativePendingInvitationStore();
      await expect(afterLogin.get()).resolves.toBe('invitation-before-login');
      await afterLogin.clear();
      await expect(afterLogin.get()).resolves.toBeNull();
    } finally {
      jest.mocked(SecureStore.setItemAsync).mockImplementation(originalSet);
    }
  });

  test('degrades gracefully when SecureStore cannot persist pending invitation state', async () => {
    jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(
      new Error('SecureStore unavailable'),
    );
    const store = createNativePendingInvitationStore();

    await expect(store.set('pending-token')).resolves.toBeUndefined();

    jest.mocked(SecureStore.deleteItemAsync).mockRejectedValueOnce(
      new Error('SecureStore unavailable'),
    );
    await expect(store.clear()).resolves.toBeUndefined();
  });
});
