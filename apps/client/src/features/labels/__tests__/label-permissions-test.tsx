import { render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LabelsIndexRoute from '../../../../app/(protected)/households/[id]/labels/index';
import { canManageLabels } from '../label-permissions';
import { MuchakuchaThemeProvider } from '../../../ui/primitives';

const mockListLabels = jest.fn();
const mockRole = { current: 'MEMBER' as 'OWNER' | 'ADMIN' | 'MEMBER' };

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'household-1' }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = jest.requireActual<typeof import('react')>('react');
    React.useEffect(effect, [effect]);
  },
}));

jest.mock('../../auth/session-runtime', () => ({
  sessionApiClient: {
    listLabels: (...args: unknown[]) => mockListLabels(...args),
  },
  sessionTransport: {
    getAccessToken: () => Promise.resolve('access-token'),
  },
}));

jest.mock('../../households/household-context', () => ({
  useHouseholdContext: () => ({
    viewState: 'ready',
    households: [{
      id: 'household-1',
      name: '家',
      role: mockRole.current,
      memberCount: 2,
      ownerMembershipId: 'membership-1',
    }],
    currentHouseholdId: 'household-1',
    accessChangedHouseholdName: undefined,
    refreshHouseholds: jest.fn(),
    switchHousehold: jest.fn(),
    enterAccessChanged: jest.fn(),
    resolve: jest.fn(),
  }),
}));

function renderRoute() {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}>
      <MuchakuchaThemeProvider>
        <LabelsIndexRoute />
      </MuchakuchaThemeProvider>
    </SafeAreaProvider>,
  );
}

async function renderAs(actorRole: 'OWNER' | 'ADMIN' | 'MEMBER', labels = [
  { id: 'label-1', name: '采购', color: '#B94736', createdAt: new Date().toISOString() },
]) {
  mockRole.current = actorRole;
  mockListLabels.mockResolvedValue({ labels });
  const view = renderRoute();
  await waitFor(() => expect(mockListLabels).toHaveBeenCalled());
  return view;
}

beforeEach(() => {
  mockListLabels.mockReset();
});

describe('canManageLabels', () => {
  test('grants an owner and an admin, denies a member', () => {
    expect(canManageLabels('OWNER')).toBe(true);
    expect(canManageLabels('ADMIN')).toBe(true);
    expect(canManageLabels('MEMBER')).toBe(false);
  });

  test('denies an unresolved role so no action is offered before membership is known', () => {
    expect(canManageLabels(undefined)).toBe(false);
  });
});

describe('labels screen offers only the actions the API will accept', () => {
  test.each(['OWNER', 'ADMIN'] as const)('%s sees create, edit, and delete', async (actorRole) => {
    const { getByLabelText, queryByText } = await renderAs(actorRole);

    expect(queryByText('创建新标签')).not.toBeNull();
    expect(getByLabelText('创建标签')).toBeTruthy();
    await waitFor(() => expect(getByLabelText('编辑标签 采购')).toBeTruthy());
    expect(getByLabelText('删除标签 采购')).toBeTruthy();
  });

  test('MEMBER sees the labels but no mutation entry point', async () => {
    const { queryByLabelText, queryByText } = await renderAs('MEMBER');

    // The list stays readable: members use labels on events and tasks even
    // though they cannot maintain the label set.
    await waitFor(() => expect(queryByText('采购')).not.toBeNull());

    expect(queryByText('创建新标签')).toBeNull();
    expect(queryByLabelText('创建标签')).toBeNull();
    expect(queryByLabelText('编辑标签 采购')).toBeNull();
    expect(queryByLabelText('删除标签 采购')).toBeNull();
  });

  test('MEMBER is told why, rather than shown a page that looks broken', async () => {
    const { queryByText } = await renderAs('MEMBER');

    expect(queryByText(/标签由家主和管理员维护/)).not.toBeNull();
  });

  test('empty list does not point a MEMBER at a form they cannot see', async () => {
    const { queryByText } = await renderAs('MEMBER', []);

    await waitFor(() => expect(queryByText(/还没有标签/)).not.toBeNull());
    expect(queryByText(/使用上方表单创建标签/)).toBeNull();
    expect(queryByText(/等家主或管理员创建后/)).not.toBeNull();
  });
});
