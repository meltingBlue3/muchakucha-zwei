import { ApiClientError, type LabelNamesDto, type LabelResponseDto } from '@muchakucha/api-client';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setLanguageChoice } from '../../../i18n';
import LabelsIndexRoute from '../../../../app/(protected)/households/[id]/labels/index';
import { canManageLabels } from '../label-permissions';
import { MuchakuchaThemeProvider } from '../../../ui/primitives';

const mockListLabels = jest.fn();
const mockUpdateLabel = jest.fn();
const mockDeleteLabel = jest.fn();
const mockRole = { current: 'MEMBER' as 'OWNER' | 'ADMIN' | 'MEMBER' };

jest.mock('expo-router', () => ({ usePathname: () => '/',
  useLocalSearchParams: () => ({ id: 'household-1' }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = jest.requireActual<typeof import('react')>('react');
    React.useEffect(effect, [effect]);
  },
}));

jest.mock('../../auth/session-runtime', () => ({
  sessionStateStore: jest.requireActual('../../auth/session-state').createSessionStateStore(),
  sessionApiClient: {
    listLabels: (...args: unknown[]) => mockListLabels(...args),
    updateLabel: (...args: unknown[]) => mockUpdateLabel(...args),
    deleteLabel: (...args: unknown[]) => mockDeleteLabel(...args),
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
    rememberHousehold: jest.fn(),
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

async function renderAs(
  actorRole: 'OWNER' | 'ADMIN' | 'MEMBER',
  labels: Array<{
    id: string;
    householdId?: string;
    name: string;
    color: string;
    systemKey: LabelResponseDto['systemKey'];
    localizedNames: LabelNamesDto | null;
    createdBy?: string;
    createdAt: string;
    usage?: { events: number; tasks: number; notes?: number };
  }> = [
    { id: 'label-1', name: '采购', color: '#B94736', systemKey: null, localizedNames: null, createdAt: new Date().toISOString() },
  ],
) {
  mockRole.current = actorRole;
  mockListLabels.mockResolvedValue({ labels });
  const view = await renderRoute();
  await waitFor(() => expect(mockListLabels).toHaveBeenCalled());
  return view;
}

beforeEach(() => {
  mockListLabels.mockReset();
  mockUpdateLabel.mockReset();
  mockDeleteLabel.mockReset();
});

afterEach(async () => {
  await act(async () => { setLanguageChoice('system'); });
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
    const { getByLabelText } = await renderAs(actorRole);

    expect(getByLabelText('创建标签')).toBeTruthy();
    await waitFor(() => expect(getByLabelText('更多操作：标签 采购')).toBeTruthy());
  });

  test('MEMBER sees the labels but no mutation entry point', async () => {
    const { queryByLabelText, queryByText } = await renderAs('MEMBER');

    // The list stays readable: members use labels on events and tasks even
    // though they cannot maintain the label set.
    await waitFor(() => expect(queryByText('采购')).not.toBeNull());

    expect(queryByLabelText('创建标签')).toBeNull();
    expect(queryByLabelText('更多操作：标签 采购')).toBeNull();
    expect(queryByLabelText('删除标签 采购')).toBeNull();
  });

  test('MEMBER is told why, rather than shown a page that looks broken', async () => {
    const { queryByText } = await renderAs('MEMBER');

    expect(queryByText(/标签由所有者和管理员维护/)).not.toBeNull();
  });

  test('empty list does not point a MEMBER at a form they cannot see', async () => {
    const { queryByText } = await renderAs('MEMBER', []);

    await waitFor(() => expect(queryByText(/还没有标签/)).not.toBeNull());
    expect(queryByText(/使用上方表单创建标签/)).toBeNull();
    expect(queryByText(/所有者或管理员创建后/)).not.toBeNull();
  });
});

describe('editing a label someone else has just changed', () => {
  test('shows its current name, keeps what was typed, and saves against the new version', async () => {
    const original = { id: 'label-1', householdId: 'household-1', name: '采购', color: '#B5562F', systemKey: null, localizedNames: null, createdBy: 'owner', createdAt: '2026-11-01T00:00:00.000Z' };
    const renamed = { ...original, name: '买菜' };
    mockUpdateLabel
      .mockRejectedValueOnce(new ApiClientError(409, { error: { code: 'EDIT_CONFLICT' } }))
      .mockResolvedValueOnce({ ...renamed, name: '日用品' });
    const view = await renderAs('OWNER', [original]);
    mockListLabels.mockResolvedValue({ labels: [renamed] });

    await fireEvent.press(await view.findByLabelText('更多操作：标签 采购'));
    await fireEvent.press(view.getByRole('menuitem', { name: '编辑标签 采购' }));
    await fireEvent.changeText(await view.findByLabelText('编辑标签名称'), '日用品');
    await fireEvent.press(view.getByRole('button', { name: '保存' }));

    await view.findByText('这个标签刚被改成了「买菜」。你填写的内容还在，再保存一次会覆盖这次修改。');
    expect(view.getByLabelText('编辑标签名称').props.value).toBe('日用品');
    expect(mockUpdateLabel).toHaveBeenLastCalledWith('access-token', 'household-1', 'label-1', { name: '日用品', color: '#B5562F', expectedName: '采购', expectedColor: '#B5562F' });

    await fireEvent.press(view.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(mockUpdateLabel).toHaveBeenCalledTimes(2));
    expect(mockUpdateLabel).toHaveBeenLastCalledWith('access-token', 'household-1', 'label-1', { name: '日用品', color: '#B5562F', expectedName: '买菜', expectedColor: '#B5562F' });
  });
});

describe('editing a label whose colour is not one of the presets', () => {
  test('offers that colour, already chosen, beside the presets', async () => {
    const view = await renderAs('OWNER', [{ id: 'label-1', name: '采购', color: '#EF4444', systemKey: null, localizedNames: null, createdAt: '2026-11-01T00:00:00.000Z' }]);

    await fireEvent.press(await view.findByLabelText('更多操作：标签 采购'));
    await fireEvent.press(view.getByRole('menuitem', { name: '编辑标签 采购' }));

    expect(await view.findByRole('radio', { name: '选择颜色 #EF4444', checked: true })).toBeTruthy();
    expect(view.getByRole('radio', { name: '选择颜色 #B5562F', checked: false })).toBeTruthy();
  });

  test('matches a preset written in lower case', async () => {
    const view = await renderAs('OWNER', [{ id: 'label-1', name: '采购', color: '#b5562f', systemKey: null, localizedNames: null, createdAt: '2026-11-01T00:00:00.000Z' }]);

    await fireEvent.press(await view.findByLabelText('更多操作：标签 采购'));
    await fireEvent.press(view.getByRole('menuitem', { name: '编辑标签 采购' }));

    expect(await view.findByRole('radio', { name: '选择颜色 #B5562F', checked: true })).toBeTruthy();
    expect(view.queryByRole('radio', { name: '选择颜色 #b5562f' })).toBeNull();
  });
});

describe('how much each label is used', () => {
  const used = { id: 'label-1', name: '采购', color: '#B5562F', systemKey: null, localizedNames: null, createdAt: '2026-11-01T00:00:00.000Z', usage: { events: 2, tasks: 1, notes: 0 } };
  const unused = { id: 'label-2', name: '闲置', color: '#2C716C', systemKey: null, localizedNames: null, createdAt: '2026-11-01T00:00:00.000Z', usage: { events: 0, tasks: 0, notes: 0 } };

  const onNotes = { id: 'label-3', name: '学校', color: '#3B7DD8', systemKey: null, localizedNames: null, createdAt: '2026-11-01T00:00:00.000Z', usage: { events: 0, tasks: 0, notes: 3 } };
  // A server from before notes had labels sends no note count.
  const older = { id: 'label-4', name: '旧版', color: '#4C7537', systemKey: null, localizedNames: null, createdAt: '2026-11-01T00:00:00.000Z', usage: { events: 1, tasks: 0 } };

  test('each row says how many events, tasks and notes carry the label', async () => {
    const view = await renderAs('MEMBER', [{ ...used, usage: { events: 2, tasks: 1, notes: 4 } }, unused, onNotes, older]);

    expect(await view.findByText('2 个日程 · 1 个任务 · 4 篇笔记')).toBeTruthy();
    expect(view.getByText('3 篇笔记')).toBeTruthy();
    expect(view.getByText('1 个日程')).toBeTruthy();
    expect(view.getByText('未使用')).toBeTruthy();
  });

  test('deleting a used label says what it will be removed from', async () => {
    const view = await renderAs('OWNER', [used, unused]);

    await fireEvent.press(await view.findByLabelText('更多操作：标签 采购'));
    await fireEvent.press(view.getByRole('menuitem', { name: '删除标签 采购' }));

    expect(await view.findByText('删除“采购”后，它会从 2 个日程和 1 个任务中移除，日程、任务和笔记本身会保留。')).toBeTruthy();
  });

  test('deleting a label used on notes counts them and keeps the notes', async () => {
    const view = await renderAs('OWNER', [{ ...used, usage: { events: 2, tasks: 1, notes: 3 } }, onNotes]);

    await fireEvent.press(await view.findByLabelText('更多操作：标签 采购'));
    await fireEvent.press(view.getByRole('menuitem', { name: '删除标签 采购' }));
    expect(await view.findByText('删除“采购”后，它会从 2 个日程、1 个任务和 3 篇笔记中移除，日程、任务和笔记本身会保留。')).toBeTruthy();
  });

  test('a label only on notes is not called unused', async () => {
    const view = await renderAs('OWNER', [onNotes]);

    await fireEvent.press(await view.findByLabelText('更多操作：标签 学校'));
    await fireEvent.press(view.getByRole('menuitem', { name: '删除标签 学校' }));
    expect(await view.findByText('删除“学校”后，它会从 3 篇笔记中移除，日程、任务和笔记本身会保留。')).toBeTruthy();
  });

  test('deleting an unused label says nothing else changes', async () => {
    const view = await renderAs('OWNER', [used, unused]);

    await fireEvent.press(await view.findByLabelText('更多操作：标签 闲置'));
    await fireEvent.press(view.getByRole('menuitem', { name: '删除标签 闲置' }));

    expect(await view.findByText('“闲置”没有用在任何日程、任务或笔记上，删除后不影响其他内容。')).toBeTruthy();
  });
});

describe('deleting an unrenamed starter label in Japanese', () => {
  test('uses the Japanese name in the confirmation control while sending the API snapshot name', async () => {
    await act(async () => { setLanguageChoice('ja'); });
    mockDeleteLabel.mockResolvedValueOnce(undefined);
    const view = await renderAs('OWNER', [{
      id: 'label-bday', name: '生日', color: '#AD4067', systemKey: 'birthday',
      localizedNames: { zh: '生日', ja: '誕生日' }, createdAt: '2026-11-01T00:00:00.000Z',
      usage: { events: 0, tasks: 0, notes: 0 },
    }]);

    await fireEvent.press(await view.findByLabelText('ラベル 誕生日の操作メニュー'));
    await fireEvent.press(view.getByRole('menuitem', { name: 'ラベル「誕生日」を削除' }));

    const confirm = await view.findByLabelText('ラベルを削除：誕生日');
    expect(view.queryByLabelText('ラベルを削除：生日')).toBeNull();

    await fireEvent.press(confirm);
    await waitFor(() => expect(mockDeleteLabel).toHaveBeenCalledWith(
      'access-token', 'household-1', 'label-bday', { expectedName: '生日', expectedColor: '#AD4067' },
    ));
  });
});
