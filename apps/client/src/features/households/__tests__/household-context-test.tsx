import { draftWorkspace } from '../../../ui/workspace-runtime';
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

  test('a household opened by link or refresh becomes the remembered one without a refetch', async () => {
    const store = createStore();
    const api = { listMyHouseholds: jest.fn().mockResolvedValue([alpha, beta]) } as unknown as HouseholdApi;
    const Provider = createHouseholdProvider(api, () => 'access-token', store);
    let context: HouseholdContextValue | undefined;
    function Probe() { context = useHouseholdContext(); return <Text>{context.currentHouseholdId}</Text>; }
    const view = await render(<Provider><Probe /></Provider>);
    await view.findByText(beta.id);
    await act(async () => { context!.rememberHousehold(alpha.id); });
    expect(view.getByText(alpha.id)).toBeTruthy();
    expect(context!.viewState).toBe('ready');
    expect(context!.households.map((household) => household.id)).toEqual([alpha.id, beta.id]);
    await waitFor(() => expect(store.getCurrentId()).toBe(alpha.id));
    expect(store.getAccessTimestamps()[alpha.id]).toBeGreaterThan(200);
    expect(api.listMyHouseholds).toHaveBeenCalledTimes(1);
    // A household this account has not joined is left to the page to report.
    await act(async () => { context!.rememberHousehold('household-x'); });
    expect(store.getCurrentId()).toBe(alpha.id);
  });

  test('a confirmed rename reaches the household list without refetching or leaving ready', async () => {
    const store = createStore();
    const api = { listMyHouseholds: jest.fn().mockResolvedValue([alpha, beta]) } as unknown as HouseholdApi;
    const Provider = createHouseholdProvider(api, () => 'access-token', store);
    let context: HouseholdContextValue | undefined;
    function Probe() { context = useHouseholdContext(); return <Text>{`${context.viewState}:${context.households.map(h => h.name).join(',')}`}</Text>; }
    const view = await render(<Provider><Probe /></Provider>);
    await view.findByText(/^ready:/);
    await act(async () => { context!.applyHouseholdName(beta.id, 'Gamma'); });
    expect(view.getByText(/^ready:/).props.children).toMatch(/Alpha/);
    expect(view.getByText(/^ready:/).props.children).toMatch(/Gamma/);
    expect(view.queryByText(/Beta/)).toBeNull();
    expect(api.listMyHouseholds).toHaveBeenCalledTimes(1);
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


test('access loss uses the explicit household rather than the previously selected household', async () => {
  const store = createStore();
  const api = { listMyHouseholds: jest.fn().mockResolvedValue([alpha, beta]) } as unknown as HouseholdApi;
  const Provider = createHouseholdProvider(api, () => 'access-token', store);
  let context: HouseholdContextValue | undefined;
  function Probe() { context = useHouseholdContext(); return <Text>{context.viewState}</Text>; }
  draftWorkspace.activateAccount('draft-cleanup-test');
  try {
    const view = await render(<Provider><Probe /></Provider>);
    await view.findByText('ready');
    draftWorkspace.set(`draft:${alpha.id}:notes:new:form`, { title: 'lost', body: '' });
    draftWorkspace.set(`draft:${beta.id}:notes:new:form`, { title: 'retained', body: '' });
    await act(async () => { context!.enterAccessChanged(alpha.name, alpha.id); });
    expect(store.clearHouseholdData).toHaveBeenCalledWith(alpha.id);
    expect(draftWorkspace.get(`draft:${alpha.id}:notes:new:form`)).toBeUndefined();
    expect(draftWorkspace.get(`draft:${beta.id}:notes:new:form`)).toEqual({ title: 'retained', body: '' });
    draftWorkspace.set(`draft:${alpha.id}:notes:new:form`, { title: 'late update', body: '' });
    expect(draftWorkspace.get(`draft:${alpha.id}:notes:new:form`)).toBeUndefined();
  } finally { draftWorkspace.endSession(); }
});
