import type { ListMyHouseholdsItemDto } from '@muchakucha/api-client';
import { act, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import type { CurrentHouseholdStore } from '../../../platform/household/current-household';
import type { HouseholdApi } from '../household-api';
import {
  createHouseholdProvider,
  type HouseholdContextValue,
  useHouseholdContext,
} from '../household-context';

const alpha: ListMyHouseholdsItemDto = {
  id: 'household-a',
  name: 'Alpha',
  role: 'MEMBER',
  memberCount: 2,
  ownerMembershipId: 'membership-owner-a',
};
const beta: ListMyHouseholdsItemDto = {
  id: 'household-b',
  name: 'Beta',
  role: 'ADMIN',
  memberCount: 3,
  ownerMembershipId: 'membership-owner-b',
};

function createStore(): CurrentHouseholdStore & {
  hydrate: jest.Mock<Promise<void>, []>;
  clearHouseholdData: jest.Mock<Promise<void>, [string]>;
} {
  let currentId: string | null = 'household-b';
  let timestamps: Record<string, number> = {
    'household-a': 100,
    'household-b': 200,
  };
  return {
    hydrate: jest.fn(async () => undefined),
    getCurrentId: () => currentId,
    setCurrentId: jest.fn(async (id: string) => {
      currentId = id;
    }),
    getAccessTimestamps: () => timestamps,
    setAccessTimestamps: jest.fn(async (next: Record<string, number>) => {
      timestamps = next;
    }),
    clearCurrentId: jest.fn(async () => {
      currentId = null;
    }),
    clearHouseholdData: jest.fn(async (householdId: string) => {
      delete timestamps[householdId];
      if (currentId === householdId) currentId = null;
    }),
    clearAll: jest.fn(async () => {
      currentId = null;
      timestamps = {};
    }),
  };
}

describe('HouseholdProvider recovery state machine', () => {
  test('a failed initial request without cached membership is not an empty household result', async () => {
    const store = createStore();
    await store.clearAll();
    const api = { listMyHouseholds: jest.fn().mockRejectedValue(new Error('offline')) } as unknown as HouseholdApi;
    const Provider = createHouseholdProvider(api, () => 'access-token', store);
    function Probe() { return <Text>{useHouseholdContext().viewState}</Text>; }
    const view = await render(<Provider><Probe /></Provider>);
    expect(await view.findByText('offlineRetained')).toBeTruthy();
    expect(view.queryByText('noHousehold')).toBeNull();
  });

  test('refresh selects a newly created household from the fresh membership response', async () => {
    const store = createStore();
    const api = { listMyHouseholds: jest.fn().mockResolvedValueOnce([alpha]).mockResolvedValueOnce([alpha, beta]) } as unknown as HouseholdApi;
    const Provider = createHouseholdProvider(api, () => 'access-token', store);
    let context: HouseholdContextValue | undefined;
    function Probe() { context = useHouseholdContext(); return <Text>{context.currentHouseholdId}</Text>; }
    const view = await render(<Provider><Probe /></Provider>);
    await view.findByText(alpha.id);
    await act(async () => { expect(await context!.refreshHouseholds(beta.id)).toBe(true); });
    expect(view.getByText(beta.id)).toBeTruthy();
    expect(store.getCurrentId()).toBe(beta.id);
  });

  test('hydrates before resolution and reaches accessChanged when a switch target disappeared', async () => {
    const store = createStore();
    const listMyHouseholds = jest
      .fn()
      .mockImplementationOnce(async () => {
        expect(store.hydrate).toHaveBeenCalledTimes(1);
        return [alpha, beta];
      })
      .mockResolvedValueOnce([beta]);
    const api = { listMyHouseholds } as unknown as HouseholdApi;
    const Provider = createHouseholdProvider(api, () => 'access-token', store);
    let current: HouseholdContextValue | undefined;

    function Probe() {
      current = useHouseholdContext();
      return <Text>{current.viewState}</Text>;
    }

    const view = await render(
      <Provider>
        <Probe />
      </Provider>,
    );

    await waitFor(() => expect(view.getByText('ready')).toBeTruthy());
    expect(current?.currentHouseholdId).toBe('household-b');

    await act(async () => {
      await current?.switchHousehold('household-a');
    });

    await waitFor(() => expect(view.getByText('accessChanged')).toBeTruthy());
    expect(current?.currentHouseholdId).toBeNull();
    expect(current?.accessChangedHouseholdName).toBe('Alpha');
    expect(store.clearHouseholdData).toHaveBeenCalledWith('household-a');
  });
});
